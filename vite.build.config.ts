import * as path from "node:path";

import { type UserConfig } from "vite";

import {
  createLiquidPagesPlugin,
  collectHtmlEntrypoints,
} from "./src/vite-plugins/liquid-pages-plugin";
import { notFoundPlugin } from "./src/vite-plugins/not-found-plugin";
import { unoVirtualLinkPlugin } from "./src/vite-plugins/uno-virtual-link-plugin";
import UnoCSS from "unocss/vite";
import generateUnoCSSConfig, { getFontsDir } from "./unocss.build.config";
import { existsSync } from "node:fs";
import imagesPlugin from "./src/vite-plugins/images-plugin";
import { restartOnConfigChangePlugin } from "./src/vite-plugins/restart-on-config-change-plugin";

export interface SitioBuildMetaConfigOptions {
  workDir: string;
  port: number;
  liquidData?: Record<string, unknown>;
}

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function defineSitioBuildMetaConfig({
  workDir: workDir,
  port,
}: SitioBuildMetaConfigOptions): Promise<UserConfig> {
  const resolvedWorkDir = path.resolve(workDir);
  const libDir = path.join(resolvedWorkDir, "lib");
  let pagesDir = path.join(resolvedWorkDir, "pages");
  const componentsDir = path.join(resolvedWorkDir, "components");
  const dataDir = path.join(resolvedWorkDir, "data");
  const inputImagesDir = path.join(resolvedWorkDir, "images");
  const publicDir = path.join(resolvedWorkDir, "public");
  const outputImagesDir = path.join(publicDir, "images");
  const workDirHash = Buffer.from(resolvedWorkDir).toString("base64");

  if (!existsSync(pagesDir)) {
    pagesDir = resolvedWorkDir;
  }

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
      restartOnConfigChangePlugin(workDir),
    ],
    cacheDir: path.join(__dirname, `node_modules/.vite-${workDirHash}`),
    server: {
      port,
      fs: {
        allow: [resolvedWorkDir, componentsDir, getFontsDir(workDirHash)],
      },
    },
    build: {
      rollupOptions: {
        input: collectHtmlEntrypoints(pagesDir), // This is just for build, so does not matter if it doesn't regenrate on server restart
      },
    },
  };
}

export default defineSitioBuildMetaConfig;
