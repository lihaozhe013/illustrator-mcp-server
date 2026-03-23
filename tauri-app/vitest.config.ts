import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.mjs", "apps/desktop/src/**/*.test.{ts,tsx}"],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
