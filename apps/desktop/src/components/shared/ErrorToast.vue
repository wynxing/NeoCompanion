<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  text: string;
}>();

const visible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.text,
  (val) => {
    if (!val) {
      visible.value = false;
      return;
    }
    visible.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      visible.value = false;
    }, 5000);
  },
);
</script>

<template>
  <div v-if="visible && text" class="panel-error">{{ text }}</div>
</template>
