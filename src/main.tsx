import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./observability/ErrorBoundary";
import { initSentry, setCrashReportsEnabled } from "./observability/sentry";
import { sendsCrashReports, useSettingsStore } from "./state/settingsStore";
import { forgetRetiredKeys } from "./state/storage";
import { restoreLanguage } from "./i18n/googleTranslate";
import "./styles/global.css";
import "leaflet/dist/leaflet.css";

forgetRetiredKeys();

// Started before the first render so a fault during mount is still reported.
// With no DSN in the build this does nothing at all — see observability/sentry.
initSentry(sendsCrashReports(useSettingsStore.getState()));

// The settings store stays free of the SDK; the subscription is the seam. A
// runner turning reporting off in Settings stops it there and then rather than
// at the next reload.
useSettingsStore.subscribe((settings) =>
  setCrashReportsEnabled(sendsCrashReports(settings)),
);

// Started before the first render so the upload screen arrives already
// translated rather than flickering through English. With no language chosen
// this does nothing at all — no script, no cookie, no request.
restoreLanguage(useSettingsStore.getState().language);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
