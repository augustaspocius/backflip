import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// @spec L2-TEST-01

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Vitest runs in node with no `react-server` condition, so `server-only`
      // resolves to the copy that throws on import — which would make any
      // server module untestable. Node IS the server, so map it to the
      // package's own empty stub. Next's bundler still enforces the real
      // boundary at build time; this only affects the test runner.
      "server-only": fileURLToPath(
        new URL("../../node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
    server: {
      deps: {
        // Externalized deps load via native Node ESM, which can't resolve
        // next-auth's extensionless `import ... from "next/server"` — next
        // ships no "exports" map, so Node won't probe for the file the way
        // `require` or Next's own bundler do. Inlining routes next-auth
        // through Vite's resolver instead, which handles it fine.
        inline: ["next-auth"],
      },
    },
  },
})
