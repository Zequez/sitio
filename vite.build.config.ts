import * as path from "node:path";

import { type UserConfig } from "vite";

import { createLiquidPagesPlugin } from "./src/vite-plugins/liquid-pages-plugin";
import { notFoundPlugin } from "./src/vite-plugins/not-found-plugin";

export interface SitioBuildMetaConfigOptions {
  rootDir: string;
  port: number;
  liquidData?: Record<string, unknown>;
}

export async function defineSitioBuildMetaConfig({
  rootDir,
  port,
  liquidData = {},
}: SitioBuildMetaConfigOptions): Promise<UserConfig> {
  const resolvedRootDir = path.resolve(rootDir);
  const pagesDir = path.join(resolvedRootDir, "pages");
  const componentsDir = path.join(resolvedRootDir, "components");

  const [input, liquidPagesPlugin, restartPlugin] =
    await createLiquidPagesPlugin(pagesDir, componentsDir);

  return {
    root: pagesDir,
    publicDir: path.join(resolvedRootDir, "public"),
    plugins: [liquidPagesPlugin, restartPlugin, notFoundPlugin()],
    server: {
      port,
      fs: {
        allow: [resolvedRootDir],
      },
    },
    build: {
      rollupOptions: {
        input,
      },
    },
  };
}

export default defineSitioBuildMetaConfig;
