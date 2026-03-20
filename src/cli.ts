#!/usr/bin/env bun

import { existsSync } from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";

import { portForName } from "./lib/portForName.ts";
import { spawnViteServer } from "./lib/vite-server-spawner.ts";
import { optimizedWatcher } from "./lib/optimizedWatcher.ts";
import buildViteConfig from "../vite.build.config.ts";
import { build as viteBuild } from "vite";

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

function resolveDistFile(distDir: string, pathname: string) {
  const cleanPathname = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const candidatePath = path.resolve(distDir, `.${cleanPathname}`);
  const relativePath = path.relative(distDir, candidatePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }

  if (existsSync(candidatePath)) {
    return candidatePath;
  }

  if (!path.extname(candidatePath)) {
    const indexPath = path.join(candidatePath, "index.html");

    if (existsSync(indexPath)) {
      return indexPath;
    }
  }

  return undefined;
}

function runPreview() {
  const distDir = path.join(workDir, "dist");

  if (!existsSync(distDir)) {
    throw new Error(`Dist directory not found at ${distDir}`);
  }

  const server = Bun.serve({
    port: PORT,
    fetch(request) {
      const url = new URL(request.url);
      const filePath = resolveDistFile(distDir, decodeURIComponent(url.pathname));

      if (!filePath) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(Bun.file(filePath));
    },
  });

  console.log(`Sitio preview @ http://localhost:${server.port}`);
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
  .command("build", "Build sitio for deployment", async () => {
    const viteConfig = await buildViteConfig({
      workDir,
      port: PORT,
      buildMode: true,
    });
    await viteBuild(viteConfig);
  })
  .command(
    "preview",
    "Start static server to preview the built site",
    async () => {
      runPreview();
    },
  )
  .parse();
