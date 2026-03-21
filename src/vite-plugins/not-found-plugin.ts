import fs from "fs";
import path from "path";
import { type Plugin } from "vite";

export function notFoundPlugin(): Plugin {
  let root: string;
  const validPages = new Set<string>();

  return {
    name: "dev-404",
    enforce: "pre",

    configResolved(config) {
      root = config.root;
      validPages.clear();

      const inputs = config.build?.rollupOptions?.input || {};

      if (typeof inputs === "string") {
        addValidPageEntry(
          validPages,
          path.basename(inputs, path.extname(inputs)),
        );
      } else if (Array.isArray(inputs)) {
        for (const input of inputs) {
          addValidPageEntry(
            validPages,
            path.basename(input, path.extname(input)),
          );
        }
      } else {
        for (const entryName of Object.keys(inputs)) {
          addValidPageEntry(validPages, entryName);
        }
      }

      validPages.add("/");
      validPages.add("/index.html");
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(
          req.originalUrl || req.url || "/",
          "http://localhost",
        ).pathname;

        if (pathname.includes(".") || pathname.startsWith("/@")) {
          return next();
        }

        const normalizedPath =
          pathname !== "/" && pathname.endsWith("/")
            ? pathname.slice(0, -1)
            : pathname;

        if (validPages.has(pathname) || validPages.has(normalizedPath)) {
          return next();
        }

        const file = path.join(root, "404.html");

        if (!fs.existsSync(file)) {
          return next();
        }

        const html = fs.readFileSync(file, "utf-8");

        res.statusCode = 404;
        res.setHeader("Content-Type", "text/html");

        server
          .transformIndexHtml(pathname, html)
          .then((out) => res.end(out))
          .catch(next);
      });
    },
  };
}

function addValidPageEntry(validPages: Set<string>, entryName: string) {
  const normalizedEntry = entryName.replace(/\\/g, "/");

  if (normalizedEntry === "index") {
    validPages.add("/");
    validPages.add("/index.html");
    return;
  }

  if (normalizedEntry.endsWith("/index")) {
    const directoryPath = `/${normalizedEntry.slice(0, -"/index".length)}`;

    validPages.add(directoryPath);
    validPages.add(`${directoryPath}/`);
    validPages.add(`${directoryPath}/index.html`);
    return;
  }

  const routePath = `/${normalizedEntry}`;

  validPages.add(routePath);
  validPages.add(`${routePath}/`);
  validPages.add(`${routePath}.html`);
}
