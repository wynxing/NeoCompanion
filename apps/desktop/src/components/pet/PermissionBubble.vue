<script setup lang="ts">
import { computed } from "vue";
import type { QueuedPermission } from "@neo-companion/shared";

const props = defineProps<{
  request: QueuedPermission | null;
  queue: QueuedPermission[];
  visible: boolean;
}>();

const emit = defineEmits<{
  allow: [requestId: string];
  deny: [requestId: string];
  always: [requestId: string];
}>();

function getInitials(agentId: string): string {
  const parts = agentId.split("/");
  const name = parts[0] ?? agentId;
  return name.slice(0, 2).toUpperCase();
}

function getAgentType(agentId: string): string {
  if (agentId.startsWith("claude")) return "claude";
  if (agentId.startsWith("ci")) return "ci";
  return "custom";
}

function getSeverityLevel(severity: number): string {
  if (severity >= 7) return "high";
  if (severity >= 4) return "mid";
  return "low";
}

function getSeverityLabel(severity: number): string {
  if (severity >= 7) return "高";
  if (severity >= 4) return "中";
  return "低";
}

const reversedQueue = computed(() => [...props.queue].reverse());
</script>

<template>
  <div class="permission-stack" v-if="visible && request" aria-label="权限审批">
    <!-- Queue items (background, mini) -->
    <div
      v-for="(item, index) in reversedQueue"
      :key="item.requestId"
      class="bubble-mini"
      :style="{ '--index': index }"
    >
      <div class="agent-avatar-mini" :class="getAgentType(item.agentId)">
        {{ getInitials(item.agentId) }}
      </div>
    </div>

    <!-- Active permission bubble -->
    <div
      class="permission-bubble"
      :class="{ stale: request.status === 'stale' }"
    >
      <div class="bubble-header">
        <div class="agent-avatar" :class="getAgentType(request.agentId)">
          {{ getInitials(request.agentId) }}
        </div>
        <div class="agent-info">
          <div class="agent-name">{{ request.agentId }}</div>
          <div class="agent-state">请求执行权限</div>
        </div>
        <div class="severity-badge" :class="getSeverityLevel(request.severity)">
          <div class="severity-dots">
            <div class="severity-dot" :class="{ active: request.severity >= 4, [getSeverityLevel(request.severity)]: request.severity >= 4 }"></div>
            <div class="severity-dot" :class="{ active: request.severity >= 7, [getSeverityLevel(request.severity)]: request.severity >= 7 }"></div>
            <div class="severity-dot" :class="{ active: request.severity >= 9, [getSeverityLevel(request.severity)]: request.severity >= 9 }"></div>
          </div>
          {{ getSeverityLabel(request.severity) }}
        </div>
      </div>

      <div class="bubble-command">{{ request.command }}</div>
      <div class="bubble-description" v-if="request.description">{{ request.description }}</div>

      <div class="bubble-actions">
        <button class="bubble-btn deny" @click="emit('deny', request.requestId)">拒绝</button>
        <button class="bubble-btn always" @click="emit('always', request.requestId)">总是允许</button>
        <button class="bubble-btn allow" @click="emit('allow', request.requestId)">允许</button>
      </div>

      <div class="stale-notice">此请求已过时</div>
    </div>
  </div>
</template>
