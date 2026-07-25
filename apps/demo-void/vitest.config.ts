import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["client/**"],
    // This app has no tests yet; an empty suite shouldn't fail `pnpm test`.
    passWithNoTests: true,
  },
});
