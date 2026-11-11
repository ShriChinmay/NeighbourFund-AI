import React from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main style={{ fontFamily: "system-ui", maxWidth: 800, margin: "4rem auto", padding: "1rem" }}>
      <h1>NeighbourFund AI</h1>
      <p>Platform foundation is ready. Project workflows are next.</p>
    </main>
  </React.StrictMode>
);