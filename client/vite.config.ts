import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Only TUTOR_ENABLED is read from the root .env, so nothing else reaches the client.
  const env = loadEnv(mode, path.resolve(import.meta.dirname, ".."), "TUTOR_ENABLED");

  return {
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.TUTOR_ENABLED": JSON.stringify(env.TUTOR_ENABLED ?? ""),
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/api": "http://localhost:3001",
      },
    },
  };
});
