import type { WebSocket } from "ws";
import type { WsMessage } from "@neo-companion/shared";

export class WsHub {
  private readonly clients = new Set<WebSocket>();

  add(client: WebSocket) {
    this.clients.add(client);
    client.on("close", () => this.clients.delete(client));
  }

  broadcast<T>(message: WsMessage<T>) {
    const serialized = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(serialized);
      }
    }
  }
}
