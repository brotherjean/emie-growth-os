import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:5174",
      "/auth": "http://localhost:5174",
      "/share": "http://localhost:5174",
    },
  },
});
