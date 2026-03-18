import { watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import { type Plugin } from "vite";

export function refreshOnComponentsChangePlugin(componentsDir: string): Plugin {
  const resolvedComponentsDir = path.resolve(componentsDir);

  return {
    name: "refresh-on-components-change",
    apply: "serve",
    configureServer(server) {
      let reloadTimer: ReturnType<typeof setTimeout> | undefined;
      let watcher: FSWatcher | undefined;

      const queueReload = () => {
        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }

        reloadTimer = setTimeout(() => {
          reloadTimer = undefined;
          server.ws.send({
            type: "full-reload",
            path: "*",
          });
        }, 50);
      };

      try {
        watcher = watch(resolvedComponentsDir, { recursive: true }, () => {
          queueReload();
        });
      } catch {
        watcher = watch(resolvedComponentsDir, () => {
          queueReload();
        });
      }

      server.httpServer?.once("close", () => {
        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }

        watcher?.close();
      });
    },
  };
}
