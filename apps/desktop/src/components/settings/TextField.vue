<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    maxWidth?: string;
    align?: "left" | "center";
  }>(),
  {
    placeholder: "",
    maxWidth: "280px",
    align: "left",
  },
);

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();

function onInput(target: EventTarget | null): void {
  if (!(target instanceof HTMLInputElement)) return;
  emit("update:modelValue", target.value);
}
</script>

<template>
  <input
    class="text-input"
    :value="modelValue"
    :placeholder="placeholder"
    :style="{ maxWidth, textAlign: align }"
    @input="onInput($event.target)"
  />
</template>
