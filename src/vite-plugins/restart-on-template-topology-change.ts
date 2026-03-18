import * as path from "node:path";
import { normalizePath, type Plugin } from "vite";

export function restartOnTemplateTopologyChangePlugin(
  pagesDir: string,
  componentsDir: string,
): Plugin {
  const watchedRoots = [
    normalizePath(path.resolve(pagesDir)),
    normalizePath(path.resolve(componentsDir)),
  ];
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  function shouldRestart(filePath: string) {
    const normalizedFilePath = normalizePath(path.resolve(filePath));

    if (!normalizedFilePath.endsWith(".html")) {
      return false;
    }

    return watchedRoots.some((root) => {
      if (!normalizedFilePath.startsWith(`${root}/`)) {
        return false;
      }

      const relativePath = normalizedFilePath.slice(root.length + 1);

      return !relativePath
        .split("/")
        .some((segment) => segment.startsWith("_"));
    });
  }

  return {
    name: "restart-on-template-topology-change",
    apply: "serve",
    configureServer(server) {
      const queueRestart = async (filePath: string) => {
        if (!shouldRestart(filePath)) {
          return;
        }

        if (restartTimer) {
          clearTimeout(restartTimer);
        }

        restartTimer = setTimeout(() => {
          restartTimer = undefined;
          console.log("Restarting server...");
          void server.restart();
        }, 50);
      };

      server.watcher.on("add", queueRestart);
      server.watcher.on("unlink", queueRestart);

      return () => {
        server.watcher.off("add", queueRestart);
        server.watcher.off("unlink", queueRestart);
      };
    },
  };
}
