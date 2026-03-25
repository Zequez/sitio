import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ViteServerSpawner {
  restart: () => Promise<void>;
}

export function spawnViteServer(
  workDir: string,
  port: number,
  host: string,
): ViteServerSpawner {
  const viteServerPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../vite-server.ts",
  );

  let child = startChild();
  let isRestarting = false;

  function startChild() {
    return Bun.spawn(["bun", viteServerPath, workDir, String(port), host], {
      cwd: workDir,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
  }

  return {
    async restart() {
      if (isRestarting) {
        return;
      }

      isRestarting = true;

      try {
        child.kill("SIGKILL");
        await child.exited;

        child = startChild();
      } finally {
        isRestarting = false;
      }
    },
  };
}
