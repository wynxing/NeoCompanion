<script setup lang="ts">
defineProps<{
  state: string;
}>();
</script>

<template>
  <div class="mini-pet-avatar" :data-state="state">
    <img src="../../assets/companion/companion-full.png" alt="" />
  </div>
</template>
