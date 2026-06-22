import type { FastifyInstance } from "fastify";
import type { NeoDatabase } from "@neo-companion/db";
import { createTaskStore } from "@neo-companion/db";
import { WsHub } from "../ws-hub";

export function registerTaskRoutes(app: FastifyInstance, database: NeoDatabase, hub: WsHub) {
  const taskStore = createTaskStore(database);

  app.get("/api/tasks", async () => taskStore.list());

  app.post("/api/tasks", async (request, reply) => {
    const body = request.body as { title?: string };
    if (!body.title?.trim()) return reply.code(400).send({ error: "title is required" });
    const task = taskStore.create(body.title);
    hub.broadcast({ type: "task:statusChanged", payload: task });
    return task;
  });

  app.patch("/api/tasks/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const task = taskStore.patch(params.id, request.body as { title?: string; status?: "open" | "done" });
    if (!task) return reply.code(404).send({ error: "task not found" });
    hub.broadcast({ type: "task:statusChanged", payload: task });
    return task;
  });
}
