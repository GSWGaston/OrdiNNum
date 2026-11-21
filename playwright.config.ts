import { defineConfig, devices } from "@playwright/test";

// Banco PGlite separado (.pglite-e2e) para não misturar com o de desenvolvimento.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", ...devices["Pixel 7"] },
  webServer: {
    command: "npx drizzle-kit migrate && npx next dev -p 3100",
    url: "http://localhost:3100/entrar",
    env: { PGLITE_DIR: "./.pglite-e2e" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
