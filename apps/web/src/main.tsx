import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/ui/shell/App";
import { AuthProvider } from "@/ui/shell/AuthContext";
import { BootstrapGate } from "@/ui/shell/BootstrapGate";
import "@/ui/design/globals.css";

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
