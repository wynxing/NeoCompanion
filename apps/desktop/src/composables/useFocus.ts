import { computed, ref } from "vue";
import type { FocusSession, FocusTickPayload, WsMessage } from "@neo-companion/shared";
import { api } from "../api";

export function useFocus() {
  const focusSessionId = ref<string | null>(null);
  const focusRemaining = ref(25 * 60);
  const focusElapsed = ref(0);
  const focusMinutes = ref(25);

  const focusProgress = computed(() => {
    const total = Math.max(focusMinutes.value * 60, 1);
    return Math.min(100, Math.round((focusElapsed.value / total) * 100));
  });

  const timerText = computed(() => {
    const minutes = Math.floor(focusRemaining.value / 60).toString().padStart(2, "0");
    const seconds = (focusRemaining.value % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  });

  const isFocusActive = computed(() => !!focusSessionId.value);

  async function startFocus(taskId: string | null) {
    const session = await api.startFocus(taskId, focusMinutes.value);
    focusSessionId.value = session.id;
    focusRemaining.value = session.durationMinutes * 60;
    focusElapsed.value = 0;
  }

  async function completeFocus() {
    if (!focusSessionId.value) return;
    await api.completeFocus(focusSessionId.value);
    focusSessionId.value = null;
    focusRemaining.value = focusMinutes.value * 60;
    focusElapsed.value = 0;
  }

  function handleWsMessage(message: WsMessage) {
    if (message.type === "focus:tick") {
      const payload = message.payload as FocusTickPayload;
      focusSessionId.value = payload.remainingSeconds > 0 ? payload.sessionId : null;
      focusRemaining.value = payload.remainingSeconds;
      focusElapsed.value = payload.elapsedSeconds;
    }
  }

  return {
    focusSessionId,
    focusRemaining,
    focusElapsed,
    focusMinutes,
    focusProgress,
    timerText,
    isFocusActive,
    startFocus,
    completeFocus,
    handleWsMessage,
  };
}
