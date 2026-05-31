import { ref } from "vue";
import type { WsMessage } from "@neo-companion/shared";
import { api } from "../api";

export function useChat() {
  const chatInput = ref("");
  const chatAnswer = ref("");
  const chatLoading = ref(false);

  async function sendChat() {
    if (!chatInput.value.trim() || chatLoading.value) return;
    const message = chatInput.value;
    chatInput.value = "";
    chatAnswer.value = "";
    chatLoading.value = true;
    try {
      await api.chat(message);
    } catch {
      chatLoading.value = false;
    }
  }

  function handleWsMessage(message: WsMessage) {
    if (message.type === "ai:chunk") {
      const payload = message.payload as { chunk: string };
      chatAnswer.value += payload.chunk;
    }
    if (message.type === "ai:done") {
      chatLoading.value = false;
    }
    if (message.type === "ai:error") {
      chatLoading.value = false;
    }
  }

  return {
    chatInput,
    chatAnswer,
    chatLoading,
    sendChat,
    handleWsMessage,
  };
}
