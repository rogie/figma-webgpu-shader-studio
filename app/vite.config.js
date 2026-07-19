import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Presets are the shader modules that live one level up from app/.
// Allow Vite to read them as `?raw` text imports.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      allow: [".."],
    },
  },
});
