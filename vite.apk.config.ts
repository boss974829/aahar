import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./src/apk", import.meta.url)),
  publicDir: false,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/lib/records.functions",
        replacement: fileURLToPath(new URL("./src/apk/local-records.ts", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("./android/app/src/main/assets/www", import.meta.url)),
    emptyOutDir: true,
    assetsDir: "assets",
  },
  // keep the workspace root as the module boundary for files outside src/apk
  server: { fs: { allow: [here] } },
});
