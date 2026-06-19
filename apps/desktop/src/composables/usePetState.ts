import { computed, ref } from "vue";
import type { CompanionFeedback, CompanionState, WsMessage } from "@neo-companion/shared";

const feedbackPool: Record<CompanionState, string[]> = {
  idle: [
    "今天也慢慢来，我在旁边陪着你。",
    "嗯哼，我在发呆等你呀~",
    "静静待着也挺好的，对吧？",
    "有需要随时叫我哦。",
  ],
  focus: [
    "嘘，闭关修炼中，加油！",
    "专注模式启动，我在旁边默默守着~",
    "你专心做事的样子很帅哦。",
    "我在帮你挡掉打扰，放心冲！",
  ],
  happy: [
    "太棒了！休息一下吧~",
    "做到了！给自己鼓个掌！",
    "好厉害！我就知道你可以的！",
    "辛苦啦，要不要喝口水？",
  ],
  thinking: [
    "让我想想……",
    "嗯……这个问题有点意思……",
    "稍等，脑袋在转~",
    "正在翻记忆的小本本……",
  ],
  warn: [
    "是不是该回来啦？",
    "哎……说好要专心的呢~",
    "别走远啦，我等你回来！",
    "嘿，该回来干活了哦~",
  ],
  sleepy: [
    "夜深了，我们也该休息了吧？",
    "好困……眼皮都打架了……",
    "今天辛苦了，早点休息好不好？",
    "已经好晚了，明天再来也行的~",
  ],
};

export function usePetState() {
  const petState = ref<CompanionState>("idle");
  const feedbackText = ref(pickRandom(feedbackPool.idle));
  const feedbackVisible = ref(true);

  const animationClass = computed(() => `pet-state-${petState.value}`);

  function pickRandom(pool: string[]): string {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function setFeedback(payload: CompanionFeedback) {
    petState.value = payload.state;
    feedbackVisible.value = true;
    feedbackText.value = payload.text || pickRandom(feedbackPool[payload.state]);
  }

  function setState(state: CompanionState) {
    petState.value = state;
    feedbackText.value = pickRandom(feedbackPool[state]);
    feedbackVisible.value = true;
  }

  function dismissFeedback() {
    feedbackVisible.value = false;
  }

  function handleWsMessage(message: WsMessage) {
    if (message.type === "companion:feedback") {
      setFeedback(message.payload as CompanionFeedback);
    }
  }

  return {
    petState,
    feedbackText,
    feedbackVisible,
    animationClass,
    setState,
    dismissFeedback,
    handleWsMessage,
  };
}
