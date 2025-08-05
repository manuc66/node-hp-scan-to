import http from "http";
import { Server as NetServer } from "net";

export function startHealthCheckServer(PORT: number) : NetServer  {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy" }));
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  server.listen(PORT, () => {
    console.log(`Health endpoint exposed on port ${PORT} on path: /health`);
  });
  return server;
}
