<script setup lang="ts" generic="T extends string">
interface Option<TValue extends string> {
  value: TValue;
  label: string;
}

defineProps<{
  modelValue: T;
  options: Option<T>[];
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: T): void;
}>();

function onChange(target: EventTarget | null): void {
  if (!(target instanceof HTMLSelectElement)) return;
  emit("update:modelValue", target.value as T);
}
</script>

<template>
  <div class="select-wrap">
    <select :value="modelValue" @change="onChange($event.target)">
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
  </div>
</template>
