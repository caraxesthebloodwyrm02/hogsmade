import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    optimizeDeps: {
      // Monaco is hoisted to the workspace root in this monorepo. Let Vite serve it
      // from the real package location instead of prebundling against a missing
      // workspace-local node_modules path.
      exclude: ["monaco-editor"],
    },
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
