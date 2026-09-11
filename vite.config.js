import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single-origin deployment on Vercel: the frontend calls relative /api/*
// paths, and Vercel routes those to api/[...all].js. In local dev the two
// run on separate ports (5173 / 3001), so this proxy makes them look
// same-origin to the browser too — matching production and avoiding CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
