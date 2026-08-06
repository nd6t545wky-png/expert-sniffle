import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Reuses the prototype's stylesheet verbatim so the rebuild keeps the current
// appearance. Restyling is explicitly out of scope for this phase.
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
