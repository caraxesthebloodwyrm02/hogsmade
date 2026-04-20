import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // TODO: raise to fleet standard (40/35/30) after first coverage run confirms baseline
      thresholds: {
        lines: 10,
        functions: 3,
        branches: 3,
        statements: 10,
      },
    },
  },
});
