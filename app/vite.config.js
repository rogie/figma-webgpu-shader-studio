import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const preserveFiguiRegistrations = {
  name: "preserve-figui-registrations",
  enforce: "pre",
  transform(code, id) {
    if (
      (id.includes("/@rogieking/figui3/") ||
        id.includes("/@rogieking/figui3-extended/") ||
        id.includes("/@rogieking/toolkit/")) &&
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
  resolve: {
    alias: [
      // Toolkit still imports the Editor/Lab paths from before the package split.
      {
        find: /^@rogieking\/figui3\/src\/fig-(editor|lab)\.js$/,
        replacement: "@rogieking/figui3-extended/fig-$1.js",
      },
      {
        find: "@rogieking/figui3/src/fig.js",
        replacement: "@rogieking/figui3/fig.js",
      },
    ],
  },
  // FigUI3 and ToolKit register custom elements as import side effects;
  // keep them out of Vite's dependency optimizer so upgrades aren't served
  // from a stale prebundle.
  optimizeDeps: {
    exclude: [
      "@rogieking/figui3/fig.js",
      "@rogieking/figui3/extended-runtime.js",
      "@rogieking/figui3-extended/fig-lab.js",
      "@rogieking/figui3-extended/fig-editor.js",
      "@rogieking/figui3/fig-layer.js",
      "@rogieking/figui3/src/fig.js",
      "@rogieking/figui3/src/fig-lab.js",
      "@rogieking/figui3/src/fig-editor.js",
      "@rogieking/figui3/src/fig-layer.js",
      "@rogieking/toolkit/toolkit.js",
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
