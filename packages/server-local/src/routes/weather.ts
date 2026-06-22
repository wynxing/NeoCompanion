import type { FastifyInstance } from "fastify";
import { getWeatherSummary } from "../services/weather-service";

export function registerWeatherRoutes(
  app: FastifyInstance,
  weather: (() => Promise<unknown>) | undefined
) {
  app.get("/api/weather", async () => weather?.() ?? getWeatherSummary());
}
