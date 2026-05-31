<script setup lang="ts">
defineProps<{
  chatInput: string;
  chatAnswer: string;
  chatLoading: boolean;
}>();

defineEmits<{
  "update:chatInput": [value: string];
  sendChat: [];
}>();
</script>

<template>
  <section class="drawer-panel chat-panel">
    <div class="panel-line">
      <h2>轻量对话</h2>
      <span class="count">{{ chatLoading ? "思考中" : "就绪" }}</span>
    </div>

    <div class="chat-answer" :class="{ empty: !chatAnswer }">
      <template v-if="chatAnswer">{{ chatAnswer }}</template>
      <template v-else>把卡住的问题写在这里，我会尽量简洁地给你思路。</template>
    </div>

    <form class="chat-form" @submit.prevent="$emit('sendChat')">
      <input :value="chatInput" placeholder="例如：帮我拆一下这个报错思路" @input="$emit('update:chatInput', ($event.target as HTMLInputElement).value)" />
      <button class="primary" type="submit" :disabled="chatLoading">发送</button>
    </form>
  </section>
</template>
