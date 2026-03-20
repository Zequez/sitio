#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { portForName } from "./lib/portForName.ts";

import buildViteConfig from "../vite.build.config.ts";
import { createServer } from "vite";

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
    const viteConfig = await buildViteConfig({
      workDir: workDir,
      port: PORT,
    });

    console.log("Got config; starting server.");
    // console.log(JSON.stringify(viteConfig, null, 2));
    const server = await createServer(viteConfig);
    await server.listen();
    server.printUrls();
    server.bindCLIShortcuts({ print: true });

    // printTitle(`Sitio started... http://localhost:${PORT}`, chalk.yellowBright);
    // const { reloadPage } = createServer(`${workDir}/dist`, PORT);
    // async function buildAndReload() {
    //   await build();
    //   reloadPage();
    // }
    // watch(`${workDir}/pages`, buildAndReload);
    // watch(`${workDir}/layouts`, buildAndReload);
    // watch(`${workDir}/components`, buildAndReload);
    // watch(`${workDir}/assets`, buildAndReload);
    // watch(`${workDir}/scripts`, buildAndReload);
    // build();
  })
  .demandCommand(1, "")
  .help()
  .parse();
