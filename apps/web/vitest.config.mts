import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Browser specs have their own runner and must not be collected as unit tests.
    exclude: [...configDefaults.exclude, "e2e/**", ".e2e/**", "test-results/**"],
  },
});
