import { stat } from "fs/promises";
import { existsSync } from "fs";

export function createServer(servePath: string, PORT: number) {
  const clients: Set<Bun.ServerWebSocket<undefined>> = new Set();

  function reload() {
    for (const ws of clients) {
      ws.send("reload");
    }
  }

  const server = Bun.serve({
    port: PORT,
    async fetch(req, server) {
      if (server.upgrade(req)) {
        return;
      }

      const path = new URL(req.url).pathname;

      if (path === "/.well-known/appspecific/com.chrome.devtools.json") {
        return Response.json({});
      }

      if (path.endsWith(".map")) {
        return new Response("", { status: 204 });
      }

      let file: Bun.BunFile;
      const filePath = `${servePath}${path}`;

      if (existsSync(filePath)) {
        const fileStat = await stat(filePath);
        const isDir = fileStat.isDirectory();

        if (isDir) {
          file = Bun.file(`${filePath}/index.html`);
          const content = await injectLiveReload(file);
          return new Response(content, {
            headers: {
              "content-type": "text/html",
            },
          });
        }
      } else {
        return new Response("", { status: 404 });
      }
    },

    websocket: {
      open(ws) {
        clients.add(ws);
      },

      message(ws, message) {
        // not used, but required by TS
      },

      close(ws) {
        clients.delete(ws);
      },
    },
  });

  async function injectLiveReload(file: Bun.BunFile) {
    const liveReloadScript = `
          <script>
          const ws = new WebSocket("ws://localhost:${PORT}")
          ws.onmessage = () => location.reload()
          </script>
          `;

    const fileContent = await file.text();
    const fileContentReplaced = fileContent.replace(
      "</body>",
      `${liveReloadScript}</body>`,
    );

    return fileContentReplaced;
  }

  return {
    reloadPage: reload,
    server,
  };
}
