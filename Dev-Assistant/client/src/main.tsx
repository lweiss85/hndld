import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
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

createRoot(document.getElementById("root")!).render(<App />);
