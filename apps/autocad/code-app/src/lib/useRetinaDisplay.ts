import { useSyncExternalStore } from "react";

/** Matches Apple Retina (2×) and equivalent high-DPI displays. */
export const RETINA_MEDIA_QUERY =
  "(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)";

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(RETINA_MEDIA_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(RETINA_MEDIA_QUERY).matches
    || window.devicePixelRatio >= 2;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useRetinaDisplay(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
