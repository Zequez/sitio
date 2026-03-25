import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { type UserConfig } from "vite";

import {
  createLiquidPagesPlugin,
  collectHtmlEntrypoints,
} from "./src/vite-plugins/liquid-pages-plugin";
import { notFoundPlugin } from "./src/vite-plugins/not-found-plugin";
import { unoVirtualLinkPlugin } from "./src/vite-plugins/uno-virtual-link-plugin";
import { directoryIndexHtmlPlugin } from "./src/vite-plugins/directory-index-html-plugin";
import UnoCSS from "unocss/vite";
import generateUnoCSSConfig, { getFontsDir } from "./unocss.build.config";
import { existsSync } from "node:fs";
import imagesPlugin from "./src/vite-plugins/images-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export interface SitioBuildMetaConfigOptions {
  workDir: string;
  port: number;
  host?: string;
  buildMode?: boolean;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function defineSitioBuildMetaConfig({
  workDir: workDir,
  port,
  host = "localhost",
  buildMode = false,
}: SitioBuildMetaConfigOptions): Promise<UserConfig> {
  const resolvedWorkDir = path.resolve(workDir);
  const libDir = path.join(resolvedWorkDir, "lib");
  const configuredPagesDir = path.join(resolvedWorkDir, "pages");
  const hasPagesDir = existsSync(configuredPagesDir);
  let pagesDir = configuredPagesDir;
  const componentsDir = path.join(resolvedWorkDir, "components");
  const dataDir = path.join(resolvedWorkDir, "data");
  const inputImagesDir = path.join(resolvedWorkDir, "images");
  const publicDir = path.join(resolvedWorkDir, "public");
  const outputImagesDir = path.join(publicDir, "images");
  const outputDir = path.join(resolvedWorkDir, "www");
  const workDirHash = Buffer.from(resolvedWorkDir).toString("base64");

  if (!hasPagesDir) {
    pagesDir = resolvedWorkDir;
  }

  const ignoredEntrypointDirs = hasPagesDir
    ? undefined
    : new Set([
        ".git",
        "components",
        "data",
        "dist",
        "www",
        "images",
        "lib",
        "node_modules",
        "public",
        "src",
      ]);

  const liquidPagesPlugin = await createLiquidPagesPlugin(
    pagesDir,
    componentsDir,
    dataDir,
    outputImagesDir,
  );

  return {
    root: pagesDir,
    clearScreen: false,
    publicDir: path.join(resolvedWorkDir, "public"),
    resolve: {
      alias: {
        "/@lib": libDir,
        "/@fonts": getFontsDir(workDirHash),
      },
    },
    plugins: [
      liquidPagesPlugin,
      unoVirtualLinkPlugin(),
      notFoundPlugin(),
      UnoCSS(generateUnoCSSConfig(workDir, workDirHash)),
      imagesPlugin(inputImagesDir, outputImagesDir),
      directoryIndexHtmlPlugin(),
      svelte(),
    ],
    cacheDir: path.join(__dirname, `node_modules/.vite-${workDirHash}`),
    server: {
      port,
      host,
      fs: {
        allow: [resolvedWorkDir, componentsDir, getFontsDir(workDirHash)],
      },
    },
    build: {
      outDir: outputDir,
      rollupOptions: {
        input: collectHtmlEntrypoints(pagesDir, ignoredEntrypointDirs), // This is just for build, so does not matter if it doesn't regenrate on server restart
      },
    },
  };
}

export default defineSitioBuildMetaConfig;
