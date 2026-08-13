import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./observability/ErrorBoundary";
import { useSettingsStore } from "./state/settingsStore";
import { forgetRetiredKeys } from "./state/storage";
import { restoreLanguage } from "./i18n/googleTranslate";
import { applyTheme, watchSystemTheme } from "./styles/theme";
import "./styles/global.css";
import "leaflet/dist/leaflet.css";

forgetRetiredKeys();

// The snippet in `index.html` has already done this, before the first paint —
// this is the same answer arrived at again from the parsed settings, so that a
// stored value the snippet's cruder read got wrong is corrected here. The watch
// is what keeps an unset choice following the system for the rest of the visit.
applyTheme(useSettingsStore.getState().theme);
watchSystemTheme(() => useSettingsStore.getState().theme);

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
