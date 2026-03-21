#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
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
  .parse();

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

  const env = loadWorkDirEnv(workDir);
  const authToken = env.NETLIFY_AUTH_TOKEN;
  const siteId = env.NETLIFY_SITE_ID;

  if (!authToken) {
    throw new Error(
      `Missing NETLIFY_AUTH_TOKEN in ${path.join(workDir, ".env")}`,
    );
  }

  if (!siteId) {
    throw new Error(
      `Missing NETLIFY_SITE_ID in ${path.join(workDir, ".env")}`,
    );
  }

  const deployArgs = [
    "x",
    "netlify",
    "deploy",
    "--dir",
    outputDir,
    "--prod",
    "--no-build",
    "--auth",
    authToken,
    "--site",
    siteId,
  ];

  console.log("Publishing to Netlify...");

  const publishProcess = Bun.spawn([process.execPath, ...deployArgs], {
    cwd: workDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      ...env,
      NETLIFY_AUTH_TOKEN: authToken,
    },
  });

  const exitCode = await publishProcess.exited;

  if (exitCode !== 0) {
    throw new Error(`Netlify publish failed with exit code ${exitCode}`);
  }
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

function loadWorkDirEnv(workDir: string) {
  const envPath = path.join(workDir, ".env");
  const envEntries = { ...process.env } as Record<string, string | undefined>;

  if (!existsSync(envPath)) {
    return envEntries;
  }

  const envContents = readFileSync(envPath, "utf8");

  for (const line of envContents.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    envEntries[key] = stripWrappingQuotes(rawValue);
  }

  return envEntries;
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
