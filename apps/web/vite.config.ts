import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@fundxi/core": fileURLToPath(new URL("../../packages/core/src", import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: true },
});
