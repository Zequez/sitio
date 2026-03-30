#!/usr/bin/env bun

import { copyFileSync, existsSync } from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";
import { fileURLToPath } from "node:url";

import { portForName } from "./lib/portForName.ts";
import { spawnViteServer } from "./lib/vite-server-spawner.ts";
import { optimizedWatcher } from "./lib/optimizedWatcher.ts";
import { publishToNetlify } from "./lib/netlify-publishing.ts";
import {
  installSitioContextMenu,
  uninstallSitioContextMenu,
} from "./lib/context-menu.ts";
import buildViteConfig from "../vite.build.config.ts";
import { build as viteBuild } from "vite";
import type { ArgumentsCamelCase } from "yargs";

const workDir = process.cwd();
const argv = hideBin(process.argv);
const cliDir = path.dirname(fileURLToPath(import.meta.url));
const sitioRootDir = path.resolve(cliDir, "..");
const agentsTemplatePath = path.join(sitioRootDir, "AGENTS2.md");

const PORT = await portForName(workDir);

//  ██████╗██╗     ██╗
// ██╔════╝██║     ██║
// ██║     ██║     ██║
// ██║     ██║     ██║
// ╚██████╗███████╗██║
//  ╚═════╝╚══════╝╚═╝

yargs(argv.length === 0 ? ["dev"] : argv)
  .scriptName("sitio")
  .help()
  .command("init", "Initializes a new sitio project", async () => {
    await runInit();
  })
  .command(
    "install",
    "Installs the Sitio folder context menu integration",
    async () => {
      await runInstall();
    },
  )
  .command(
    "uninstall",
    "Removes the Sitio folder context menu integration",
    async () => {
      await runUninstall();
    },
  )
  .command(
    "dev",
    "Starts sitio in development mode",
    (command) =>
      command.option("network-access", {
        alias: "na",
        type: "boolean",
        default: false,
        description:
          "Bind the dev server to 0.0.0.0 so it can be accessed from the local network",
      }),
    async (args) => {
      await runDev(args);
    },
  )
  .command("build", "Build sitio for deployment", async () => {
    await runBuild();
  })
  .command(
    "preview",
    "Start static server to preview the built site",
    async () => {
      runPreview();
    },
  )
  .command("pub", "Build sitio and publish it", async () => {
    await runBuild();
    await runPublish();
  })
  .command("pu", "Publish the already built sitio", async () => {
    await runPublish();
  })
  .command("pwa-icons", "Generate PWA icons from icon.svg", async () => {
    await runPwaIcons();
  })
  .parse();

async function runDev(args?: ArgumentsCamelCase<{ networkAccess: boolean }>) {
  const host = args?.networkAccess ? "0.0.0.0" : "localhost";
  console.log(`Sitio starting @ ${host}:${PORT}`);

  const filesToWatch = [path.join(workDir, "fonts.yml")];

  const viteServer = spawnViteServer(workDir, PORT, host);
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

async function runInit() {
  const targetPath = path.join(workDir, "AGENTS.md");

  copyFileSync(agentsTemplatePath, targetPath);
  console.log(`Created ${targetPath}`);
}

async function runInstall() {
  await installSitioContextMenu();
  console.log("Sitio context menu installed.");
}

async function runUninstall() {
  await uninstallSitioContextMenu();
  console.log("Sitio context menu removed.");
}

async function runBuild() {
  const viteConfig = await buildViteConfig({
    workDir,
    port: PORT,
    buildMode: true,
  });
  await viteBuild(viteConfig);
}

function runPreview() {
  const outputDir = path.join(workDir, "www");

  if (!existsSync(outputDir)) {
    throw new Error(`Output directory not found at ${outputDir}`);
  }

  const server = Bun.serve({
    hostname: "0.0.0.0",
    port: PORT,
    fetch(request) {
      const url = new URL(request.url);
      const filePath = resolveDistFile(
        outputDir,
        decodeURIComponent(url.pathname),
      );

      if (!filePath) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(Bun.file(filePath));
    },
  });

  console.log(`Sitio preview @ http://localhost:${server.port}`);
}

async function runPublish() {
  const outputDir = path.join(workDir, "www");

  if (!existsSync(outputDir)) {
    throw new Error(
      `Output directory not found at ${outputDir}. Run "sitio build" first.`,
    );
  }

  const { siteUrl, adminUrl } = await publishToNetlify({
    outputDir,
    workDir,
  });

  console.log(`Published at ${siteUrl}`);
  console.log(`Netlify Admin panel at ${adminUrl}`);
}

async function runPwaIcons() {
  const iconDir = path.join(workDir, "public", "icons");
  const iconPath = path.join(iconDir, "icon.svg");

  if (!existsSync(iconPath)) {
    throw new Error(
      `Icon file not found at ${iconPath}. Please create icon.svg in the public/icons directory.`,
    );
  }

  console.log(`Generating PWA icons from ${iconPath}...`);

  const proc = Bun.spawn(
    ["bun", "run", "pwa-assets-generator", "--preset", "minimal", "icon.svg"],
    {
      cwd: iconDir,
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`pwa-assets-generator failed with exit code ${exitCode}`);
  }

  console.log(`PWA icons generated successfully in ${iconDir}`);
}

// ██╗   ██╗████████╗██╗██╗     ███████╗
// ██║   ██║╚══██╔══╝██║██║     ██╔════╝
// ██║   ██║   ██║   ██║██║     ███████╗
// ██║   ██║   ██║   ██║██║     ╚════██║
// ╚██████╔╝   ██║   ██║███████╗███████║
//  ╚═════╝    ╚═╝   ╚═╝╚══════╝╚══════╝

function resolveDistFile(distDir: string, pathname: string) {
  const cleanPathname = pathname.endsWith("/")
    ? `${pathname}index.html`
    : pathname;
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
