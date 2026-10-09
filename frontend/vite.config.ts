import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const backendTarget = process.env.VITE_BACKEND_URL ?? "http://localhost:8000";

const proxiedPaths = ["/api", "/v1", "/health"];

const FONT_FILE = /\.(woff2?|ttf|otf)$/;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxiedPaths.map((path) => [path, { target: backendTarget, changeOrigin: false }]),
    ),
  },
  build: {
    sourcemap: true,
    // Never inline fonts as data: URLs: the production CSP allows fonts from 'self' only.
    assetsInlineLimit: (filePath) => (FONT_FILE.test(filePath) ? false : undefined),
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache across deploys; app code changes more often.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "tanstack", test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: "radix", test: /node_modules[\\/](@radix-ui|radix-ui)[\\/]/ },
            { name: "charts", test: /node_modules[\\/](recharts|d3-[a-z-]+|victory-vendor)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
