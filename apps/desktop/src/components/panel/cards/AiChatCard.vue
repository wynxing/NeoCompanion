<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  chatAnswer: string;
  chatLoading: boolean;
}>();

const emit = defineEmits<{
  sendMessage: [text: string];
}>();

const inputText = ref("");

const exampleMessages = [
  { who: "我", msg: "这段 panic 是 borrow checker？" },
  { who: "助手", msg: "是的，第 42 行同时持有可变与不可变借用…" },
];

function handleSend() {
  if (!inputText.value.trim()) return;
  emit("sendMessage", inputText.value);
  inputText.value = "";
}
</script>

<template>
  <div class="card card-solid">
    <div class="card-head">
      <div>
        <div class="card-title">AI 对话</div>
        <div class="card-sub">DeepSeek-V3 · 拾取剪贴板报错</div>
      </div>
      <svg style="opacity: 0.5; flex: none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>

    <div class="nc-chat">
      <div class="nc-chat-scroll">
      <template v-if="chatAnswer || chatLoading">
        <div class="row">
          <span class="who">助手</span>
          <span :class="['msg', { streaming: chatLoading }]">{{ chatAnswer || "思考中…" }}</span>
        </div>
      </template>
      <div v-else class="nc-chat-empty">
        <div v-for="(msg, i) in exampleMessages" :key="i" class="row">
          <span class="who">{{ msg.who }}</span>
          <span class="msg">{{ msg.msg }}</span>
        </div>
        <small>示例对话 · 发送消息后会显示真实回复</small>
      </div>
      </div>
      <div class="input">
        <input
          v-model="inputText"
          type="text"
          placeholder="问点什么…"
          style="
            flex: 1;
            border: none;
            background: transparent;
            outline: none;
            font: inherit;
            font-size: 0.78rem;
            color: inherit;
          "
          @keydown.enter.prevent="handleSend"
        />
        <span class="send" @click="handleSend">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="m5 12 14-7-5 14-3-7z" />
          </svg>
        </span>
      </div>
    </div>
  </div>
</template>
