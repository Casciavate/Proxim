import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server runs on 5173; the PROXIM backend (server.js) runs on 3001.
// The frontend talks to the backend by absolute URL (see VITE_API_URL) so that
// cookies set by the OAuth callback stay on the backend origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
});
