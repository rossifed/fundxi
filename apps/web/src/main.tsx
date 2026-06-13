import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { set_api_base } from "@fundxi/core/infrastructure/api_client";
import { set_max_gross_leverage, set_shares_per_player } from "@fundxi/core/infrastructure/runtime_config";
import { set_stream_base } from "@fundxi/core/infrastructure/stream_client";

import { App } from "@/ui/shell/App";
import { AuthProvider } from "@/ui/shell/AuthContext";
import { BootstrapGate } from "@/ui/shell/BootstrapGate";
import "@/ui/design/globals.css";

// Vite injects these at build time. `@fundxi/core` is platform-agnostic and
// reads its config from setters so Metro (mobile) can load it too.
const vite_api_url = import.meta.env.VITE_API_URL;
if (vite_api_url) set_api_base(vite_api_url);
const vite_stream_url = import.meta.env.VITE_STREAM_URL;
if (vite_stream_url) set_stream_base(vite_stream_url);
// Shares-per-player denomination (display only). Configurable so it can change
// later without touching persisted data (stored quantity is N-independent).
const vite_shares_per_player = import.meta.env.VITE_SHARES_PER_PLAYER;
if (vite_shares_per_player) set_shares_per_player(Number(vite_shares_per_player));
const vite_max_leverage = import.meta.env.VITE_MAX_GROSS_LEVERAGE;
if (vite_max_leverage) set_max_gross_leverage(Number(vite_max_leverage));

const root_element = document.getElementById("root");
if (!root_element) throw new Error("Root element not found");

createRoot(root_element).render(
  <StrictMode>
    <BootstrapGate>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BootstrapGate>
  </StrictMode>,
);
