import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // автообновление SW
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: true, // ⚡️ чтобы PWA работал и в dev-режиме
      },
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
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
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
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
          if (id.includes("/src/pages/reports/")) return "reports";
          if (id.includes("/src/pages/ai/")) return "ai";
          if (id.includes("/src/pages/opening/")) return "opening";
          if (id.includes("/src/pages/deadstock/")) return "deadstock";
          if (id.includes("/src/components/dashboard/")) return "dashboard";
        },
      },
    },
  },
});
