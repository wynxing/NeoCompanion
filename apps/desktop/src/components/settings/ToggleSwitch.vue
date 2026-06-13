<script setup lang="ts">
defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
}>();

function handleClick(currentValue: boolean): void {
  emit("update:modelValue", !currentValue);
}
</script>

<template>
  <button
    type="button"
    class="toggle"
    :class="{ active: modelValue }"
    :aria-pressed="modelValue"
    @click="handleClick(modelValue)"
  >
    <div class="toggle-knob"></div>
  </button>
</template>
