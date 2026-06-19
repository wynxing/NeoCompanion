# Glossary / 术语表

This document defines the preferred terminology for NeoCompanion and lists deprecated terms that should be avoided in product copy and new documentation.

## Preferred Terms

| Term | Meaning | Notes |
|------|---------|-------|
| **助手 / Assistant** | The floating desktop companion | Default user-facing term. |
| **悬浮层 / Float Layer** | The layer containing the assistant widget, speech bubbles, and hook badges | Main interaction entry point. |
| **壁纸层 / Wallpaper Layer** | The desktop wallpaper-embedded status display | Shows weather, time, focus ring, tasks, assistant messages. |
| **面板层 / Panel Layer** | The main application window for editing tasks, chatting with AI, settings, and hook approvals | Pops up on demand. |
| **专注 / Focus** | Pomodoro-style focus timer | Assistant accompanies the user during focus sessions. |
| **任务 / Task** | A to-do item | Unified across the simple task list and the kanban board. |
| **Hook** | External agent integration mechanism | External scripts push status or request permissions via the local API. |
| **知识工作空间 / Knowledge Workspace** | Projects, notes, kanban, and AI chat workspace | Introduced in v3.3 UI; real backend storage and search are planned. |
| **助手寄语 / Assistant Message** | Short, faint status text shown in the wallpaper layer | Previously called "伴侣寄语". |

## Deprecated Terms

| Deprecated Term | Replacement | Status |
|-----------------|-------------|--------|
| 桌宠 / Desk Pet | 桌面悬浮助手 / Assistant | Do not use in new docs or UI copy. |
| 宠物 / Pet | 助手 / Assistant | Do not use in new docs or UI copy. |
| 主子 | (omit or use "你") | Removed from assistant feedback pool. |
| 小宠 | 我 | Removed from assistant feedback pool. |
| 伴侣寄语 | 助手寄语 | Use the new term in product copy. |
| Companion Layer | Assistant Layer | Use in architecture discussions. |

## Code Identifiers

The following identifiers still exist in the codebase for historical reasons and will be renamed in a dedicated refactoring session:

- `components/pet/`
- `PetStage.vue`, `PetStatusBar.vue`
- `usePetState.ts`
- `pet.css`
- `companion:feedback` WebSocket message type
- `?view=pet` route parameter

Until that refactor is complete, use the **product terminology** in all user-facing copy and new documentation, even when referring to code paths that still contain the old names.
