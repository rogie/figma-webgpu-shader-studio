import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const preserveFiguiRegistrations = {
  name: "preserve-figui-registrations",
  enforce: "pre",
  transform(code, id) {
    if (
      (id.includes("/@rogieking/figui3/") ||
        id.includes("/@rogieking/propskit2/")) &&
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
  // FigUI3 and PropsKit2 register custom elements as import side effects;
  // keep them out of Vite's dependency optimizer so upgrades aren't served
  // from a stale prebundle.
  optimizeDeps: {
    exclude: [
      "@rogieking/figui3/fig.js",
      "@rogieking/figui3/fig-lab.js",
      "@rogieking/figui3/fig-editor.js",
      "@rogieking/figui3/fig-layer.js",
      "@rogieking/figui3/src/fig.js",
      "@rogieking/figui3/src/fig-lab.js",
      "@rogieking/figui3/src/fig-editor.js",
      "@rogieking/figui3/src/fig-layer.js",
      "@rogieking/propskit2/propskit.js",
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
    port: 5173,
    strictPort: false,
    fs: {
      allow: [".."],
    },
  },
});
