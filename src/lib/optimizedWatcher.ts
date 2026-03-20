import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

export function optimizedWatcher(filesToWatch: string[], callback: () => void) {
  const watchedDirectories = new Map<string, Set<string>>();
  const watchers: FSWatcher[] = [];
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  for (const filePath of filesToWatch) {
    const directory = path.dirname(filePath);
    const watchedFiles = watchedDirectories.get(directory) ?? new Set<string>();

    watchedFiles.add(path.basename(filePath));
    watchedDirectories.set(directory, watchedFiles);
  }

  for (const [directory, watchedFiles] of watchedDirectories) {
    const watcher = watch(directory, (_eventType, filename) => {
      if (!filename || !watchedFiles.has(filename.toString())) {
        return;
      }

      if (restartTimer) {
        clearTimeout(restartTimer);
      }

      restartTimer = setTimeout(() => {
        restartTimer = undefined;
        void callback();
      }, 100);
    });

    watchers.push(watcher);
  }
}
