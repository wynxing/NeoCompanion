// Spike: 验证 node:sqlite 迁移可行性（不改生产代码）。
// 运行: node scripts/spike-node-sqlite.mjs
//
// 验证项:
//   1. Node 版本与 node:sqlite 可用性
//   2. FTS5（trigram tokenizer，CJK）可用性
//   3. sqlite-vec 加载 + vec0 虚拟表 + KNN 查询
//   4. 已清除旧 ORM/驱动依赖
//   5. transaction shim 原型（BEGIN/COMMIT/ROLLBACK + SAVEPOINT 嵌套）

import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "?";
  console.log(`${icon} [${status}] ${name}${detail ? " — " + detail : ""}`);
}

// ── 1. Node 版本与 node:sqlite ──
try {
  const version = process.version;
  const major = Number(version.slice(1).split(".")[0]);
  if (major >= 24) {
    record("node:sqlite 可用性", "PASS", `${version} — DatabaseSync 导入成功`);
  } else {
    record("node:sqlite 可用性", "FAIL", `${version} — 项目要求 Node >= 24`);
  }
} catch (e) {
  record("node:sqlite 可用性", "FAIL", e.message);
}

// ── 2. FTS5（trigram，CJK） ──
// 注意：trigram tokenizer 要求查询词 ≥3 字符（中文按 Unicode 码点计）。
// 2 字中文词（如"向量"）无法 MATCH，需走 LIKE fallback —— 这是已知行为，
// 与项目代码 searchFts 的 useMatch 判断一致。测试用 3+ 字中文词。
try {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  // 确认 FTS5 编译选项
  const opts = db.prepare("PRAGMA compile_options").all();
  const fts5Enabled = opts.some((o) => /ENABLE_FTS5/i.test(o.compile_options));
  if (!fts5Enabled) {
    record("FTS5 trigram（CJK）", "FAIL", "FTS5 未编译进 node:sqlite（无 ENABLE_FTS5）");
    db.close();
  } else {
    db.exec("CREATE VIRTUAL TABLE docs USING fts5(content, tokenize='trigram')");
    db.prepare("INSERT INTO docs (content) VALUES (?)").run("向量检索是知识库的核心能力");
    db.prepare("INSERT INTO docs (content) VALUES (?)").run("今天天气不错");
    // 3 字中文词 → trigram 可 MATCH
    const rows = db.prepare("SELECT content FROM docs WHERE content MATCH ? ORDER BY rank").all("向量检");
    if (rows.length === 1 && rows[0].content.includes("向量")) {
      record("FTS5 trigram（CJK）", "PASS", `ENABLE_FTS5=yes, MATCH 命中（3字词）`);
    } else {
      record("FTS5 trigram（CJK）", "FAIL", `期望 1 行命中，实际 ${rows.length} 行: ${JSON.stringify(rows)}`);
    }
    db.close();
  }
} catch (e) {
  record("FTS5 trigram（CJK）", "FAIL", e.message);
}

// ── 3. sqlite-vec 加载 + vec0 + KNN ──
try {
  // 定位 sqlite-vec 包（项目通过 pnpm 安装在 packages/db 的 node_modules）
  const sqliteVecPath = require.resolve("sqlite-vec", { paths: [join(process.cwd(), "packages/db")] });
  const sqliteVec = require(sqliteVecPath);
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  sqliteVec.load(db);
  const ver = db.prepare("SELECT vec_version() AS v").get().v;
  db.exec(`CREATE VIRTUAL TABLE vec_test USING vec0(id TEXT PRIMARY KEY, embedding FLOAT[4])`);
  const buf = (vec) => Buffer.from(new Float32Array(vec).buffer);
  db.prepare("INSERT INTO vec_test (id, embedding) VALUES (?, ?)").run("a", buf([1.0, 0.0, 0.0, 0.0]));
  db.prepare("INSERT INTO vec_test (id, embedding) VALUES (?, ?)").run("b", buf([0.0, 1.0, 0.0, 0.0]));
  const knn = db.prepare("SELECT id, distance FROM vec_test WHERE embedding MATCH ? AND k = ? ORDER BY distance").all(buf([1.0, 0.1, 0.0, 0.0]), 2);
  if (knn.length === 2 && knn[0].id === "a") {
    record("sqlite-vec 加载 + KNN", "PASS", `vec_version=${ver}, 最近邻=${knn[0].id}(dist=${knn[0].distance.toFixed(3)})`);
  } else {
    record("sqlite-vec 加载 + KNN", "FAIL", `KNN 结果异常: ${JSON.stringify(knn)}`);
  }
  db.close();
} catch (e) {
  record("sqlite-vec 加载 + KNN", "FAIL", e.message);
}

// ── 4. 旧 ORM/驱动依赖清理 ──
try {
  require.resolve("drizzle-orm", { paths: [join(process.cwd(), "packages/db")] });
  record("旧 ORM/驱动依赖清理", "FAIL", "packages/db 仍可解析 drizzle-orm");
} catch {
  try {
    require.resolve("better-sqlite3", { paths: [join(process.cwd(), "packages/db")] });
    record("旧 ORM/驱动依赖清理", "FAIL", "packages/db 仍可解析 better-sqlite3");
  } catch {
    record("旧 ORM/驱动依赖清理", "PASS", "drizzle-orm 与 better-sqlite3 均不可解析");
  }
}

// ── 5. transaction shim 原型 ──
try {
  const db = new DatabaseSync(":memory:", { allowExtension: true });
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  let depth = 0;
  function withTransaction(fn) {
    const savepoint = depth === 0 ? null : `sp_${depth}`;
    if (savepoint) db.exec(`SAVEPOINT ${savepoint}`);
    else db.exec("BEGIN");
    depth++;
    try {
      const result = fn();
      if (savepoint) db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      else db.exec("COMMIT");
      return result;
    } catch (e) {
      if (savepoint) {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      } else db.exec("ROLLBACK");
      throw e;
    } finally {
      depth--;
    }
  }
  // 嵌套调用测试
  withTransaction(() => {
    db.prepare("INSERT INTO t (v) VALUES (?)").run("outer");
    withTransaction(() => {
      db.prepare("INSERT INTO t (v) VALUES (?)").run("inner");
    });
  });
  const count = db.prepare("SELECT COUNT(*) AS n FROM t").get().n;
  if (count === 2) {
    record("transaction shim（嵌套）", "PASS", "外层+内层各插入 1 行，共 2 行");
  } else {
    record("transaction shim（嵌套）", "FAIL", `期望 2 行，实际 ${count} 行`);
  }
  // 回滚测试
  let threw = false;
  try {
    withTransaction(() => {
      db.prepare("INSERT INTO t (v) VALUES (?)").run("will-rollback");
      throw new Error("intentional");
    });
  } catch {
    threw = true;
  }
  const countAfterRollback = db.prepare("SELECT COUNT(*) AS n FROM t").get().n;
  if (threw && countAfterRollback === 2) {
    console.log(`  ↳ 回滚测试通过：异常后行数仍为 ${countAfterRollback}`);
  } else {
    record("transaction shim（回滚）", "FAIL", `回滚异常: threw=${threw}, 行数=${countAfterRollback}`);
  }
  db.close();
} catch (e) {
  record("transaction shim", "FAIL", e.message);
}

// ── 汇总 ──
console.log("\n=== Spike 汇总 ===");
const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.filter((r) => r.status === "FAIL").length;
console.log(`PASS: ${pass} / FAIL: ${fail} / 总计: ${results.length}`);
if (fail === 0) {
  console.log("结论: 全部通过 — node:sqlite 迁移与旧依赖清理验证完成");
} else {
  console.log("结论: 存在失败项 — 见上方详情");
}
process.exit(fail === 0 ? 0 : 1);
