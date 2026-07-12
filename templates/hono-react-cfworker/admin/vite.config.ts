import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/openapi.json": "http://localhost:8787",
      "/api-docs": "http://localhost:8787",
      "/.well-known": "http://localhost:8787",
    },
  },
});
