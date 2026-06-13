# 术语迁移方案：pet → assistant

## 概述

本文档记录 NeoCompanion 从"宠物"模型到"助手"模型的术语迁移清单。

原则：**一次性全面迁移，不留混合术语**。

---

## 一、产品文案迁移（文档 + UI）

| 位置 | 旧文案 | 新文案 |
|------|--------|--------|
| 产品定位 | "桌面悬浮虚拟宠物" | "桌面悬浮智能助手" |
| 产品定位 | "桌宠情感载体" | "助手情感载体" |
| PRD §3.1 | "悬浮桌宠及拟人化 TTS 语音互动" | "悬浮助手及拟人化 TTS 语音互动" |
| PRD §5.1 | "Companion Layer (陪伴交互层)" | "Assistant Layer (助手交互层)" |
| 能力构思 §1.1 | "悬浮桌宠形态" | "悬浮助手形态" |
| 能力构思 §1.1 | "桌面悬浮宠物" | "桌面悬浮助手" |
| 能力构思 §2.1 | "宠物专属番茄钟" | "助手番茄钟" |
| 能力构思 §2.2 | "拟人化待办助手" / "宠物小账本" | "待办助手" / "助手任务清单" |
| 能力构思 §2.3 | "宠物会主动发声" | "助手会主动提醒" |
| 能力构思 §2.4 | "宠物视角小日记" | "助手工作日志" |
| 反馈文案 | "主子" | 省略或"你" |
| 反馈文案 | "小宠" | "我" |
| 反馈文案 | "呜呜呜"、"太棒啦" | 见 SOUL_CONFIG.md §8 新反馈池 |
| 壁纸层文档 | "伴侣寄语" | "助手寄语" |
| 系统托盘 | "NeoCompanion 桌宠" | "NeoCompanion" |

---

## 二、代码标识符迁移

### 2.1 TypeScript 类型与接口

| 旧名称 | 新名称 | 文件位置 |
|--------|--------|---------|
| `PetState` | `AssistantState` | `packages/shared/src/types/` |
| `CompanionStatus` | `AssistantStatus` | `packages/shared/src/types/` |
| `CompanionFeedback` | `AssistantFeedback` | `packages/shared/src/types/` |
| `usePetState` | `useAssistantState` | `apps/desktop/src/composables/` |

### 2.2 Vue 组件

| 旧名称 | 新名称 | 说明 |
|--------|--------|------|
| `PetStage.vue` | `AssistantStage.vue` | 助手形象渲染 |
| `PetStatusBar.vue` | `AssistantStatusBar.vue` | 助手状态栏 |
| `MiniPetAvatar.vue` | `MiniAssistantAvatar.vue` | 面板小头像 |
| `SpeechBubble.vue` | 不变 | 通用组件 |
| `PermissionBubble.vue` | 不变 | 通用组件 |

### 2.3 CSS 类名与文件

| 旧名称 | 新名称 |
|--------|--------|
| `.pet-container` | `.assistant-container` |
| `.pet-stage` | `.assistant-stage` |
| `.pet-shell` | `.assistant-shell` |
| `pet.css` | `assistant.css` |

### 2.4 后端模块与路由

| 旧名称 | 新名称 | 说明 |
|--------|--------|------|
| `modules/companion/` | `modules/assistant/` | Fastify 助手反馈模块 |
| `companion:feedback` (WS) | `assistant:feedback` | WebSocket 消息类型 |
| `companion.ts` (Pinia store) | `assistant.ts` | 前端状态管理 |

### 2.5 Tauri 窗口标签

| 旧标签 | 新标签 | 说明 |
|--------|--------|------|
| `pet` | `assistant` | 悬浮助手窗口 |
| `panel` | 不变 | 面板窗口 |
| `wallpaper` | 不变 | 壁纸窗口 |

### 2.6 目录结构

| 旧路径 | 新路径 |
|--------|--------|
| `src/components/pet/` | `src/components/assistant/` |
| `src/composables/usePetState.ts` | `src/composables/useAssistantState.ts` |
| `src/styles/pet.css` | `src/styles/assistant.css` |
| `src/features/companion/` | `src/features/assistant/` |
| `src/stores/companion.ts` | `src/stores/assistant.ts` |
| `packages/server-local/src/modules/companion/` | `packages/server-local/src/modules/assistant/` |

---

## 三、文档迁移

| 文档 | 需要替换的内容 |
|------|--------------|
| `PRD_overview.md` | "宠物"→"助手"、"桌宠"→"助手"、"Companion Layer"→"Assistant Layer"、"主子"→省略 |
| `具体能力构思.md` | 全面替换"宠物/桌宠/主子/小宠"，反馈文案更新为新反馈池风格 |
| `ARCHITECTURE.md` | 代码模块名 companion→assistant，组件名 Pet→Assistant，WS 消息类型 |
| `WALLPAPER_STATUS_LAYER.md` | "伴侣寄语"→"助手寄语"，PetState→AssistantState |
| `README.md` | 产品描述中的"宠物"→"助手" |

---

## 四、暂不迁移的项

| 项 | 原因 |
|----|------|
| `PermissionBubble` | 通用组件，不含"宠物"语义 |
| 数据库表名 `conversations` | 无宠物语义 |
| 资产文件名 `companion-full.png` | 将在形象资产重构时替换为精灵图，无需单独改名 |

---

## 五、执行策略

1. **文档先行**：先完成所有 .md 文档的术语替换（本次会话可执行）
2. **代码批量替换**：在实现阶段用 IDE 全局搜索替换，逐文件验证
3. **反馈池重写**：配合 SOUL_CONFIG.md §8 的新反馈池，替换所有旧反馈文案
4. **验证**：全局搜索 `pet`、`companion`、`宠物`、`桌宠`、`主子`、`小宠`，确保无遗漏
