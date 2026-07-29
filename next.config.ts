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
};

export default nextConfig;
