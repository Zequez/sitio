import fs from "node:fs";

export function writeToDisk(text: string) {
  fs.writeFileSync("text.txt", text);
}
