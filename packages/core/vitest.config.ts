import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No DOM here: this package is the part of the stack the browser and the agent both run.
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules"],
  },
});
