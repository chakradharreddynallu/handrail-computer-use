import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
export async function startSandbox(port = 4173) {
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    const files = { "/": "index.html", "/legacy": "legacy.html" };
    if (req.method !== "GET" || !files[path]) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'",
    });
    res.end(await readFile(new URL(files[path], import.meta.url)));
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await startSandbox(Number(process.env.PORT || 4173));
  console.log(`Synthetic sandbox: ${app.origin}`);
}
