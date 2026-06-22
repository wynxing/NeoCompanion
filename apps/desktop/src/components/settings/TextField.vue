<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    maxWidth?: string;
    align?: "left" | "center";
    type?: "text" | "password";
  }>(),
  {
    placeholder: "",
    maxWidth: "280px",
    align: "left",
    type: "text",
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
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :style="{ maxWidth, textAlign: align }"
    @input="onInput($event.target)"
  />
</template>
