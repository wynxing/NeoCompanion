<script setup lang="ts">
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition, PhysicalSize, primaryMonitor } from "@tauri-apps/api/window";
import { onMounted, onUnmounted, ref } from "vue";
import type { TtsResult, WeatherSummary, WindowSnapshot, WsMessage } from "@neo-companion/shared";
import { api, connectWs } from "./api";
import { usePetState } from "./composables/usePetState";
import { useFocus } from "./composables/useFocus";
import { useTasks } from "./composables/useTasks";
import { useChat } from "./composables/useChat";
import { usePermission } from "./composables/usePermission";
import { useWallpaperState } from "./composables/useWallpaperState";
import { attachWallpaper, detachWallpaper } from "./wallpaper-plugin";

import PetStage from "./components/pet/PetStage.vue";
import SpeechBubble from "./components/pet/SpeechBubble.vue";
import PetStatusBar from "./components/pet/PetStatusBar.vue";
import PermissionBubble from "./components/pet/PermissionBubble.vue";

import TopNav from "./components/panel/TopNav.vue";
import CreateFocusCard from "./components/panel/cards/CreateFocusCard.vue";
import TodayTasksCard from "./components/panel/cards/TodayTasksCard.vue";
import WeeklyFocusCard from "./components/panel/cards/WeeklyFocusCard.vue";
import ClawGatewayCard from "./components/panel/cards/ClawGatewayCard.vue";
import AssistantStatusCard from "./components/panel/cards/AssistantStatusCard.vue";
import HookNotificationsCard from "./components/panel/cards/HookNotificationsCard.vue";
import AiChatCard from "./components/panel/cards/AiChatCard.vue";
import DiaryCard from "./components/panel/cards/DiaryCard.vue";
import BottomBar from "./components/panel/BottomBar.vue";
import FloatingControls from "./components/panel/FloatingControls.vue";
import ComponentsButton from "./components/panel/ComponentsButton.vue";
import PageDots from "./components/panel/PageDots.vue";
import ErrorToast from "./components/shared/ErrorToast.vue";
import WallpaperView from "./views/WallpaperView.vue";
import SettingsView from "./views/SettingsView.vue";

const viewMode = new URLSearchParams(window.location.search).get("view");
const isPetView = viewMode === "pet";
const isWallpaperView = viewMode === "wallpaper";
const isSettingsView = viewMode === "settings";
const isTauriRuntime = "__TAURI_INTERNALS__" in window;
type PanelPage = "focus" | "tasks" | "weekly" | "claw" | "assistant" | "hooks" | "chat" | "diary";

const panelPages: Array<{ id: PanelPage; label: string }> = [
  { id: "focus", label: "专注" },
  { id: "tasks", label: "任务" },
  { id: "weekly", label: "本周" },
  { id: "claw", label: "OpenClaw" },
  { id: "assistant", label: "助手" },
  { id: "hooks", label: "Hook" },
  { id: "chat", label: "AI 对话" },
  { id: "diary", label: "日记" },
];

const pet = usePetState();
const focus = useFocus();
const tasks = useTasks();
const chat = useChat();
const permission = usePermission();
const wallpaper = useWallpaperState();

const weather = ref<WeatherSummary | null>(null);
const lastWindow = ref<WindowSnapshot | null>(null);
const serverReady = ref(false);
const errorText = ref("");
const isPanelDark = ref(false);
const activePanelPage = ref<PanelPage>("focus");
const wallpaperVisible = ref(true);

const contextMenu = ref<{ x: number; y: number } | null>(null);

let disconnectWs: (() => void) | null = null;

onMounted(async () => {
  if (isSettingsView) {
    return;
  }
  if (isWallpaperView) {
    wallpaper.startClock();
  }
  await refresh();
  disconnectWs = connectWs(handleWsMessage);
  if (isPetView) {
    await setWallpaperLayerVisible(true);
  }
});

onUnmounted(() => {
  disconnectWs?.();
  if (isWallpaperView) {
    wallpaper.stopClock();
  }
});

async function refresh() {
  try {
    serverReady.value = (await api.health()).ok;
    if (isWallpaperView) {
      await wallpaper.loadWeather();
    } else if (!isPetView) {
      await tasks.loadTasks();
      weather.value = await api.weather();
    }
  } catch (error) {
    serverReady.value = false;
    errorText.value = error instanceof Error ? error.message : "服务暂时不可用";
  }
}

function handleWsMessage(message: WsMessage) {
  pet.handleWsMessage(message);
  focus.handleWsMessage(message);
  tasks.handleWsMessage(message);
  chat.handleWsMessage(message);
  permission.handleWsMessage(message);
  wallpaper.handleWsMessage(message);

  if (message.type === "window:activeChanged") {
    lastWindow.value = message.payload as WindowSnapshot;
  }
  if (message.type === "tts:done" && isPetView) {
    playTts(message.payload as TtsResult);
  }
  if (message.type === "ai:error") {
    const payload = message.payload as { message: string };
    errorText.value = payload.message;
  }
  if (message.type === "companion:feedback") {
    const payload = message.payload as { state: string };
    if (payload.state === "focus") {
      pet.setState("focus");
    } else if (payload.state === "happy") {
      pet.setState("happy");
    } else if (payload.state === "thinking") {
      pet.setState("thinking");
    }
  }
}

function playTts(result: TtsResult) {
  if (!result.audioUrl) return;
  const audio = new Audio(result.audioUrl);
  void audio.play().catch(() => {
    errorText.value = "浏览器阻止了自动播放，点击一次页面后可继续播报。";
  });
}

async function openPanel() {
  if (!isTauriRuntime) return;
  const panel = await WebviewWindow.getByLabel("panel");
  await panel?.show();
  await panel?.setFocus();
}

async function openSettings() {
  if (!isTauriRuntime) return;
  const settings = await WebviewWindow.getByLabel("settings");
  await settings?.show();
  await settings?.setFocus();
}

async function setWallpaperLayerVisible(visible: boolean) {
  if (!isTauriRuntime) return;

  const wallpaperWindow = await WebviewWindow.getByLabel("wallpaper");
  if (!wallpaperWindow) return;

  try {
    if (visible) {
      await fitWallpaperWindowToPrimaryMonitor(wallpaperWindow);
      await wallpaperWindow.show();
      await attachWallpaper("wallpaper");
      wallpaperVisible.value = true;
      wallpaper.wallpaperVisible.value = true;
      return;
    }

    await detachWallpaper("wallpaper");
    await wallpaperWindow.hide();
    wallpaperVisible.value = false;
    wallpaper.wallpaperVisible.value = false;
  } catch (error) {
    wallpaperVisible.value = false;
    wallpaper.wallpaperVisible.value = false;
    await wallpaperWindow.hide().catch(() => {});
    errorText.value = error instanceof Error ? error.message : "壁纸层暂时不可用";
  }
}

async function fitWallpaperWindowToPrimaryMonitor(window: WebviewWindow) {
  const monitor = await primaryMonitor();
  if (!monitor) return;
  await window.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
  await window.setSize(new PhysicalSize(monitor.size.width, monitor.size.height));
}

async function toggleWallpaperLayer() {
  closeContextMenu();
  await setWallpaperLayerVisible(!wallpaperVisible.value);
}

function onPetContextMenu(event: MouseEvent) {
  contextMenu.value = { x: event.clientX, y: event.clientY };
}

function closeContextMenu() {
  contextMenu.value = null;
}

async function quickStartFocus() {
  closeContextMenu();
  await focus.startFocus(tasks.activeTaskId.value);
  pet.setState("focus");
}

function focusAddTask() {
  closeContextMenu();
  openPanel();
}

function onTaskToggle(task: typeof tasks.tasks.value[0]) {
  tasks.toggleTask(task);
  if (task.status === "open") {
    pet.setState("happy");
  }
}

function togglePanelTheme() {
  isPanelDark.value = !isPanelDark.value;
}

function setActivePanelPage(pageId: string) {
  if (panelPages.some((page) => page.id === pageId)) {
    activePanelPage.value = pageId as PanelPage;
  }
}

async function onStartFocusFromCard(duration?: number) {
  if (duration) {
    focus.focusMinutes.value = duration;
  }
  await focus.startFocus(tasks.activeTaskId.value);
  pet.setState("focus");
}

function handleSendMessage(text: string) {
  chat.chatInput.value = text;
  chat.sendChat();
  pet.setState("thinking");
}
</script>

<template>
  <template v-if="isPetView">
    <main class="pet-shell" :data-state="pet.petState.value" @click="closeContextMenu">
      <div class="pet-drag-region" data-tauri-drag-region aria-hidden="true"></div>
      <PetStage :state="pet.petState.value" @click="openPanel" @contextmenu="onPetContextMenu" />
      <SpeechBubble :text="pet.feedbackText.value" :visible="pet.feedbackVisible.value" @dismiss="pet.dismissFeedback" />
      <PermissionBubble
        :request="permission.currentRequest.value"
        :queue="permission.queue.value"
        :visible="permission.visible.value"
        @allow="permission.allow"
        @deny="permission.deny"
        @always="permission.always"
      />
      <PetStatusBar :connected="serverReady" @open-panel="openPanel" />
      <p v-if="errorText" class="pet-error">{{ errorText }}</p>
    </main>

    <div v-if="contextMenu" class="pet-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <button type="button" :disabled="focus.isFocusActive.value" @click="quickStartFocus">开始专注</button>
      <button type="button" @click="focusAddTask">添加任务</button>
      <button type="button" @click="toggleWallpaperLayer">{{ wallpaperVisible ? "关闭壁纸状态显示" : "开启壁纸状态显示" }}</button>
    </div>
  </template>

  <WallpaperView v-else-if="isWallpaperView" :wallpaper="wallpaper" />

  <SettingsView v-else-if="isSettingsView" />

  <main v-else class="panel-shell" :class="{ 'dark-mode': isPanelDark }">
    <!-- Noise texture filter -->
    <svg width="0" height="0" style="position: absolute">
      <filter id="panel-noise-filter">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feComposite operator="in" in2="SourceGraphic" />
      </filter>
    </svg>

    <!-- Top navigation -->
    <TopNav
      :pet-state="pet.petState.value"
      :is-dark="isPanelDark"
      @toggle-theme="togglePanelTheme"
      @open-settings="openSettings"
    />

    <!-- Focused page card -->
    <section class="panel-page-stage" aria-live="polite">
      <CreateFocusCard v-if="activePanelPage === 'focus'" @start-focus="onStartFocusFromCard" />

      <TodayTasksCard
        v-else-if="activePanelPage === 'tasks'"
        :tasks="tasks.tasks.value"
        :completed-count="tasks.completedTasks.value.length"
        :total-count="tasks.tasks.value.length"
        :focus-duration="focus.timerText.value"
        :new-task-title="tasks.newTaskTitle.value"
        :active-task-id="tasks.activeTaskId.value"
        @add-task="tasks.addTask"
        @toggle-task="onTaskToggle"
        @update:new-task-title="tasks.newTaskTitle.value = $event"
        @update:active-task-id="tasks.activeTaskId.value = $event"
      />

      <WeeklyFocusCard v-else-if="activePanelPage === 'weekly'" @start-focus="onStartFocusFromCard" />

      <ClawGatewayCard v-else-if="activePanelPage === 'claw'" />

      <AssistantStatusCard v-else-if="activePanelPage === 'assistant'" :pet-state="pet.petState.value" />

      <HookNotificationsCard v-else-if="activePanelPage === 'hooks'" />

      <AiChatCard
        v-else-if="activePanelPage === 'chat'"
        :chat-answer="chat.chatAnswer.value"
        :chat-loading="chat.chatLoading.value"
        @send-message="handleSendMessage"
      />

      <DiaryCard v-else />
    </section>
    <div class="panel-lower">
      <ComponentsButton />
      <div class="panel-status-stack">
        <PageDots
          :pages="panelPages"
          :active="activePanelPage"
          aria-label="主面板功能导航"
          @update:active="setActivePanelPage"
        />
        <BottomBar
          :weather="weather"
          :last-window="lastWindow"
          :is-focus-active="focus.isFocusActive.value"
          focus-start-time="18:42"
          :focus-duration="`${focus.focusMinutes.value} min`"
        />
      </div>
      <FloatingControls />
    </div>

    <ErrorToast :text="errorText" />
  </main>
</template>
