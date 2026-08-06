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
