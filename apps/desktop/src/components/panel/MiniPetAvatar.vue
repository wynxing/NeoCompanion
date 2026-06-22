<script setup lang="ts">
import type { CompanionState } from "@neo-companion/shared";
import { companionStateImages } from "../../assets/companion";

defineProps<{
  state: CompanionState;
}>();
</script>

<template>
  <div class="mini-pet-avatar" :data-state="state">
    <img :src="companionStateImages[state]" alt="" />
  </div>
</template>
