import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const port = Number(process.env.PORT || 8788);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let filePath = join(dist, decodeURIComponent(url.pathname));
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(dist, "404.html");
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(filePath.endsWith("404.html") ? 404 : 200, {
    "content-type": types[extname(filePath)] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`Preview: http://localhost:${port}`);
});
