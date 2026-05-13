import chokidar, { FSWatcher } from "chokidar";
import fs from "node:fs";
import path from "node:path";

export type RecursiveWatchEvent =
  | "add"
  | "addDir"
  | "change"
  | "unlink"
  | "unlinkDir";

export interface RecursiveWatchEventPayload {
  type: RecursiveWatchEvent;
  path: string;
}

export interface RecursiveWatchOptions {
  /**
   * Debounce multiple rapid events into a single flush.
   * Default: 100ms
   */
  debounceMs?: number;

  /**
   * Use chokidar polling mode.
   * Useful for Docker / network fs / WSL.
   */
  usePolling?: boolean;

  /**
   * Poll interval when usePolling=true
   */
  interval?: number;

  /**
   * Ignore initial scan events
   */
  ignoreInitial?: boolean;
}

export interface RecursiveWatcher {
  close(): Promise<void>;
}

export function resiliantWatcher(
  targetPath: string,
  callback: (events: RecursiveWatchEventPayload[]) => void,
  options: RecursiveWatchOptions = {},
): RecursiveWatcher {
  const {
    debounceMs = 100,
    usePolling = false,
    interval = 300,
    ignoreInitial = true,
  } = options;

  let watcher: FSWatcher | null = null;
  let closed = false;

  let currentWatchedRoot: string | null = null;

  const pendingEvents = new Map<string, RecursiveWatchEventPayload>();

  let debounceTimer: NodeJS.Timeout | null = null;
  let rebindTimer: NodeJS.Timeout | null = null;

  // ------------------------------------------------------------
  // Debounced event queue
  // ------------------------------------------------------------

  function queueEvent(event: RecursiveWatchEventPayload) {
    pendingEvents.set(`${event.type}:${event.path}`, event);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;

      const events = [...pendingEvents.values()];
      pendingEvents.clear();

      callback(events);
    }, debounceMs);
  }

  // ------------------------------------------------------------
  // Find nearest existing ancestor
  // ------------------------------------------------------------

  function findNearestExistingAncestor(input: string): string {
    let current = path.resolve(input);

    while (true) {
      if (fs.existsSync(current)) {
        return current;
      }

      const parent = path.dirname(current);

      if (parent === current) {
        return current;
      }

      current = parent;
    }
  }

  // ------------------------------------------------------------
  // Attach watcher
  // ------------------------------------------------------------

  async function attachWatcher() {
    if (closed) return;

    const resolvedTarget = path.resolve(targetPath);

    const nearestAncestor = findNearestExistingAncestor(resolvedTarget);

    if (nearestAncestor === currentWatchedRoot && watcher) {
      return;
    }

    currentWatchedRoot = nearestAncestor;

    if (watcher) {
      await watcher.close();
      watcher = null;
    }

    watcher = chokidar.watch(nearestAncestor, {
      persistent: true,
      ignoreInitial,
      awaitWriteFinish: {
        stabilityThreshold: debounceMs,
        pollInterval: 50,
      },
      atomic: true,
      usePolling,
      interval,
    });

    const handleFsEvent = (type: RecursiveWatchEvent, eventPath: string) => {
      const normalizedTarget = normalizePath(resolvedTarget);
      const normalizedEvent = normalizePath(eventPath);

      // Only emit events within target subtree
      const isInside =
        normalizedEvent === normalizedTarget ||
        normalizedEvent.startsWith(normalizedTarget + "/");

      if (isInside) {
        queueEvent({
          type,
          path: eventPath,
        });
      }

      scheduleRebind();
    };

    watcher
      .on("add", (p) => handleFsEvent("add", p))
      .on("addDir", (p) => handleFsEvent("addDir", p))
      .on("change", (p) => handleFsEvent("change", p))
      .on("unlink", (p) => handleFsEvent("unlink", p))
      .on("unlinkDir", (p) => handleFsEvent("unlinkDir", p))
      .on("error", () => {
        scheduleRebind();
      });
  }

  // ------------------------------------------------------------
  // Rebinding logic
  // ------------------------------------------------------------

  function scheduleRebind() {
    if (closed) return;

    if (rebindTimer) return;

    rebindTimer = setTimeout(async () => {
      rebindTimer = null;

      const nearestAncestor = findNearestExistingAncestor(targetPath);

      if (nearestAncestor !== currentWatchedRoot) {
        await attachWatcher();
      }
    }, 250);
  }

  // ------------------------------------------------------------
  // Path normalization
  // ------------------------------------------------------------

  function normalizePath(p: string): string {
    return path.resolve(p).replace(/\\/g, "/");
  }

  // ------------------------------------------------------------
  // Start
  // ------------------------------------------------------------

  void attachWatcher();

  // ------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------

  return {
    async close() {
      closed = true;

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      if (rebindTimer) {
        clearTimeout(rebindTimer);
      }

      if (watcher) {
        await watcher.close();
      }
    },
  };
}
