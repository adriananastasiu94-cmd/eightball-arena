import http from "http";
import next from "next";
import { createSocketServer } from "./src/server/socketServer";

const dev = process.env.NODE_ENV !== "production";
const host = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

async function bootstrap() {
  const app = next({ dev, hostname: host, port });
  const handler = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer((req, res) => handler(req, res));
  createSocketServer(server);

  server.listen(port, host, () => {
    console.log(`Eightball Arena running at http://${host}:${port}`);
  });
}

bootstrap();