import { statSync } from "node:fs";
import * as path from "node:path";

import { normalizePath, type Plugin, type ViteDevServer } from "vite";

import {
  SITIO_TUNNEL_REQUEST_EVENT,
  SITIO_TUNNEL_RESPONSE_EVENT,
  type TunnelRequestPayload,
  type TunnelResponsePayload,
  type TunnelSerializedError,
} from "../lib/tunneling.ts";

const VITE_FS_PREFIX = "/@fs/";

interface TunnelingPluginOptions {
  workDir: string;
}

export function tunnelingPlugin({
  workDir,
}: TunnelingPluginOptions): Plugin {
  const resolvedWorkDir = path.resolve(workDir);

  return {
    name: "sitio-tunneling",
    apply: "serve",
    configureServer(server) {
      server.ws.on(
        SITIO_TUNNEL_REQUEST_EVENT,
        (payload: TunnelRequestPayload, client) => {
          void respondToTunnelRequest(server, resolvedWorkDir, payload, client);
        },
      );
    },
  };
}

async function respondToTunnelRequest(
  server: ViteDevServer,
  workDir: string,
  payload: TunnelRequestPayload,
  client: { send: (event: string, payload: TunnelResponsePayload) => void },
) {
  const response = await executeTunnelRequest(server, workDir, payload);
  client.send(SITIO_TUNNEL_RESPONSE_EVENT, response);
}

async function executeTunnelRequest(
  server: ViteDevServer,
  workDir: string,
  payload: TunnelRequestPayload,
): Promise<TunnelResponsePayload> {
  try {
    assertValidTunnelPayload(payload);

    const tunnelFilePath = resolveTunnelFilePath(workDir, payload.targetPath);
    const tunnelModule = await server.ssrLoadModule(
      createTunnelModuleId(tunnelFilePath),
      { fixStacktrace: true },
    );
    const tunnelExport = tunnelModule[payload.exportName];

    if (typeof tunnelExport !== "function") {
      throw new Error(
        `Export "${payload.exportName}" in "${payload.targetPath}" is not a function.`,
      );
    }

    const result = await tunnelExport(...payload.args);

    return {
      id: payload.id,
      ok: true,
      result,
    };
  } catch (error) {
    return {
      id: payload.id,
      ok: false,
      error: serializeTunnelError(error),
    };
  }
}

function assertValidTunnelPayload(
  payload: TunnelRequestPayload,
): asserts payload is TunnelRequestPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Tunnel payload must be an object.");
  }

  if (!payload.id || typeof payload.id !== "string") {
    throw new Error("Tunnel payload is missing a valid request id.");
  }

  if (!payload.targetPath || typeof payload.targetPath !== "string") {
    throw new Error("Tunnel payload is missing a valid target path.");
  }

  if (!payload.exportName || typeof payload.exportName !== "string") {
    throw new Error("Tunnel payload is missing a valid export name.");
  }

  if (!Array.isArray(payload.args)) {
    throw new Error("Tunnel payload args must be an array.");
  }
}

function resolveTunnelFilePath(workDir: string, targetPath: string) {
  if (path.isAbsolute(targetPath)) {
    throw new Error("Tunnel paths must be relative to the work directory.");
  }

  const resolvedPath = path.resolve(workDir, targetPath);
  const relativePath = path.relative(workDir, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Tunnel paths must stay inside the work directory.");
  }

  if (!path.basename(resolvedPath).startsWith("+")) {
    throw new Error('Tunnel targets must be files whose names start with "+".');
  }

  const stats = statSync(resolvedPath, { throwIfNoEntry: false });

  if (!stats || !stats.isFile()) {
    throw new Error(`Tunnel target not found: "${targetPath}".`);
  }

  return resolvedPath;
}

function createTunnelModuleId(filePath: string) {
  return `${VITE_FS_PREFIX}${normalizePath(filePath)}`;
}

function serializeTunnelError(error: unknown): TunnelSerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : "Unknown tunnel error.",
  };
}
