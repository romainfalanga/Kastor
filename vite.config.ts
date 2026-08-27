import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev : `npm run dev` (frontend, port 5173) + `npm run dev:worker` (API, port 8787).
// Le proxy ci-dessous route les appels /api vers wrangler dev.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
