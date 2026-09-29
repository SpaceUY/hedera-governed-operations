import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "~~": path.resolve(__dirname) },
  },
  // Inlined packages ship sourcemaps without sources; Vite would warn once per file.
  logLevel: "error",
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // These packages ship ESM with extensionless or directory imports; Node cannot resolve them, Vite can.
    server: { deps: { inline: ["@scaffold-hbar-ui/hooks", "@scaffold-hbar-ui/components"] } },
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    passWithNoTests: true,
  },
});
