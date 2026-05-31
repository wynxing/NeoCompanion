<script setup lang="ts">
defineProps<{
  text: string;
  visible: boolean;
}>();

defineEmits<{
  dismiss: [];
}>();
</script>

<template>
  <div v-if="visible" class="speech-bubble" :class="{ fading: !visible }" @click="$emit('dismiss')">
    {{ text }}
  </div>
</template>
