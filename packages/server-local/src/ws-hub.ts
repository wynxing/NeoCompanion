import type { WebSocket } from "ws";
import type { WsMessage } from "@neo-companion/shared";

/** Drop clients whose send buffer exceeds this many bytes (slow consumer). */
const BACKPRESSURE_THRESHOLD = 1_048_576; // 1 MB
/** Drop clients that fail to respond to a protocol-level ping within 2 cycles. */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface ClientState {
  socket: WebSocket;
  isAlive: boolean;
  droppedCount: number;
}

/**
 * WebSocket hub: tracks connected clients, broadcasts messages with backpressure
 * protection, and runs a heartbeat loop to terminate dead connections.
 */
export class WsHub {
  private readonly clients = new Map<WebSocket, ClientState>();
  private heartbeat: NodeJS.Timeout | null = null;

  add(client: WebSocket) {
    const state: ClientState = { socket: client, isAlive: true, droppedCount: 0 };
    this.clients.set(client, state);
    client.on("pong", () => {
      state.isAlive = true;
    });
    client.on("close", () => {
      this.clients.delete(client);
    });
    // Lazily start the heartbeat on the first client.
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
      // Don't keep the process alive solely for the heartbeat.
      this.heartbeat.unref?.();
    }
  }

  broadcast<T>(message: WsMessage<T>) {
    const serialized = JSON.stringify(message);
    for (const [client, state] of this.clients) {
      if (client.readyState !== 1) continue;
      // Backpressure: skip this message if the kernel buffer is already large.
      if (client.bufferedAmount > BACKPRESSURE_THRESHOLD) {
        state.droppedCount++;
        // Repeated offenders are likely dead; terminate them.
        if (state.droppedCount > 5) {
          client.terminate();
          this.clients.delete(client);
        }
        continue;
      }
      // Reset the drop counter once we successfully send.
      state.droppedCount = 0;
      client.send(serialized);
    }
  }

  /** Heartbeat tick: ping alive clients, terminate those that didn't pong last cycle. */
  private tick() {
    for (const [client, state] of this.clients) {
      if (!state.isAlive) {
        // No pong since last ping → dead connection.
        client.terminate();
        this.clients.delete(client);
        continue;
      }
      state.isAlive = false;
      client.ping();
    }
  }

  /** Broadcast a shutdown signal and close all WS connections (1001). */
  close() {
    this.broadcast({ type: "server:shutdown", payload: {} });
    for (const [client] of this.clients) {
      if (client.readyState === 1 || client.readyState === 2) {
        client.close(1001, "server shutdown");
      }
    }
    this.clients.clear();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
