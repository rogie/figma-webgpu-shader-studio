import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const preserveFiguiRegistrations = {
  name: "preserve-figui-registrations",
  enforce: "pre",
  transform(code, id) {
    if (
      (id.includes("/@rogieking/figui3/") ||
        id.includes("/@rogieking/figui3-extended/")) &&
      id.endsWith(".js")
    ) {
      return { code, map: null, moduleSideEffects: "no-treeshake" };
    }
    return null;
  },
};

// Presets are the shader modules that live one level up from app/.
// Allow Vite to read them as `?raw` text imports.
export default defineConfig({
  base:
    process.env.GITHUB_PAGES === "true"
      ? "/figma-webgpu-shader-studio/"
      : "/",
  plugins: [preserveFiguiRegistrations, react()],
  // Keep custom element registrations out of the dependency optimizer.
  optimizeDeps: {
    exclude: [
      "@rogieking/figui3/fig.js",
      "@rogieking/figui3/extended-runtime.js",
      "@rogieking/figui3-extended/fig-lab.js",
      "@rogieking/figui3-extended/fig-editor.js",
      "@rogieking/figui3/fig-layer.js",
      "@rogieking/figui3/src/fig.js",
      "@rogieking/figui3/src/fig-layer.js",
    ],
  },
  build: {
    target: "esnext",
    cssTarget: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase/")) return "supabase";
          if (id.includes("node_modules/sucrase/")) return "sucrase";
          return undefined;
        },
      },
    },
  },
  server: {
    // Figma OAuth registers the localhost callback on this exact port.
    host: "localhost",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [".."],
    },
  },
});
