import crypto from "crypto";
import net from "net";

export async function portForName(
  name: string,
  start: number = 1024,
  end: number = 65535,
): Promise<number> {
  const hash = crypto.createHash("sha256").update(name).digest();
  const base = hash.readUInt32BE(0);

  const range = end - start + 1;
  let portCandidate = start + (base % range);

  const isPortFree = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once("error", () => {
        resolve(false);
      });

      server.once("listening", () => {
        server.close(() => resolve(true));
      });

      server.listen(port, "127.0.0.1");
    });
  };

  for (let i = 0; i < range; i++) {
    const port = start + ((portCandidate - start + i) % range);

    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error("No available ports in range");
}
