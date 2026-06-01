import type {
  AgentState,
  HookEvent,
  HookStatusChangedPayload,
  PermissionRequest,
  PermissionRequestPayload,
  PermissionResolvedPayload,
  PermissionAutoDismissPayload,
  PermissionResponse,
  PermissionDecision,
  AlwaysRule,
  QueuedPermission,
} from "@neo-companion/shared";
import { randomUUID } from "node:crypto";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface HookManagerEvents {
  onStatusChanged(payload: HookStatusChangedPayload): void;
  onPermissionRequest(payload: PermissionRequestPayload): void;
  onPermissionResolved(payload: PermissionResolvedPayload): void;
  onPermissionAutoDismiss(payload: PermissionAutoDismissPayload): void;
}

interface PendingApproval {
  request: PermissionRequest;
  resolve: (value: PermissionResponse) => void;
  reject: (reason: Error) => void;
}

export function createHookManager(events: HookManagerEvents) {
  const agentStates = new Map<string, AgentState>();
  const pendingApprovals = new Map<string, PendingApproval>();
  const alwaysRules: AlwaysRule[] = [];

  function pushEvent(event: HookEvent): void {
    agentStates.set(event.agentId, event.state);
    events.onStatusChanged({
      agentId: event.agentId,
      state: event.state,
      description: event.description,
    });

    // Auto-dismiss: if agent leaves waiting state, dismiss its pending requests
    if (event.state !== "waiting") {
      dismissByAgent(event.agentId, "agentStateChanged");
    }
  }

  function requestPermission(
    req: Omit<PermissionRequest, "requestId" | "timestamp">,
  ): Promise<PermissionResponse> {
    // Check always rules first
    if (checkAlways(req.agentId, req.command)) {
      return Promise.resolve({
        requestId: "always-" + randomUUID(),
        decision: "always",
      });
    }

    const requestId = randomUUID();
    const timestamp = Date.now();
    const fullReq: PermissionRequest = { ...req, requestId, timestamp };

    return new Promise<PermissionResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Mark stale after threshold (don't auto-reject, just detect)
        const pending = pendingApprovals.get(requestId);
        if (pending) {
          pending.reject(new Error("stale"));
          pendingApprovals.delete(requestId);
          events.onPermissionAutoDismiss({
            requestId,
            reason: "staleTimeout",
          });
        }
      }, STALE_THRESHOLD_MS);

      pendingApprovals.set(requestId, {
        request: fullReq,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
      });

      events.onPermissionRequest(fullReq);
    });
  }

  function resolvePermission(
    requestId: string,
    decision: PermissionDecision,
  ): void {
    const pending = pendingApprovals.get(requestId);
    if (!pending) return;

    // If "always", persist the rule
    if (decision === "always") {
      addAlwaysRule(pending.request.agentId, pending.request.command);
    }

    pending.resolve({ requestId, decision });
    pendingApprovals.delete(requestId);
    events.onPermissionResolved({ requestId, decision });
  }

  function checkAlways(agentId: string, command: string): boolean {
    return alwaysRules.some(
      (rule) =>
        rule.agentId === agentId && command.startsWith(rule.commandPrefix),
    );
  }

  function addAlwaysRule(agentId: string, command: string): void {
    // Don't duplicate
    if (checkAlways(agentId, command)) return;
    alwaysRules.push({ agentId, commandPrefix: command, createdAt: Date.now() });
  }

  function removeAlwaysRule(agentId: string, commandPrefix: string): void {
    const idx = alwaysRules.findIndex(
      (r) => r.agentId === agentId && r.commandPrefix === commandPrefix,
    );
    if (idx !== -1) alwaysRules.splice(idx, 1);
  }

  function getAlwaysRules(): AlwaysRule[] {
    return [...alwaysRules];
  }

  function getAgentStates(): Map<string, AgentState> {
    return new Map(agentStates);
  }

  function getPendingRequests(): QueuedPermission[] {
    return Array.from(pendingApprovals.values()).map((p) => ({
      ...p.request,
      status: isStale(p.request) ? "stale" : "pending",
    }));
  }

  function isStale(req: PermissionRequest): boolean {
    const currentState = agentStates.get(req.agentId);
    if (currentState && currentState !== "waiting") return true;
    if (Date.now() - req.timestamp > STALE_THRESHOLD_MS) return true;
    return false;
  }

  function dismissByAgent(
    agentId: string,
    reason: "agentStateChanged" | "staleTimeout",
  ): void {
    for (const [requestId, pending] of pendingApprovals) {
      if (pending.request.agentId === agentId) {
        pending.reject(new Error(reason));
        pendingApprovals.delete(requestId);
        events.onPermissionAutoDismiss({ requestId, reason });
      }
    }
  }

  function close(): void {
    // Reject all pending approvals on shutdown
    for (const [requestId, pending] of pendingApprovals) {
      pending.reject(new Error("shutdown"));
      pendingApprovals.delete(requestId);
    }
  }

  return {
    pushEvent,
    requestPermission,
    resolvePermission,
    getAgentStates,
    getPendingRequests,
    getAlwaysRules,
    removeAlwaysRule,
    close,
  };
}
