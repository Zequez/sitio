import { type Plugin } from "vite";

export function restartOnConfigChangePlugin(workDir: string): Plugin {
  return {
    name: "restart-on-config-change",
  };
}
