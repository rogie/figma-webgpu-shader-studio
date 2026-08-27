import { parseAppRoute } from "./lib/appRoutes.js";

const basePath = new URL(import.meta.env.BASE_URL, window.location.origin)
  .pathname;
const route = parseAppRoute(window.location.pathname, basePath);

if (route.embed && route.id) {
  import("./embedPage.js").then(({ renderEmbedPage }) =>
    renderEmbedPage(route)
  );
} else {
  import("./mainApp.jsx");
}
