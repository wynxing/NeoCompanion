<script setup lang="ts">
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { onMounted, onUnmounted, ref } from "vue";
import type { TtsResult, WeatherSummary, WindowSnapshot, WsMessage } from "@neo-companion/shared";
import { api, connectWs } from "./api";
import { usePetState } from "./composables/usePetState";
import { useFocus } from "./composables/useFocus";
import { useTasks } from "./composables/useTasks";
import { useChat } from "./composables/useChat";
import { usePermission } from "./composables/usePermission";

import PetStage from "./components/pet/PetStage.vue";
import SpeechBubble from "./components/pet/SpeechBubble.vue";
import PetStatusBar from "./components/pet/PetStatusBar.vue";
import PermissionBubble from "./components/pet/PermissionBubble.vue";

import PanelHeader from "./components/panel/PanelHeader.vue";
import TabNav from "./components/panel/TabNav.vue";
import FocusPanel from "./components/panel/FocusPanel.vue";
import TaskPanel from "./components/panel/TaskPanel.vue";
import ChatPanel from "./components/panel/ChatPanel.vue";
import StatusBar from "./components/panel/StatusBar.vue";
import ErrorToast from "./components/shared/ErrorToast.vue";

type DrawerTab = "focus" | "tasks" | "chat";

const viewMode = new URLSearchParams(window.location.search).get("view");
const isPetView = viewMode === "pet";
const isTauriRuntime = "__TAURI_INTERNALS__" in window;

const pet = usePetState();
const focus = useFocus();
const tasks = useTasks();
const chat = useChat();
const permission = usePermission();

const weather = ref<WeatherSummary | null>(null);
const lastWindow = ref<WindowSnapshot | null>(null);
const serverReady = ref(false);
const errorText = ref("");
const activeTab = ref<DrawerTab>("focus");

const contextMenu = ref<{ x: number; y: number } | null>(null);

let disconnectWs: (() => void) | null = null;

onMounted(async () => {
  await refresh();
  disconnectWs = connectWs(handleWsMessage);
});

onUnmounted(() => {
  disconnectWs?.();
});

async function refresh() {
  try {
    serverReady.value = (await api.health()).ok;
    if (!isPetView) {
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

async function hidePanel() {
  if (!isTauriRuntime) return;
  await WebviewWindow.getCurrent().hide();
}

function onPetContextMenu(event: MouseEvent) {
  contextMenu.value = { x: event.clientX, y: event.clientY };
}

function closeContextMenu() {
  contextMenu.value = null;
}

async function quickStartFocus() {
  closeContextMenu();
  if (tasks.activeTaskId.value) {
    await focus.startFocus(tasks.activeTaskId.value);
    pet.setState("focus");
  }
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

async function onSendChat() {
  chat.sendChat();
  pet.setState("thinking");
}

async function onStartFocus() {
  await focus.startFocus(tasks.activeTaskId.value);
  pet.setState("focus");
}

async function onCompleteFocus() {
  await focus.completeFocus();
  pet.setState("happy");
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
      <button type="button" :disabled="!tasks.activeTaskId.value || focus.isFocusActive.value" @click="quickStartFocus">开始专注</button>
      <button type="button" @click="focusAddTask">添加任务</button>
    </div>
  </template>

  <main v-else class="panel-shell">
    <section class="work-panel" aria-label="工作面板">
      <PanelHeader :pet-state="pet.petState.value" :current-task="tasks.currentTask.value" @hide="hidePanel" />

      <TabNav :active="activeTab" @change="activeTab = $event" />

      <FocusPanel
        v-show="activeTab === 'focus'"
        :timer-text="focus.timerText.value"
        :focus-progress="focus.focusProgress.value"
        :focus-minutes="focus.focusMinutes.value"
        :is-focus-active="focus.isFocusActive.value"
        :current-task="tasks.currentTask.value"
        @start-focus="onStartFocus"
        @complete-focus="onCompleteFocus"
        @update:focus-minutes="focus.focusMinutes.value = $event"
      />

      <TaskPanel
        v-show="activeTab === 'tasks'"
        :tasks="tasks.tasks.value"
        :completed-count="tasks.completedTasks.value.length"
        :total-count="tasks.tasks.value.length"
        :new-task-title="tasks.newTaskTitle.value"
        :active-task-id="tasks.activeTaskId.value"
        @update:new-task-title="tasks.newTaskTitle.value = $event"
        @add-task="tasks.addTask"
        @toggle-task="onTaskToggle"
        @update:active-task-id="tasks.activeTaskId.value = $event"
      />

      <ChatPanel
        v-show="activeTab === 'chat'"
        :chat-input="chat.chatInput.value"
        :chat-answer="chat.chatAnswer.value"
        :chat-loading="chat.chatLoading.value"
        @update:chat-input="chat.chatInput.value = $event"
        @send-chat="onSendChat"
      />

      <StatusBar :weather="weather" :last-window="lastWindow" />
    </section>

    <ErrorToast :text="errorText" />
  </main>
</template>
