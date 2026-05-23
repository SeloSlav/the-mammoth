import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { EditorCombatSimSpacetimeProvider } from "./spacetime/EditorCombatSimSpacetimeProvider.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <EditorCombatSimSpacetimeProvider>
    <StrictMode>
      <App />
    </StrictMode>
  </EditorCombatSimSpacetimeProvider>,
);
