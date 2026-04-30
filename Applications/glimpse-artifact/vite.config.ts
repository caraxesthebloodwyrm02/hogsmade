import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { glimpseApiPlugin } from "./server/vite-api-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), glimpseApiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
});
