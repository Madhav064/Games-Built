import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./index.css";

async function init() {
  if (typeof window !== "undefined" && (window as any).CrazyGames) {
    try {
      await (window as any).CrazyGames.SDK.init();
    } catch (e) {
      console.warn("CrazyGames SDK init failed", e);
    }
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

init();
