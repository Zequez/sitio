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

export interface SitioBuildMetaConfigOptions {
  rootDir: string;
  port: number;
  liquidData?: Record<string, unknown>;
}

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export async function defineSitioBuildMetaConfig({
  rootDir,
  port,
}: SitioBuildMetaConfigOptions): Promise<UserConfig> {
  const resolvedRootDir = path.resolve(rootDir);
  const libDir = path.join(resolvedRootDir, "lib");
  let pagesDir = path.join(resolvedRootDir, "pages");
  const componentsDir = path.join(resolvedRootDir, "components");
  const dataDir = path.join(resolvedRootDir, "data");
  const inputImagesDir = path.join(resolvedRootDir, "images");
  const publicDir = path.join(resolvedRootDir, "public");
  const outputImagesDir = path.join(publicDir, "images");
  const rootDirHash = Buffer.from(resolvedRootDir).toString("base64");

  if (!existsSync(pagesDir)) {
    pagesDir = resolvedRootDir;
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
    publicDir: path.join(resolvedRootDir, "public"),
    resolve: {
      alias: {
        "/@lib": libDir,
        "/@fonts": getFontsDir(rootDirHash),
      },
    },
    plugins: [
      liquidPagesPlugin,
      unoVirtualLinkPlugin(),
      notFoundPlugin(),
      UnoCSS(generateUnoCSSConfig(rootDir, rootDirHash)),
      imagesPlugin(inputImagesDir, outputImagesDir),
    ],
    cacheDir: path.join(__dirname, `node_modules/.vite-${rootDirHash}`),
    server: {
      port,
      fs: {
        allow: [resolvedRootDir, componentsDir, getFontsDir(rootDirHash)],
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
