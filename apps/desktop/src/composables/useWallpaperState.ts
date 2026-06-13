import { computed, ref } from "vue";
import type { CompanionFeedback, CompanionState, FocusTickPayload, WeatherSummary, WsMessage } from "@neo-companion/shared";
import { api } from "../api";

const DEFAULT_FOCUS_SECONDS = 25 * 60;

export function useWallpaperState() {
  const weather = ref<WeatherSummary | null>(null);
  const currentTime = ref("");
  const currentDate = ref("");
  const focusSessionId = ref<string | null>(null);
  const focusRemaining = ref(DEFAULT_FOCUS_SECONDS);
  const focusElapsed = ref(0);
  const companionState = ref<CompanionState>("idle");
  const wallpaperVisible = ref(true);

  let clockTimer: number | null = null;

  const focusActive = computed(() => !!focusSessionId.value && focusRemaining.value > 0);
  const focusDurationSeconds = computed(() => Math.max(focusRemaining.value + focusElapsed.value, 1));

  async function loadWeather() {
    weather.value = await api.weather();
  }

  function startClock() {
    updateClock();
    if (clockTimer !== null) return;
    clockTimer = window.setInterval(updateClock, 1000);
  }

  function stopClock() {
    if (clockTimer === null) return;
    window.clearInterval(clockTimer);
    clockTimer = null;
  }

  function updateClock() {
    const now = new Date();
    currentTime.value = now.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    currentDate.value = now.toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "short"
    });
  }

  function handleWsMessage(message: WsMessage) {
    if (message.type === "focus:tick") {
      const payload = message.payload as FocusTickPayload;
      focusSessionId.value = payload.remainingSeconds > 0 ? payload.sessionId : null;
      focusRemaining.value = payload.remainingSeconds;
      focusElapsed.value = payload.elapsedSeconds;
    }

    if (message.type === "companion:feedback") {
      const payload = message.payload as CompanionFeedback;
      companionState.value = payload.state;
      if (payload.state !== "focus" && focusRemaining.value <= 0) {
        focusSessionId.value = null;
        focusRemaining.value = DEFAULT_FOCUS_SECONDS;
        focusElapsed.value = 0;
      }
    }
  }

  return {
    weather,
    currentTime,
    currentDate,
    focusActive,
    focusRemaining,
    focusElapsed,
    focusDurationSeconds,
    companionState,
    wallpaperVisible,
    loadWeather,
    startClock,
    stopClock,
    handleWsMessage
  };
}
