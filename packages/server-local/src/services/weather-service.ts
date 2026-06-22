import type { WeatherSummary } from "@neo-companion/shared";

interface GeocodeResponse {
  results?: Array<{ name: string; latitude: number; longitude: number }>;
}

interface ForecastResponse {
  current?: { temperature_2m?: number; precipitation?: number };
}

/** Cache weather for 10 minutes to avoid hammering open-meteo on every poll. */
const CACHE_TTL_MS = Number(process.env.NEO_WEATHER_CACHE_TTL_MS ?? 10 * 60 * 1000);
let cache: { value: WeatherSummary; expiresAt: number } | null = null;

async function fetchWeatherSummary(fetcher: typeof fetch): Promise<WeatherSummary> {
  const city = process.env.NEO_CITY?.trim();
  let latitude = Number(process.env.NEO_LAT);
  let longitude = Number(process.env.NEO_LON);
  let resolvedCity = city || "manual location";

  if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && city) {
    const geocode = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`);
    const data = (await geocode.json()) as GeocodeResponse;
    const first = data.results?.[0];
    if (first) {
      latitude = first.latitude;
      longitude = first.longitude;
      resolvedCity = first.name;
    }
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      city: resolvedCity,
      temperatureC: null,
      precipitationChance: null,
      text: "还没有配置城市，天气碎碎念先安静一下。"
    };
  }

  const forecast = await fetcher(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation`);
  const data = (await forecast.json()) as ForecastResponse;
  const temperatureC = data.current?.temperature_2m ?? null;
  const precipitation = data.current?.precipitation ?? null;
  const rainy = precipitation !== null && precipitation > 0;

  return {
    city: resolvedCity,
    temperatureC,
    precipitationChance: precipitation,
    text: rainy
      ? `${resolvedCity} 现在可能有雨，出门前记得看一眼伞。`
      : `${resolvedCity} 现在约 ${temperatureC ?? "未知"}°C，适合慢慢进入今天的节奏。`
  };
}

export async function getWeatherSummary(fetcher: typeof fetch = fetch): Promise<WeatherSummary> {
  // Serve from cache when fresh.
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }
  const value = await fetchWeatherSummary(fetcher);
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/** Bypass cache (used by tests / force-refresh query). */
export function clearWeatherCache(): void {
  cache = null;
}
