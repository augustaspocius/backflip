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
  },
})
