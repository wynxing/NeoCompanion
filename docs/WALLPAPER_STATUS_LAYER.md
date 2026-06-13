# NeoCompanion 壁纸层状态显示设计文档

## Document Header

- **Title**: NeoCompanion Wallpaper Status Layer Design
- **Owner**: Product & Engineering
- **Status**: Draft
- **Version**: 0.1
- **Created**: 2026-06-12
- **Related Docs**:
  - [`ARCHITECTURE.md`](./ARCHITECTURE.md)
  - [`PRD_overview.md`](./PRD_overview.md)
  - [`具体能力构思.md`](./具体能力构思.md)

---

## 1. 背景与动机

### 1.1 当前问题

NeoCompanion 现有 UI 采用双窗口架构：

- **助手窗口**：320×540，always-on-top，透明悬浮于所有窗口之上
- **Panel 窗口**：944×744，按需弹出

这意味着所有状态信息（专注计时、任务进度、天气时间等）要么挤在小小的助手窗口里，要么需要打开面板才能查看。两者都存在体验问题：

- **悬浮助手窗始终遮挡工作区**——用户在高强度专注时，即便助手窗口很小，它仍然是一个"外来物"而非桌面的一部分
- **状态信息不可一瞥即得**——要看专注计时剩余多少、今天任务完成几项，必须切换到面板
- **与"陪伴"定位矛盾**——真正的陪伴应该像环境一样自然存在，而非时刻索取注意力

### 1.2 设计哲学

本方案引入**壁纸层状态显示**，遵循以下核心原则：

> **壁纸层 = 纯状态显示器。只展示，不交互。所有交互行为由悬浮层和面板承载。**

这一原则来自三层考量：

1. **技术约束**：壁纸层窗口位于桌面图标之下，用户无法可靠点击（被图标遮挡、Z-order 不可控）
2. **体验直觉**：壁纸上的元素应像壁纸本身一样"安静"——你看到它，但你不会想去"点"壁纸
3. **职责清晰**：状态感知归壁纸，交互执行归悬浮层/面板，避免功能边界模糊

### 1.3 理论参考

本方案的设计理念与以下研究/产品方向一致：

| 参考 | 核心思想 | 与本方案的关系 |
|------|---------|--------------|
| **Google "Hidden Interfaces for Ambient Computing"** (CHI 2022) | 界面平时隐入环境材质，需要时才浮现 | 壁纸层元素低透明度常驻，hover 才强化 |
| **INRIA "Discreet Interactive Wallpapers"** (2023) | 环保墨水壁纸上的克制交互设计 | 交互极简化——角标而非按钮 |
| **Seelen UI** (Rust + Tauri 桌面定制套件) | 生产级 Tauri 壁纸 + 桌面小部件方案 | 技术可行性验证 |
| **WinWallpaper** (Tauri v2 + React) | HTML Widget 直接覆在壁纸上 | Widget 系统设计参考 |
| **`tauri-plugin-wallpaper`** | Tauri v2 插件，一行 `attach()` 将窗口嵌入 WorkerW | **直接采用的技术方案** |

---

## 2. 整体架构

### 2.1 三窗口分层模型

在现有双窗口基础上，新增**壁纸窗口**，形成三层架构：

```
┌───────────────────────────────────────────────────┐
│  用户应用窗口 (VS Code, 浏览器, 游戏等)              │  ← 最高层
├───────────────────────────────────────────────────┤
│  助手窗口 (always-on-top, 透明悬浮)                 │  ← 交互入口
│  · 角色形象 · 语音气泡 · 右键菜单                     │
│  · Hook 通知角标 (红点/数字)                         │
│  · "打开面板"按钮                                    │
├───────────────────────────────────────────────────┤
│  桌面图标层 (Explorer 的 SHELLDLL_DefView)          │  ← 系统层
├───────────────────────────────────────────────────┤
│  壁纸窗口 (WorkerW 子窗口, 新增) ★                   │  ← 纯状态显示
│  · 天气时间 · 任务清单 · 专注计时                     │
│  · 助手寄语 · 氛围色调 · 专注统计                     │
├───────────────────────────────────────────────────┤
│  原始壁纸 (系统壁纸 / Wallpaper Engine)              │  ← 最底层
└───────────────────────────────────────────────────┘
```

**关键设计决策**：

- 壁纸窗口通过 `tauri-plugin-wallpaper` 的 `attach()` 嵌入 WorkerW 层
- 壁纸窗口**全屏、透明背景、无装饰**，仅在需要显示的局部区域渲染内容
- 助手窗口保持现有 always-on-top 行为，作为**所有交互的唯一入口**
- 面板窗口保持现有行为，按需弹出，承载**编辑和详细操作**

### 2.2 职责划分

| 层级 | 窗口 | 职责 | 交互性 |
|------|------|------|--------|
| **壁纸层** | Wallpaper Window | 只读状态展示：天气、时间、任务进度、专注计时、助手寄语、氛围色调 | ❌ 无交互（纯展示） |
| **悬浮层** | Assistant Window | 交互入口：角色形象、语音气泡、右键菜单、Hook 角标通知 | ✅ 点击/右键交互 |
| **面板层** | Panel Window | 编辑操作：AI 对话、任务编辑、设置配置、Hook 确认 | ✅ 完整交互 |

### 2.3 数据流

```
Fastify Sidecar
    │
    ├── WebSocket 广播 ──→ Assistant Window (交互事件触发)
    │
    └── WebSocket 广播 ──→ Wallpaper Window (状态数据同步)
                              │
                              └── 只接收，不发送交互事件
                                  (用户操作通过 Pet/Panel 窗口发回)
```

壁纸窗口通过 WebSocket 接收与 助手窗口相同的实时数据推送，但**仅消费状态类消息**，忽略需要交互的消息类型。

---

## 3. 壁纸层 UI 设计

### 3.1 布局方案

壁纸窗口全屏渲染，所有元素通过 CSS absolute/fixed 定位到预设区域。内容之间留出充足间距，确保不与桌面图标重叠过多。

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│    ☁️ 26°C 晴                    14:32 周四           │  ← 顶部：天气 + 时间
│                                                      │
│                                                      │
│                                                      │
│  ☐ 完成项目文档                                         │  ← 左侧：任务清单
│  ☑ 晨间代码审查                                         │     (仅未完成项)
│  ☐ 提交 PR                                            │
│                                                      │
│                                                      │
│                    "保持专注，你正在                               │  ← 中央偏下：助手寄语
│                     做重要的事"                                   │     (淡入淡出)
│                                                      │
│                              ┌───┐                   │
│                              │25 │                   │  ← 右下：专注计时
│                              │min │                   │     (SVG 圆环)
│                              └───┘                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 3.2 各组件详细设计

#### 3.2.1 天气 + 时间（顶部居中偏右）

| 属性 | 规格 |
|------|------|
| 位置 | `top: 3vh; right: 3vw` |
| 内容 | 天气图标 + 温度 + 城市 ┃ 时间 + 日期 + 星期 |
| 字体 | 等宽字体，28–36px，font-weight 200 (极细) |
| 颜色 | `rgba(255,255,255,0.35)` 常态，`rgba(255,255,255,0.65)` hover |
| 更新频率 | 天气每 30min，时间每秒 |
| 动画 | 数字变化时微弱 opacity 闪烁，无位移 |
| 交互 | ❌ 无。点击区域穿透 (`pointer-events: none`) |

设计说明：时间信息是壁纸层最"天然"的元素——用户已习惯在壁纸上看到时钟。天气与之并列，提供环境感知。

#### 3.2.2 任务清单（左侧竖向列表）

| 属性 | 规格 |
|------|------|
| 位置 | `top: 18vh; left: 2vw` |
| 内容 | 仅显示未完成任务，最多 5 项；已完成项不显示 |
| 字体 | 16–18px，font-weight 300 |
| 颜色 | `rgba(255,255,255,0.25)` 常态 |
| 勾选框 | 空心圆 `○`，不提供点击勾选功能 |
| 溢出 | 超过 5 项时末尾显示 `+N 更多...` |
| 动画 | 任务增减时淡入淡出，200ms |
| 交互 | ❌ 无。编辑任务通过面板操作 |

设计说明：任务清单在壁纸上起"提醒"作用——你回到桌面时一瞥便知还有什么没做。但不提供勾选，因为：1) 壁纸层交互不可靠；2) 勾选的满足感应留给面板（完成感需要仪式感）。

#### 3.2.3 专注计时（右下角 SVG 圆环）

| 属性 | 规格 |
|------|------|
| 位置 | `bottom: 5vh; right: 3vw` |
| 尺寸 | 80×80px SVG 圆环 |
| 内容 | 圆环进度 + 中央剩余分钟数 |
| 颜色 | 圆环 `rgba(255,183,77,0.4)` (暖琥珀色)，数字 `rgba(255,255,255,0.5)` |
| 状态 | 未专注时不显示；专注中显示圆环 + 倒计时 |
| 动画 | 圆环 stroke-dashoffset 平滑递减，每秒更新 |
| 交互 | ❌ 无。开始/暂停通过助手右键菜单或面板 |

设计说明：专注计时器是壁纸层最有价值的信息——用户在全屏工作时看不到助手，但切回桌面时能立刻感知剩余时间，无需任何操作。

#### 3.2.4 助手寄语（中央偏下，漂浮文字）

| 属性 | 规格 |
|------|------|
| 位置 | `bottom: 20vh; left: 50%; transform: translateX(-50%)` |
| 内容 | 助手状态反馈语（与现有 `useAssistantState` 的反馈池复用） |
| 字体 | 20–24px，font-weight 300，italic |
| 颜色 | `rgba(255,255,255,0.15)` — 极淡，几乎融入壁纸 |
| 显示 | 每次切换状态时淡入，10s 后淡出 |
| 动画 | fadeIn → 10s hold → fadeOut，各 1s |
| 交互 | ❌ 无 |

设计说明：寄语是"呼吸感"的核心——你未必每次都注意到它，但偶尔余光扫到，会感受到陪伴的存在。极低透明度是刻意的：信息不是给"看"的，是给"感受"的。

#### 3.2.5 氛围色调（全屏覆盖层）

| 属性 | 规格 |
|------|------|
| 位置 | 全屏覆盖 (`position: fixed; inset: 0`) |
| 内容 | 纯色半透明径向渐变叠加层 |
| 颜色映射 | idle: 无叠加 / focus: `rgba(255,183,77,0.04)` 暖光 / warn: `rgba(244,67,54,0.03)` 微红 / sleepy: `rgba(63,81,181,0.04)` 暗蓝 |
| 过渡 | background 3s ease-in-out |
| 交互 | ❌ 无 |

设计说明：氛围色调是最"环境化"的元素——用户甚至不会意识到壁纸颜色在变化，但会直觉地感到"氛围"在改变。这与 Google 研究中"隐入环境材质"的理念一致。

#### 3.2.6 专注统计（右下角，计时环下方）

| 属性 | 规格 |
|------|------|
| 位置 | `bottom: 2vh; right: 3vw` (计时环正下方) |
| 内容 | 今日专注总时长，如 `今日 1h 25min` |
| 字体 | 12px，font-weight 200 |
| 颜色 | `rgba(255,255,255,0.2)` |
| 显示 | 仅在有专注记录时显示 |
| 交互 | ❌ 无。详细统计通过面板查看 |

---

## 4. 悬浮层交互设计

### 4.1 Hook 通知角标

壁纸层不做交互，但用户需要知道"有事发生了"。Hook 通知采用**角标**模式，类似手机 App 的红点/未读数：

| 属性 | 规格 |
|------|------|
| 位置 | 助手形象右上角 |
| 形态 | 红色圆点 (1条未读) / 红色圆点 + 数字 (多条未读) / 隐藏 (无未读) |
| 尺寸 | 圆点 8px / 数字背景 16×16px |
| 颜色 | `#F44336` (Material Red 500) |
| 动画 | 出现时 scale 0→1.2→1 (弹性)，200ms |
| 点击行为 | 打开面板 → 切换到 Hook 确认视图 |

角标的状态机：

```
[隐藏] ──hook:permission推送──→ [显示红点(1)]
   ↑                                │
   │                          hook:permission推送
   │                                ↓
   │                          [显示数字(N)]
   │                                │
   └──── 用户在面板处理完所有 ───────┘
```

设计说明：角标是"轻量提醒"的最佳隐喻——用户日常使用手机时已经形成了"红点=有待处理"的认知模型。不需要在壁纸上做弹窗或通知条，一个红点就够了。

### 4.2 助手右键菜单更新

在现有右键菜单基础上新增"壁纸层控制"项：

```
┌─────────────────────┐
│ ▶ 开始专注           │  ← 已有
│ ＋ 添加任务           │  ← 已有
│ ─────────────────── │
│ ◉ 壁纸状态显示  ✓    │  ← 新增：开关壁纸层
│ ◉ 壁纸氛围色调  ✓    │  ← 新增：开关氛围叠加
│ ─────────────────── │
│ 打开面板             │  ← 已有
└─────────────────────┘
```

### 4.3 助手窗口与壁纸窗口的联动

| 助手窗口事件 | 壁纸窗口响应 |
|-------------|------------|
| 开始专注 | 计时圆环出现，氛围切为暖光 |
| 完成专注 | 计时圆环消失，统计更新 |
| 添加/删除任务 | 任务清单更新 |
| 状态切换 (idle→focus→warn...) | 寄语更新，氛围色调变化 |
| Hook 推送 | 助手角标出现，壁纸层无变化 |

联动通过共享 WebSocket 连接实现，两个窗口接收相同的广播消息，各自按职责消费。

---

## 5. 技术实现方案

### 5.1 壁纸窗口嵌入

采用 [`tauri-plugin-wallpaper`](https://github.com/meslzy/tauri-plugin-wallpaper) 实现窗口嵌入：

```toml
# Cargo.toml
[dependencies]
tauri-plugin-wallpaper = "3"
```

```typescript
// 壁纸窗口初始化
import { attach, detach } from 'tauri-plugin-wallpaper'

// 启动时将壁纸窗口嵌入 WorkerW 层
await attach('wallpaper-window')

// 用户关闭壁纸显示时
await detach('wallpaper-window')
```

**原理**：插件内部通过 Windows WorkerW 技术实现——向 `Progman` 发送 `0x052C` 消息触发 `WorkerW` 窗口创建，再通过 `SetParent` 将目标窗口设为 `WorkerW` 的子窗口，使其位于桌面图标与原始壁纸之间。

### 5.2 Tauri 窗口配置

在 `tauri.conf.json` 中新增壁纸窗口：

```jsonc
{
  "app": {
    "windows": [
      // 1. 助手窗口 (已有)
      {
        "label": "pet",
        "url": "/?view=pet",
        "width": 320,
        "height": 540,
        "transparent": true,
        "decorations": false,
        "alwaysOnTop": true,
        "skipTaskbar": true
      },
      // 2. 面板窗口 (已有)
      {
        "label": "panel",
        "url": "/?view=panel",
        "width": 944,
        "height": 744,
        "transparent": true,
        "decorations": false,
        "visible": false
      },
      // 3. 壁纸窗口 (新增)
      {
        "label": "wallpaper",
        "url": "/?view=wallpaper",
        "width": 1920,   // 启动时动态调整为屏幕尺寸
        "height": 1080,
        "transparent": true,
        "decorations": false,
        "alwaysOnTop": false,
        "skipTaskbar": true,
        "resizable": false,
        "visible": false  // attach 后再显示
      }
    ]
  }
}
```

### 5.3 Vue 路由与组件结构

```
src/
├── App.vue                    # 路由分发
├── views/
│   ├── AssistantView.vue            # 助手视图 (已有)
│   ├── PanelView.vue          # 面板视图 (已有)
│   └── WallpaperView.vue      # 壁纸视图 (新增)
├── components/
│   ├── pet/                   # 已有，不变
│   ├── panel/                 # 已有，不变
│   └── wallpaper/             # 新增
│       ├── WeatherTime.vue    # 天气+时间
│       ├── TaskList.vue       # 任务清单 (只读)
│       ├── FocusRing.vue      # 专注计时圆环
│       ├── CompanionQuote.vue # 助手寄语
│       ├── AmbientOverlay.vue # 氛围色调
│       └── FocusStats.vue     # 专注统计
└── composables/
    ├── useAssistantState.ts         # 已有，共享状态
    ├── useFocus.ts            # 已有，共享数据
    ├── useTasks.ts            # 已有，共享数据
    └── useWallpaperState.ts   # 新增：壁纸层状态聚合
```

### 5.4 useWallpaperState 组合式函数

壁纸窗口需要一个独立的状态聚合层，从 WebSocket 消息中提取展示所需数据：

```typescript
// composables/useWallpaperState.ts
interface WallpaperState {
  // 天气 + 时间
  weather: { temp: number; icon: string; city: string } | null
  currentTime: string       // "14:32"
  currentDate: string       // "6月12日 周四"

  // 任务清单 (只读投影)
  pendingTasks: Array<{ id: string; title: string }>

  // 专注计时
  focusActive: boolean
  focusRemaining: number    // 秒
  focusDuration: number     // 总秒数

  // 助手寄语
  companionQuote: string
  companionState: AssistantState

  // 专注统计
  todayFocusTotal: number   // 秒

  // 开关
  wallpaperVisible: boolean
  ambientEnabled: boolean
}
```

此 composable 仅消费 WebSocket 消息，不发送任何交互命令。

### 5.5 性能预算

壁纸窗口持续渲染，必须严格控制资源消耗：

| 指标 | 预算 | 说明 |
|------|------|------|
| CPU | < 2% 均值 | 使用 CSS transform/opacity 动画，避免 layout thrash |
| GPU 内存 | < 30MB | 透明窗口本身开销小，限制 SVG 复杂度 |
| 网络流量 | < 1KB/s | WebSocket 心跳 + 状态推送，无大包 |
| 帧率 | 30fps 即可 | 壁纸层不需要 60fps，可用 `requestAnimationFrame` 节流 |

优化策略：
- 壁纸窗口**无用户交互**，可将 `pointer-events: none` 设为全局默认，减少命中测试开销
- 时间更新每秒一次，使用 `setTimeout` 而非 `setInterval` + `requestAnimationFrame`
- SVG 圆环使用 CSS `stroke-dashoffset` 动画，不使用 JS 逐帧更新
- 氛围色调使用 CSS `transition`，不使用 JS 动画
- 组件不可见时（用户关闭壁纸显示）完全卸载，而非隐藏

### 5.6 与 Wallpaper Engine 共存

当用户同时运行 Wallpaper Engine 时：

- 我们的壁纸窗口嵌入 WorkerW 层，位于 WE 渲染的动态壁纸**之上**
- 我们的窗口背景透明，WE 的壁纸内容依然可见
- 两者视觉上自然叠加：WE 提供动态背景 → 我们的透明窗口叠加状态文字
- 如果冲突，用户可通过右键菜单关闭壁纸层，退回纯悬浮模式

---

## 6. 实现阶段

### Phase 1：MVP（壁纸窗口 + 核心状态）

**目标**：验证 WorkerW 嵌入可行性，交付最小可用状态显示

- [ ] 集成 `tauri-plugin-wallpaper`
- [ ] 创建壁纸窗口 + `WallpaperView.vue`
- [ ] 实现 `WeatherTime.vue`（天气 + 时间）
- [ ] 实现 `FocusRing.vue`（专注计时圆环）
- [ ] 实现 `useWallpaperState.ts`（状态聚合）
- [ ] 壁纸层开关（右键菜单）
- [ ] 验证与 Wallpaper Engine 共存

### Phase 2：丰富状态

**目标**：补全所有状态组件，完善视觉体验

- [ ] 实现 `TaskList.vue`（只读任务清单）
- [ ] 实现 `CompanionQuote.vue`（助手寄语）
- [ ] 实现 `AmbientOverlay.vue`（氛围色调）
- [ ] 实现 `FocusStats.vue`（专注统计）
- [ ] 助手窗口 Hook 角标实现

### Phase 3：打磨与配置

**目标**：用户可自定义壁纸层行为

- [ ] 壁纸层位置/布局配置（预设：左倾/右倾/居中）
- [ ] 各组件独立开关
- [ ] 透明度/颜色自定义
- [ ] 多显示器支持（参考 WinWallpaper 的每屏独立 widget 方案）
- [ ] 窗口尺寸变化自适应

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| WorkerW 技术在部分 Windows 版本不稳定 | 中 | 高 | 1) detach 回退到纯悬浮模式；2) 检测 WorkerW 是否可用，不可用时跳过壁纸层 |
| 壁纸窗口被系统重启后丢失 WorkerW 父级 | 低 | 中 | 监听 `WM_PARENTNOTIFY` 或定时检查，丢失时重新 attach |
| 透明窗口在全屏游戏/应用下渲染异常 | 中 | 低 | 检测全屏应用时自动隐藏壁纸窗口 |
| 与 Wallpaper Engine / Lively 等冲突 | 低 | 中 | 提供共存模式开关；冲突时降级为纯状态栏模式 |
| Windows 更新导致 WorkerW 行为变化 | 低 | 高 | 社区持续跟进（weebp/WE 等项目会同步修复）；版本检测 + 降级 |
| `tauri-plugin-wallpaper` 停止维护 | 中 | 中 | 插件作者建议可直接内化 WorkerW 逻辑（~200 行 Rust），不依赖外部库 |

---

## 8. 设计决策记录

| # | 决策 | 理由 | 替代方案 |
|---|------|------|---------|
| D1 | 壁纸层纯展示，不交互 | WorkerW 层交互不可靠；职责清晰 | 壁纸层支持点击交互 → 复杂且不可靠 |
| D2 | Hook 通知用角标而非壁纸弹窗 | 壁纸层不可交互；角标是成熟的"有东西待处理"隐喻 | 壁纸层显示通知条 → 需要交互，违反原则 |
| D3 | 采用 `tauri-plugin-wallpaper` | 直接适配 Tauri v2，一行 attach() | 自行实现 WorkerW 逻辑 → 可控但初期成本高 |
| D4 | 壁纸窗口独立于 Pet/Panel 窗口 | 职责分离；壁纸窗口可独立 attach/detach | 复用 助手窗口 → 无法同时悬浮+嵌入 |
| D5 | 时间每秒更新而非每分钟 | 专注计时需要秒级精度；统一刷新频率 | 分钟级 + 计时单独处理 → 两套逻辑 |
| D6 | 任务清单仅显示未完成项 | 壁纸空间有限；已完成项对"下一步行动"无价值 | 显示全部 → 视觉噪音 |
| D7 | 氛围色调极淡 (0.03–0.04 alpha) | 不干扰壁纸本身美感；用户应"感受"而非"看到"色调变化 | 更明显 → 喧宾夺主 |
