import { computed, ref } from "vue";
import type {
  HookStatusChangedPayload,
  PermissionAutoDismissPayload,
  PermissionRequestPayload,
  PermissionResolvedPayload,
  QueuedPermission,
  WsMessage,
} from "@neo-companion/shared";
import { sendWsMessage } from "../api";

export function usePermission() {
  const currentRequest = ref<QueuedPermission | null>(null);
  const queue = ref<QueuedPermission[]>([]);

  const visible = computed(() => currentRequest.value !== null);

  function handleWsMessage(message: WsMessage) {
    if (message.type === "permission:request") {
      const payload = message.payload as PermissionRequestPayload;
      const queued: QueuedPermission = { ...payload, status: "pending" };
      if (!currentRequest.value) {
        currentRequest.value = { ...queued, status: "active" };
      } else {
        queue.value = [...queue.value, queued];
      }
    }

    if (message.type === "permission:resolved") {
      const payload = message.payload as PermissionResolvedPayload;
      // Remove from queue or current, then advance
      if (currentRequest.value?.requestId === payload.requestId) {
        advanceQueue();
      } else {
        queue.value = queue.value.filter((r) => r.requestId !== payload.requestId);
      }
    }

    if (message.type === "permission:autoDismiss") {
      const payload = message.payload as PermissionAutoDismissPayload;
      if (currentRequest.value?.requestId === payload.requestId) {
        advanceQueue();
      } else {
        queue.value = queue.value.filter((r) => r.requestId !== payload.requestId);
      }
    }

    if (message.type === "hook:statusChanged") {
      const payload = message.payload as HookStatusChangedPayload;
      markStaleByAgent(payload.agentId);
    }
  }

  function advanceQueue() {
    if (queue.value.length > 0) {
      const [next, ...rest] = queue.value;
      currentRequest.value = { ...next, status: "active" };
      queue.value = rest;
    } else {
      currentRequest.value = null;
    }
  }

  function markStaleByAgent(agentId: string) {
    // Mark current request as stale if agent state changed
    if (currentRequest.value?.agentId === agentId) {
      currentRequest.value = { ...currentRequest.value, status: "stale" };
    }
    // Mark queued items as stale if agent state changed
    queue.value = queue.value.map((item) =>
      item.agentId === agentId ? { ...item, status: "stale" as const } : item,
    );
  }

  function allow() {
    if (!currentRequest.value) return;
    sendWsMessage({
      type: "permission:response",
      payload: { requestId: currentRequest.value.requestId, decision: "allow" },
    });
  }

  function deny() {
    if (!currentRequest.value) return;
    sendWsMessage({
      type: "permission:response",
      payload: { requestId: currentRequest.value.requestId, decision: "deny" },
    });
  }

  function always() {
    if (!currentRequest.value) return;
    sendWsMessage({
      type: "permission:response",
      payload: { requestId: currentRequest.value.requestId, decision: "always" },
    });
  }

  return {
    currentRequest,
    queue,
    visible,
    handleWsMessage,
    allow,
    deny,
    always,
  };
}
