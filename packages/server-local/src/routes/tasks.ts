import type { FastifyInstance } from "fastify";
import type { NeoDatabase } from "@neo-companion/db";
import {
  TaskCreateBodySchema,
  TaskPatchBodySchema,
  TaskListQuerySchema,
  IdParamSchema,
  type TaskCreateBody,
  type TaskPatchBody,
  type TaskListQuery,
  type IdParam
} from "@neo-companion/shared";
import { NotFoundError } from "../errors";
import { createTaskStore } from "@neo-companion/db";
import { WsHub } from "../ws-hub";

export function registerTaskRoutes(app: FastifyInstance, database: NeoDatabase, hub: WsHub) {
  const taskStore = createTaskStore(database);

  app.get<{ Querystring: TaskListQuery }>(
    "/api/tasks",
    { schema: { querystring: TaskListQuerySchema } },
    async (request) => {
      const { limit, offset } = request.query;
      return taskStore.list({ limit: limit ?? 20, offset: offset ?? 0 });
    }
  );

  app.post<{ Body: TaskCreateBody }>(
    "/api/tasks",
    { schema: { body: TaskCreateBodySchema } },
    async (request) => {
      const task = taskStore.create(request.body.title);
      hub.broadcast({ type: "task:statusChanged", payload: task });
      return task;
    }
  );

  app.patch<{ Params: IdParam; Body: TaskPatchBody }>(
    "/api/tasks/:id",
    { schema: { params: IdParamSchema, body: TaskPatchBodySchema } },
    async (request) => {
      const task = taskStore.patch(request.params.id, request.body);
      if (!task) throw new NotFoundError("task", request.params.id);
      hub.broadcast({ type: "task:statusChanged", payload: task });
      return task;
    }
  );
}
