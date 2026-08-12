import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
// Reuses the prototype's stylesheet verbatim so the rebuild keeps the current
// appearance. Restyling is explicitly out of scope for this phase.
import "./styles.css";
// Loaded after styles.css so shell-layout fixes win over colliding legacy rules.
import "./app.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing");

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

/**
 * Register the service worker.
 *
 * Only the prototype's `app.js` ever did this, so the rebuilt app — the one
 * actually used — had no service worker at all and did not work offline in any
 * form. At a field with no signal it simply failed to load.
 *
 * The script lives at the origin root, so its scope covers both apps and one
 * registration serves them. Registered after first paint so it never competes
 * with the bundle for the first load.
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A blocked or unsupported registration must not take the app down; it
      // only costs the offline behaviour.
    });
  });
}
