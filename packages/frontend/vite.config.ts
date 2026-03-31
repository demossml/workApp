import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Временно выключаем кэширование SW, чтобы гарантированно убрать старые бандлы у пользователей.
      selfDestroying: true,
      registerType: "autoUpdate", // автообновление SW
      workbox: {
        cacheId: "work-app-v2",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: true, // ⚡️ чтобы PWA работал и в dev-режиме
      },
      includeAssets: ["favicon.svg", "apple-touch-icon.svg"],
      manifest: {
        name: "Evo App",
        short_name: "Evo",
        description: "Отчёты и аналитика для Evotor",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "/pwa-512x512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
          {
            src: "/pwa-512x512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@app": path.resolve(__dirname, "src/app"),
      "@ai": path.resolve(__dirname, "src/ai"),
      "@widgets": path.resolve(__dirname, "src/widgets"),
      "@features": path.resolve(__dirname, "src/features"),
      "@entities": path.resolve(__dirname, "src/entities"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/chart.js") ||
              id.includes("/react-chartjs-2") ||
              id.includes("/recharts")
            ) {
              return "charts";
            }
            if (id.includes("/framer-motion") || id.includes("/motion")) {
              return "motion";
            }
            if (id.includes("/@radix-ui")) return "radix";
            if (
              id.includes("/date-fns") ||
              id.includes("/xlsx") ||
              id.includes("/html-to-image")
            ) {
              return "utils";
            }
            return "vendor";
          }
        },
      },
    },
  },
});
