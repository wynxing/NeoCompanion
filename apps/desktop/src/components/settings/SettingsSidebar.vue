<script setup lang="ts">
import type { SettingsSection } from "../../composables/useSettings";

defineProps<{
  active: SettingsSection;
}>();

const emit = defineEmits<{
  (event: "change", id: SettingsSection): void;
}>();

interface NavEntry {
  id: SettingsSection;
  label: string;
}

const NAV_ITEMS: NavEntry[] = [
  { id: "general", label: "通用设置" },
  { id: "assistant", label: "助手形象" },
  { id: "persona", label: "人设配置" },
  { id: "model", label: "模型配置" },
  { id: "privacy", label: "隐私安全" },
  { id: "hooks", label: "Hook 与连接" },
];
</script>

<template>
  <aside class="sidebar glass">
    <div class="sidebar-brand">
      <div class="sidebar-brand-text">NeoCompanion</div>
      <div class="sidebar-brand-sub">v1.0 · 设置</div>
    </div>

    <button
      v-for="item in NAV_ITEMS"
      :key="item.id"
      type="button"
      class="nav-item"
      :class="{ active: active === item.id }"
      @click="emit('change', item.id)"
    >
      <div class="nav-icon">
        <svg v-if="item.id === 'general'" viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="9" cy="9" r="3" />
          <path d="M9 1v2m0 12v2m-8-8h2m12 0h2m-2.5-5.5L14 4m-9 9l-1.5 1.5m0-12L5 4m9 9l1.5 1.5" />
        </svg>
        <svg v-else-if="item.id === 'assistant'" viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M9 3C6.5 3 4.5 5 4.5 7.5c0 1.5.7 2.8 1.8 3.7V13l2.7-1 2.7 1v-1.8c1.1-.9 1.8-2.2 1.8-3.7C13.5 5 11.5 3 9 3z" />
          <path d="M6 15h6" />
        </svg>
        <svg v-else-if="item.id === 'persona'" viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 14s1.5-3 5-3 5 3 5 3" />
          <circle cx="9" cy="7" r="3" />
        </svg>
        <svg v-else-if="item.id === 'model'" viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M2 13l7-10 7 10" />
          <path d="M9 3v12" />
          <path d="M5 10h8" />
        </svg>
        <svg v-else-if="item.id === 'privacy'" viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="3" y="8" width="12" height="9" rx="2" />
          <path d="M6 8V5a3 3 0 016 0v3" />
        </svg>
        <svg v-else viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M9 2v6m0 0a4 4 0 110 8m0-8a4 4 0 100 8" />
          <path d="M9 16v2" />
        </svg>
      </div>
      <span>{{ item.label }}</span>
    </button>

    <div class="sidebar-footer">
      <div class="sidebar-footer-text">所有数据仅存储在本地<br />无需注册账户</div>
    </div>
  </aside>
</template>
