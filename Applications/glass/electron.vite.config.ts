import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    server: {
      watch: { usePolling: true, interval: 500 },
    },
    build: {
      rollupOptions: {
        input: "src/renderer/index.html",
      },
    },
  },
});
