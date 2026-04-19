import Fastify from "fastify";
import { Runtime } from "@hauntjs/core";
import type { ResidentState } from "@hauntjs/core";
import { Place2DAdapter, ROOST_CONFIG } from "@hauntjs/place-2d";

const WS_PORT = Number(process.env.WS_PORT ?? 3001);
const HTTP_PORT = Number(process.env.PORT ?? 3000);

async function start(): Promise<void> {
  // 1. Create the place adapter
  const adapter = new Place2DAdapter({
    ...ROOST_CONFIG,
    port: WS_PORT,
  });

  // 2. Mount the place
  const place = await adapter.mount();

  // 3. Create the resident state
  const resident: ResidentState = {
    id: "poe",
    character: {
      name: "Poe",
      archetype: "hospitable concierge",
      systemPrompt: "You are Poe.",
      voice: { register: "warm", quirks: [], avoidances: [] },
      loyalties: { principal: null, values: ["guest comfort"] },
    },
    currentRoom: ROOST_CONFIG.residentStartRoom,
    mood: { energy: 0.8, focus: 0.7, valence: 0.5 },
  };

  // 4. Create the runtime (no resident mind yet — Phase 6 wires that in)
  const runtime = new Runtime({ place, resident });
  await runtime.start();

  // 5. Start the WebSocket server
  await adapter.start(runtime);

  // 6. Start the HTTP server (health check + serves info)
  const server = Fastify({ logger: true });

  server.get("/", async () => {
    return {
      name: "haunt",
      status: "alive",
      version: "0.0.0",
      wsPort: WS_PORT,
      rooms: Array.from(place.rooms.values()).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    };
  });

  await server.listen({ port: HTTP_PORT, host: "0.0.0.0" });
  console.log(`\n  The Roost is open.`);
  console.log(`  HTTP:      http://localhost:${HTTP_PORT}`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`  Client:    Run "pnpm --filter @hauntjs/place-2d dev" and open http://localhost:5173\n`);

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log("\nClosing The Roost...");
    await adapter.stop();
    await runtime.stop();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
