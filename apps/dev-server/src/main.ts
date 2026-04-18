import Fastify from "fastify";

const server = Fastify({ logger: true });

server.get("/", async () => {
  return { name: "haunt", status: "alive", version: "0.0.0" };
});

const start = async (): Promise<void> => {
  const port = Number(process.env.PORT ?? 3000);
  await server.listen({ port, host: "0.0.0.0" });
  server.log.info(`The Roost dev-server running at http://localhost:${port}`);
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
