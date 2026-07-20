import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const preserveFiguiRegistrations = {
  name: "preserve-figui-registrations",
  enforce: "pre",
  transform(code, id) {
    if (
      id.includes("/@rogieking/figui3/dist/") &&
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
  build: {
    target: "esnext",
    cssTarget: "esnext",
  },
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      allow: [".."],
    },
  },
});
