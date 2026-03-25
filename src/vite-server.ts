#!/usr/bin/env bun

import buildViteConfig from "../vite.build.config.ts";
import { createServer } from "vite";

const [, , workDir, portArg, hostArg] = process.argv;

if (!workDir || !portArg) {
  throw new Error("Usage: bun src/vite-server.ts <workDir> <port> [host]");
}

const port = Number(portArg);
const host = hostArg || "localhost";

if (Number.isNaN(port)) {
  throw new Error(`Invalid port: ${portArg}`);
}

const viteConfig = await buildViteConfig({
  workDir,
  port,
  host,
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
