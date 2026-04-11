import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { SpacetimeProvider } from "./spacetime/SpacetimeProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <SpacetimeProvider>
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  </SpacetimeProvider>,
);
