#!/usr/bin/env bun

import buildViteConfig from "../vite.build.config.ts";
import { createServer } from "vite";

const [, , workDir, portArg] = process.argv;

if (!workDir || !portArg) {
  throw new Error("Usage: bun src/vite-server.ts <workDir> <port>");
}

const port = Number(portArg);

if (Number.isNaN(port)) {
  throw new Error(`Invalid port: ${portArg}`);
}

const viteConfig = await buildViteConfig({
  workDir,
  port,
});

const server = await createServer(viteConfig);
await server.listen();
server.printUrls();
server.bindCLIShortcuts({ print: true });

const shutdown = async () => {
  console.log("Server closing");
  await server.close();
  console.log("Server closed");
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
