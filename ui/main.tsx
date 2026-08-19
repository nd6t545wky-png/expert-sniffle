import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PhysioView } from "./components/PhysioView";
import { readShareLink } from "../src/domain/physioShare";
import { ErrorBoundary } from "./ErrorBoundary";
// Reuses the prototype's stylesheet verbatim so the rebuild keeps the current
// appearance. Restyling is explicitly out of scope for this phase.
import "./styles.css";
// Loaded after styles.css so shell-layout fixes win over colliding legacy rules.
import "./app.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing");

/**
 * A shared link mounts the viewer instead of the app.
 *
 * Chosen here rather than as a page inside the app so that a physio's browser
 * never runs the athlete's application at all: no stored state is read, no
 * sync key is looked for, and there is no route from this page to one that
 * writes. Read-only is enforced by what is mounted.
 */
const shared = readShareLink(window.location.search, window.location.hash);

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>{shared ? <PhysioView /> : <App />}</ErrorBoundary>
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
