#!/usr/bin/env bun

import { watch, type FSWatcher } from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";

import { portForName } from "./lib/portForName.ts";
import { spawnViteServer } from "./lib/vite-server-spawner.ts";
import { optimizedWatcher } from "./lib/optimizedWatcher.ts";

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

    const viteServer = spawnViteServer(workDir, PORT);
    let isRestarting = false;

    async function restart() {
      if (isRestarting) {
        return;
      }

      isRestarting = true;
      console.log("Restarting server...");

      try {
        await viteServer.restart();
      } finally {
        isRestarting = false;
      }
    }

    optimizedWatcher(filesToWatch, async () => {
      await restart();
    });
  })
  .demandCommand(1, "")
  .help()
  .parse();
