<script setup lang="ts">
import type { CompanionState } from "@neo-companion/shared";
import { companionStateImages } from "../../assets/companion";

defineProps<{
  state: CompanionState;
}>();

const emit = defineEmits<{
  click: [];
  contextmenu: [event: MouseEvent];
}>();
</script>

<template>
  <button class="pet-stage" type="button" aria-label="打开 NeoCompanion 面板" @click="emit('click')" @contextmenu.prevent="emit('contextmenu', $event)">
    <span class="pet-ambient-glow" aria-hidden="true"></span>
    <span class="pet-aura"></span>
    <img class="companion-image" :src="companionStateImages[state]" alt="NeoCompanion 桌宠" />
  </button>
</template>
