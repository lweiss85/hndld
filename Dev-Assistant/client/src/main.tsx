import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection",
      "NetworkError",
    ],
    beforeSend(event) {
      if (import.meta.env.DEV) {
        return null;
      }
      return event;
    },
  });
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  registerSW({
    onRegistered(registration) {
      console.log("[SW] Service worker registered", registration);
    },
    onRegisterError(error) {
      console.error("[SW] Registration failed:", error);
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
