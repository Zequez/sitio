#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";

import { portForName } from "./lib/portForName.ts";
import { spawnViteServer } from "./lib/vite-server-spawner.ts";
import { optimizedWatcher } from "./lib/optimizedWatcher.ts";

const workDir = process.cwd();
const argv = hideBin(process.argv);

const PORT = await portForName(workDir);

async function runDev() {
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
}

//  ██████╗██╗     ██╗
// ██╔════╝██║     ██║
// ██║     ██║     ██║
// ██║     ██║     ██║
// ╚██████╗███████╗██║
//  ╚═════╝╚══════╝╚═╝

yargs(argv.length === 0 ? ["dev"] : argv)
  .scriptName("sitio")
  .help()
  .command("init", "Initializes a new sitio project", (yargs) => {
    console.log("Pending");
  })
  .command("dev", "Starts sitio in development mode", async () => {
    await runDev();
  })
  .parse();
