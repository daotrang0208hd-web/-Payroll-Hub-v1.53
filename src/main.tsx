import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./index.css";

declare global {
  interface Window {
    __SUPABASE_CONFIG__?: {
      url: string;
      anonKey: string;
    };
  }
}

async function start() {
  try {
    const res = await fetch("/api/supabase-config");
    if (res.ok) {
      const data = await res.json();
      if (data && data.url && data.anonKey) {
        window.__SUPABASE_CONFIG__ = data;
        console.log("[Supabase Config] Dynamic configuration loaded successfully.");
      }
    }
  } catch (err) {
    console.warn("[Supabase Config] Failed to fetch dynamic configuration, falling back to static env:", err);
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

start();
