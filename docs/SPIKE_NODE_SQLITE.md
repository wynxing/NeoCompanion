# Spike: node:sqlite 迁移可行性验证

- **日期**: 2026-06-22
- **环境**: Windows 10 (win32 x64), Node v24.14.0
- **脚本**: `scripts/spike-node-sqlite.mjs`
- **目的**: 验证 `better-sqlite3` → `node:sqlite` 迁移的可行性，为 SEA 打包扫清障碍

## 背景

`ARCHITECTURE.md` §6.4 设计 sidecar 用 Node.js SEA 打包分发，但 SEA 无法装载原生 `.node` 插件（如 `better-sqlite3`），需迁移到内置的 `node:sqlite`。本 spike 验证 5 个未知项。

## 验证结果

| # | 验证项 | 结果 | 详情 |
|---|--------|------|------|
| 1 | node:sqlite 可用性 | ✅ PASS | Node v24.14.0，`DatabaseSync` 导入成功（有 experimental 警告） |
| 2 | FTS5（trigram，CJK） | ✅ PASS | `ENABLE_FTS5` 编译选项已启用；trigram tokenizer 可创建；3字中文词 MATCH 命中 |
| 3 | sqlite-vec 加载 + KNN | ✅ PASS | `sqlite-vec@0.1.9` 经 `loadExtension` 加载成功；vec0 虚拟表创建 + KNN 查询正确返回最近邻 |
| 4 | 旧 ORM/驱动依赖清理 | ✅ PASS | `drizzle-orm` 与 `better-sqlite3` 均已不可解析 |
| 5 | transaction shim（嵌套+回滚） | ✅ PASS | 手写 `BEGIN/COMMIT/ROLLBACK` + `SAVEPOINT` 嵌套方案可行 |

### 关键发现

**1. FTS5 在 Windows 的 node:sqlite 中可用**

- `PRAGMA compile_options` 确认 `ENABLE_FTS5` 已编译进 Node 内置 SQLite。
- trigram tokenizer 可正常创建和查询。
- 注意：trigram tokenizer 要求查询词 ≥3 字符（按 Unicode 码点），2字中文词（如"向量"）无法 MATCH，需走 LIKE fallback —— 这与项目现有 `searchFts` 的 `useMatch` 逻辑一致（`packages/db/src/index.ts`）。

**2. sqlite-vec 与 node:sqlite 兼容**

- `sqlite-vec` 的 `load(db)` 仅要求 db 对象有 `loadExtension(path)` 方法，`DatabaseSync` 满足。
- 关键前提：构造时必须传 `{ allowExtension: true }`，否则 `loadExtension` 抛异常。
- 平台二进制（`sqlite-vec-windows-x64`）是 `.dll` 而非 `.node`，可作为 loose asset 随 SEA 分发。

**3. Drizzle node-sqlite driver 尚未进入稳定版**

- 当前 npm 稳定版 `drizzle-orm@0.45.2` **没有** `node-sqlite` driver（目录和 exports 均无）。
- 经查 `drizzle-orm@1.0.0-rc.4-5d5b77c`（rc 通道）**已包含**完整 `node-sqlite` driver（`driver.js`/`session.js`/`migrator.js`）。
- 如果坚持保留 ORM，迁移需使用 `1.0.0-rc.*` 通道；本项目最终选择直接使用参数化 SQL，避免引入该预发布依赖。

**4. transaction API 差异可填补**

- `node:sqlite` 的 `DatabaseSync` 没有 `.transaction()` 方法（better-sqlite3 有）。
- 项目有 8 处 `sqlite.transaction(fn)()` 调用，可用手写 `withTransaction(db, fn)` shim（BEGIN/COMMIT/ROLLBACK + SAVEPOINT 嵌套）替代，spike 已验证可行。

## 结论

### 已选择直接使用 node:sqlite

| 维度 | 状态 |
|------|------|
| node:sqlite 运行时 | ✅ 可用（项目固定 Node 24+） |
| FTS5 | ✅ 可用（ENABLE_FTS5 已编译） |
| sqlite-vec | ✅ 兼容（需 `{ allowExtension: true }`） |
| transaction 重写 | ✅ 已使用 SAVEPOINT 支持嵌套与局部回滚 |
| 旧 ORM/驱动 | ✅ 已清除 |

### 已采用方案

- 数据库 store 直接使用参数化 SQL 和内部行类型，不引入预发布 ORM。
- 数据库连接启用 WAL、外键、5 秒 busy timeout 和扩展加载。
- 事务统一使用 `BEGIN` / `SAVEPOINT` / `ROLLBACK TO`，支持镜像导入触发索引重建时的嵌套调用。
- `sqlite-vec` 的平台 `.dll` / `.so` / `.dylib` 仍需作为 SEA loose asset 分发；本次迁移不等于完成生产 sidecar 打包。

## 复现

```bash
node scripts/spike-node-sqlite.mjs
```

预期输出：5 PASS / 0 FAIL。
