<script setup lang="ts" generic="T">
import { ref, watch, nextTick } from "vue";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";

const props = defineProps<{
  items: T[];
  command: (item: T) => void;
  itemKey: (item: T) => string;
  itemLabel: (item: T, isActive: boolean) => string;
  /** 命令 token（如 `/` 或 `#`），渲染在每条左侧灰字提示。 */
  prefix?: string;
}>();

const selectedIndex = ref(0);
const itemRefs = ref<(HTMLDivElement | null)[]>([]);

watch(
  () => props.items,
  () => {
    selectedIndex.value = 0;
  },
);

watch(selectedIndex, async (index) => {
  await nextTick();
  itemRefs.value[index]?.scrollIntoView?.({ block: "nearest" });
});

function pick(index: number): void {
  if (index >= 0 && index < props.items.length) {
    props.command(props.items[index]);
  }
}

function setRef(index: number, el: Element | null): void {
  itemRefs.value[index] = el as HTMLDivElement | null;
}

defineExpose({
  /**
   * Tiptap Suggestion plugin 把按键转发到这里，返回 true 表示已处理（吞掉键），
   * false 表示继续冒泡到 ProseMirror 默认 keymap。
   */
  onKeyDown({ event }: SuggestionKeyDownProps): boolean {
    if (props.items.length === 0) {
      return false;
    }
    if (event.key === "ArrowDown") {
      selectedIndex.value = (selectedIndex.value + 1) % props.items.length;
      return true;
    }
    if (event.key === "ArrowUp") {
      selectedIndex.value = (selectedIndex.value - 1 + props.items.length) % props.items.length;
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      pick(selectedIndex.value);
      return true;
    }
    return false;
  },
});
</script>

<template>
  <div v-if="items.length > 0" class="nc-suggestion-menu" data-suggestion-menu>
    <div
      v-for="(item, index) in items"
      :key="itemKey(item)"
      :ref="(el) => setRef(index, el as Element | null)"
      class="nc-suggestion-item"
      :class="{ active: index === selectedIndex }"
      @mousedown.prevent="pick(index)"
      @mouseenter="selectedIndex = index"
    >
      <span v-if="prefix" class="nc-suggestion-prefix">{{ prefix }}</span>
      <span class="nc-suggestion-label">{{ itemLabel(item, index === selectedIndex) }}</span>
    </div>
  </div>
</template>
