import { invoke } from "@tauri-apps/api/core";

export function attachWallpaper(windowLabel: string) {
  return invoke<void>("plugin:wallpaper|attach", {
    payload: { windowLabel }
  });
}

export function detachWallpaper(windowLabel: string) {
  return invoke<void>("plugin:wallpaper|detach", {
    payload: { windowLabel }
  });
}
