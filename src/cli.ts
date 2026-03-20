#!/usr/bin/env bun

import { watch, type FSWatcher } from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";

import { portForName } from "./lib/portForName.ts";
import { spawnViteServer } from "./lib/vite-server-spawner.ts";

const workDir = process.cwd();

const PORT = await portForName(workDir);

//  ██████╗██╗     ██╗
// ██╔════╝██║     ██║
// ██║     ██║     ██║
// ██║     ██║     ██║
// ╚██████╗███████╗██║
//  ╚═════╝╚══════╝╚═╝

yargs(hideBin(process.argv))
  .scriptName("sitio")
  .command("init", "Initializes a new sitio project", (yargs) => {
    console.log("Pending");
  })
  .command("dev", "Starts sitio in development mode", async (yargs) => {
    console.log(`Sitio starting @ localhost:${PORT}`);

    const filesToWatch = [path.join(workDir, "fonts.yml")];
    const watchedDirectories = new Map<string, Set<string>>();
    const watchers: FSWatcher[] = [];
    const viteServer = spawnViteServer(workDir, PORT);
    let restartTimer: ReturnType<typeof setTimeout> | undefined;
    let isRestarting = false;

    for (const filePath of filesToWatch) {
      const directory = path.dirname(filePath);
      const watchedFiles =
        watchedDirectories.get(directory) ?? new Set<string>();

      watchedFiles.add(path.basename(filePath));
      watchedDirectories.set(directory, watchedFiles);
    }

    async function restart() {
      if (isRestarting) {
        return;
      }

      isRestarting = true;
      console.log("Restarting server.");

      try {
        await viteServer.restart();
      } finally {
        isRestarting = false;
      }
    }

    for (const [directory, watchedFiles] of watchedDirectories) {
      const watcher = watch(directory, (_eventType, filename) => {
        if (!filename || !watchedFiles.has(filename.toString())) {
          return;
        }

        if (restartTimer) {
          clearTimeout(restartTimer);
        }

        restartTimer = setTimeout(() => {
          restartTimer = undefined;
          void restart();
        }, 50);
      });

      watchers.push(watcher);
    }
  })
  .demandCommand(1, "")
  .help()
  .parse();
