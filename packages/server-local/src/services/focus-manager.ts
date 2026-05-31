import type { FocusSession, FocusTickPayload } from "@neo-companion/shared";
import { createFocusStore, type NeoDatabase } from "@neo-companion/db";

export interface FocusManagerEvents {
  onTick(payload: FocusTickPayload): void;
  onComplete(session: FocusSession): void;
}

export function createFocusManager(database: NeoDatabase, events: FocusManagerEvents) {
  const store = createFocusStore(database);
  const timers = new Map<string, NodeJS.Timeout>();

  function start(taskId: string | null, durationMinutes: number) {
    const session = store.create(taskId, durationMinutes);
    const startedAt = Date.now();
    const totalSeconds = Math.max(1, Math.round(durationMinutes * 60));

    const timer = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
      events.onTick({ sessionId: session.id, elapsedSeconds, remainingSeconds });

      if (remainingSeconds <= 0) {
        complete(session.id);
      }
    }, 1000);

    timers.set(session.id, timer);
    return session;
  }

  function complete(id: string) {
    const timer = timers.get(id);
    if (timer) {
      clearInterval(timer);
      timers.delete(id);
    }

    const session = store.updateStatus(id, "completed");
    if (session) {
      events.onComplete(session);
    }
    return session;
  }

  function cancel(id: string) {
    const timer = timers.get(id);
    if (timer) {
      clearInterval(timer);
      timers.delete(id);
    }
    return store.updateStatus(id, "cancelled");
  }

  function close() {
    for (const timer of timers.values()) clearInterval(timer);
    timers.clear();
  }

  return { start, complete, cancel, close, get: store.get };
}
