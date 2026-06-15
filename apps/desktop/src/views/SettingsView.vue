<script setup lang="ts">
import { computed } from "vue";
import { SECTION_TITLES, useSettings } from "../composables/useSettings";
import SettingsSidebar from "../components/settings/SettingsSidebar.vue";
import SettingsTopbar from "../components/settings/SettingsTopbar.vue";
import GeneralSection from "../components/settings/sections/GeneralSection.vue";
import AssistantSection from "../components/settings/sections/AssistantSection.vue";
import PersonaSection from "../components/settings/sections/PersonaSection.vue";
import ModelSection from "../components/settings/sections/ModelSection.vue";
import PrivacySection from "../components/settings/sections/PrivacySection.vue";
import HookSection from "../components/settings/sections/HookSection.vue";

const settings = useSettings();

const sectionTitle = computed(() => SECTION_TITLES[settings.activeSection.value]);
</script>

<template>
  <div class="settings-root" :class="{ 'dark-mode': settings.isDark.value }" data-view="settings">
    <svg class="settings-noise-defs" aria-hidden="true">
      <filter id="noise-filter">
        <feTurbulence baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise" />
        <feComposite operator="in" in="noise" in2="SourceGraphic" />
      </filter>
    </svg>

    <div class="app-shell">
      <SettingsSidebar :active="settings.activeSection.value" @change="settings.setSection" />

      <main class="main-area">
        <SettingsTopbar
          :title="sectionTitle"
          :is-dark="settings.isDark.value"
          @toggle-theme="settings.toggleTheme"
        />

        <div class="content-scroll">
          <GeneralSection v-if="settings.activeSection.value === 'general'" :state="settings" />
          <AssistantSection v-else-if="settings.activeSection.value === 'assistant'" :state="settings" />
          <PersonaSection v-else-if="settings.activeSection.value === 'persona'" :state="settings" />
          <ModelSection v-else-if="settings.activeSection.value === 'model'" :state="settings" />
          <PrivacySection v-else-if="settings.activeSection.value === 'privacy'" :state="settings" />
          <HookSection v-else-if="settings.activeSection.value === 'hooks'" :state="settings" />
        </div>
      </main>
    </div>
  </div>
</template>
