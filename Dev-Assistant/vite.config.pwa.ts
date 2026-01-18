import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay() as PluginOption,
    ...(VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      
      manifest: {
        name: "hndld - Household Concierge",
        short_name: "hndld",
        description: "White-glove household operations, handled.",
        theme_color: "#1D2A44",
        background_color: "#F6F2EA",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["lifestyle", "productivity"],
        icons: [
          {
            src: "/favicon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ],
        shortcuts: [
          {
            name: "New Request",
            short_name: "Request",
            description: "Submit a new request",
            url: "/requests?action=new",
          },
          {
            name: "View Tasks",
            short_name: "Tasks",
            description: "View all tasks",
            url: "/tasks",
          }
        ]
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        globIgnores: ["**/*.map"],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,

        runtimeCaching: [
          // Google Fonts - Cache First
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // API: Dashboard - Stale While Revalidate
          {
            urlPattern: /\/api\/(dashboard|today|this-week)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-dashboard-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // API: Lists - Network First with fallback
          {
            urlPattern: /\/api\/(tasks|requests|approvals|updates|vendors|spending|calendar-events|people|preferences)$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-lists-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 10 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 10,
            },
          },

          // API: Individual items - Network First
          {
            urlPattern: /\/api\/(tasks|requests|approvals|updates|vendors|spending)\/[a-zA-Z0-9-]+$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-items-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 5,
            },
          },

          // API: Static data - Stale While Revalidate
          {
            urlPattern: /\/api\/(household\/settings|household\/locations|onboarding\/status|user-profile)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "api-static-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

          // API: Mutations with Background Sync
          {
            urlPattern: /\/api\/.*/i,
            method: "POST",
            handler: "NetworkOnly",
            options: {
              backgroundSync: {
                name: "api-post-queue",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            method: "PATCH",
            handler: "NetworkOnly",
            options: {
              backgroundSync: {
                name: "api-patch-queue",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },

          // Uploaded files - Cache First
          {
            urlPattern: /\/uploads\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "uploads-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],

        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\/.*/, /^\/uploads\/.*/],
      },

      devOptions: { enabled: false },
    }) as PluginOption[]),

    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer() as PluginOption),
          await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner() as PluginOption),
        ]
      : []),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  
  root: path.resolve(import.meta.dirname, "client"),
  
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "wouter"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu"],
          charts: ["recharts"],
        },
      },
    },
  },

  server: {
    fs: { strict: true, deny: ["**/.*"] },
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
});
