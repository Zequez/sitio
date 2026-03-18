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

      const inputs = config.build?.rollupOptions?.input || {};

      for (const file of Object.values(inputs)) {
        validPages.add("/" + path.basename(file));
      }

      validPages.add("/");
      validPages.add("/index.html");
    },

    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          const url = (req.originalUrl || req.url)!.split("?")[0]!;

          if (url.includes(".") || url.startsWith("/@")) {
            return next();
          }

          const urlHtml = url.endsWith("/")
            ? `${url}index.html`
            : `${url}.html`;

          if (!validPages.has(urlHtml)) {
            const file = path.join(root, "404.html");

            if (fs.existsSync(file)) {
              const html = fs.readFileSync(file, "utf-8");

              res.statusCode = 404;
              res.setHeader("Content-Type", "text/html");

              server
                .transformIndexHtml(urlHtml, html)
                .then((out) => res.end(out));

              return;
            }
          }

          next();
        });
      };
    },
  };
}
