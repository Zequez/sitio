export const SITIO_TUNNEL_REQUEST_EVENT = "sitio:tunnel:request";
export const SITIO_TUNNEL_RESPONSE_EVENT = "sitio:tunnel:response";

const TUNNEL_REQUEST_TIMEOUT_MS = 30_000;

export interface TunnelRequestPayload {
  id: string;
  targetPath: string;
  exportName: string;
  args: unknown[];
}

export interface TunnelSerializedError {
  name: string;
  message: string;
  stack?: string;
}

export interface TunnelSuccessPayload {
  id: string;
  ok: true;
  result: unknown;
}

export interface TunnelFailurePayload {
  id: string;
  ok: false;
  error: TunnelSerializedError;
}

export type TunnelResponsePayload =
  | TunnelSuccessPayload
  | TunnelFailurePayload;

interface PendingTunnelRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface TunnelHotContext {
  on: (event: string, callback: (payload: any) => void) => void;
  send: (event: string, payload?: any) => void;
}

const pendingTunnelRequests = new Map<string, PendingTunnelRequest>();
let isTunnelResponseListenerAttached = false;

export async function tunnelTo<Result = unknown>(
  targetPath: string,
  exportName: string,
  ...args: unknown[]
): Promise<Result | undefined> {
  if (!import.meta.env.DEV || !import.meta.hot) {
    return undefined;
  }

  attachTunnelResponseListener();
  const hot = getTunnelHotContext();

  const requestId = createTunnelRequestId();

  return new Promise<Result>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingTunnelRequests.delete(requestId);
      reject(
        new Error(
          `Timed out while calling "${exportName}" in "${targetPath}".`,
        ),
      );
    }, TUNNEL_REQUEST_TIMEOUT_MS);

    pendingTunnelRequests.set(requestId, {
      resolve: (value) => resolve(value as Result),
      reject,
      timeoutId,
    });

    hot.send(SITIO_TUNNEL_REQUEST_EVENT, {
      id: requestId,
      targetPath,
      exportName,
      args,
    } satisfies TunnelRequestPayload);
  });
}

function attachTunnelResponseListener() {
  if (isTunnelResponseListenerAttached || !import.meta.hot) {
    return;
  }

  isTunnelResponseListenerAttached = true;
  const hot = getTunnelHotContext();

  hot.on(
    SITIO_TUNNEL_RESPONSE_EVENT,
    (payload: TunnelResponsePayload) => {
      const pendingRequest = pendingTunnelRequests.get(payload.id);

      if (!pendingRequest) {
        return;
      }

      pendingTunnelRequests.delete(payload.id);
      clearTimeout(pendingRequest.timeoutId);

      if (payload.ok) {
        pendingRequest.resolve(payload.result);
        return;
      }

      pendingRequest.reject(deserializeTunnelError(payload.error));
    },
  );

  hot.on("vite:ws:disconnect", () => {
    rejectAllPendingTunnelRequests(
      new Error("The development websocket disconnected before tunnel response."),
    );
  });
}

function createTunnelRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `tunnel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getTunnelHotContext() {
  return import.meta.hot as unknown as TunnelHotContext;
}

function rejectAllPendingTunnelRequests(error: Error) {
  for (const [requestId, pendingRequest] of pendingTunnelRequests) {
    clearTimeout(pendingRequest.timeoutId);
    pendingRequest.reject(error);
    pendingTunnelRequests.delete(requestId);
  }
}

function deserializeTunnelError(error: TunnelSerializedError) {
  const tunnelError = new Error(error.message);
  tunnelError.name = error.name;
  tunnelError.stack = error.stack;
  return tunnelError;
}
