import { parseAppRoute } from "./lib/appRoutes.js";
import { readPresentSessionId } from "./lib/presentWindow.js";

const basePath = new URL(import.meta.env.BASE_URL, window.location.origin)
  .pathname;
const route = parseAppRoute(window.location.pathname, basePath);
const presentSessionId = readPresentSessionId();

if (route.embed && route.id && !presentSessionId) {
  import("./embedPage.js").then(({ renderEmbedPage }) =>
    renderEmbedPage(route)
  );
} else {
  import("./mainApp.jsx");
}
