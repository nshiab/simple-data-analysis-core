import { createServer } from "node:http";
import { once } from "node:events";

/** Serve a local Fetch response fixture and close every socket during cleanup. */
export default async function serveFixture(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const server = createServer((request, response) => {
    void (async () => {
      const body: Buffer[] = [];
      for await (const chunk of request) {
        if (typeof chunk === "string") body.push(Buffer.from(chunk));
        else if (Buffer.isBuffer(chunk)) body.push(chunk);
        else throw new TypeError("Unexpected HTTP body chunk.");
      }
      const method = request.method ?? "GET";
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        else if (value !== undefined) headers.set(name, value);
      }
      const result = await handler(
        new Request(`http://127.0.0.1${request.url ?? "/"}`, {
          method,
          headers,
          ...(method === "GET" || method === "HEAD" ? {} : { body: Buffer.concat(body) }),
        }),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    })().catch((error: unknown) => {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a local TCP server.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      const closed = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await closed;
    },
  };
}
