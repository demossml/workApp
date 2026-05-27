import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Кэширование включено: статика из кэша, API — network-first
      selfDestroying: false,
      registerType: "autoUpdate",
      workbox: {
        cacheId: "work-app-v2",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // API: пробуем сеть, при офлайне — кэш
            urlPattern: /^\/api\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            // Статика (JS/CSS): сразу из кэша, в фоне обновляем
            urlPattern: /\.(?:js|css|svg|png|jpg|webp)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
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
      "/api": process.env.VITE_API_URL || "http://localhost:8787",
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
