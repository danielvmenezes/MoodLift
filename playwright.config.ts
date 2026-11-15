import { defineConfig, devices } from "@playwright/test";

// Reuses the dev server on :3000 if it's already running.
const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [
    { name: "mobile-small", use: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true } },
    { name: "mobile", use: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true } },
    { name: "laptop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "iphone-safari", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
