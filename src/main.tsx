import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadPersisted, startPersistence } from "./core/research/persistence";
import { useResearchStore } from "./core/research/store";
import "./styles.css";
import "highlight.js/styles/github.css";

// Rehydrate before the first render so the research panel and both tabs are
// rebuilt from persisted messages (spec §9).
useResearchStore.getState().hydrate(loadPersisted());
startPersistence();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
