"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * True after the component mounted on the client — implemented with
 * useSyncExternalStore so there is no cascading setState after hydration.
 * Used to gate rendering of persisted (localStorage-backed) UI so the SSR
 * markup always matches the first client render.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
