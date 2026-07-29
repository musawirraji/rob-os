"use client";

import { useRouter } from "next/navigation";

/**
 * Thin wrapper over the framework router. Application hooks depend on this
 * shape, not on `next/navigation`, so screens stay framework-agnostic and the
 * router can be swapped without touching feature code.
 */
export type NavigationService = {
  go: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  prefetch: (href: string) => void;
};

export function useNavigation(): NavigationService {
  const router = useRouter();

  return {
    go: (href) => router.push(href),
    replace: (href) => router.replace(href),
    back: () => router.back(),
    prefetch: (href) => router.prefetch(href),
  };
}
