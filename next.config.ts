import path from "node:path";
import type { NextConfig } from "next";

/**
 * Design tokens live in `src/shared/design/_tokens.scss` and are auto-injected
 * into every stylesheet Next compiles, so `$ro-*` variables resolve without an
 * explicit `@use`. Without this the global sheet fails to compile.
 *
 * `_tokens.scss` itself is only ever reached via `@use` from another sheet
 * (never imported from JS), so the injection never applies to it.
 */
const designDir = path.join(process.cwd(), "src/shared/design");

const nextConfig: NextConfig = {
  // Pin the workspace root: a lockfile higher up the tree would otherwise be
  // inferred and resolve modules from the wrong directory.
  turbopack: {
    root: process.cwd(),
  },
  sassOptions: {
    loadPaths: [designDir],
    includePaths: [designDir],
    additionalData: '@use "tokens" as *;\n',
    silenceDeprecations: ["legacy-js-api", "import"],
  },
  experimental: {
    /**
     * Keep fetched route segments in the client cache.
     *
     * Every screen here is `force-dynamic`, and the default `dynamic` stale time is
     * **0 seconds** — so returning to a tab you looked at two seconds ago refetched
     * the whole thing from the server. Against a hosted database that is a few
     * hundred milliseconds of latency per query, paid again on every back-and-forth.
     *
     * 30s covers the way this app is actually used — flicking between People, a
     * record and back — while still being short enough that a brief or a queue is
     * never meaningfully out of date. `static` applies to what the sidebar
     * prefetches; a router.refresh() after a write clears both regardless.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
