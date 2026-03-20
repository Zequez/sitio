import path from "node:path";

export interface ViteServerSpawner {
  restart: () => Promise<void>;
}

export function spawnViteServer(
  workDir: string,
  port: number,
): ViteServerSpawner {
  const viteServerPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../vite-server.ts",
  );

  let child = startChild();
  let isRestarting = false;

  function startChild() {
    return Bun.spawn(["bun", viteServerPath, workDir, String(port)], {
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
