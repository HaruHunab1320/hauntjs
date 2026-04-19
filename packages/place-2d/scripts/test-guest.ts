/**
 * Manual test script — connects as a fake guest and walks through The Roost.
 *
 * Prerequisites: the dev-server must be running with the WebSocket server on port 3001.
 * Run with: pnpm --filter @hauntjs/place-2d exec tsx scripts/test-guest.ts
 */

import { WebSocket } from "ws";

const PORT = process.env.WS_PORT ?? "3001";
const URL = `ws://localhost:${PORT}`;

function send(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
  console.log(`  → ${JSON.stringify(msg)}`);
}

function waitFor(ws: WebSocket, count = 1): Promise<object[]> {
  return new Promise((resolve) => {
    const msgs: object[] = [];
    const handler = (data: Buffer) => {
      const parsed = JSON.parse(data.toString()) as object;
      msgs.push(parsed);
      console.log(`  ← ${JSON.stringify(parsed).slice(0, 200)}`);
      if (msgs.length >= count) {
        ws.off("message", handler);
        resolve(msgs);
      }
    };
    ws.on("message", handler);
  });
}

async function main(): Promise<void> {
  console.log(`Connecting to ${URL}...`);
  const ws = new WebSocket(URL);

  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  console.log("Connected.\n");

  // Join
  console.log("1. Joining as Takeshi...");
  const joinMsgs = waitFor(ws, 2);
  send(ws, { type: "join", guestName: "Takeshi" });
  await joinMsgs;

  // Speak in lobby
  console.log("\n2. Speaking in lobby...");
  const speakMsgs = waitFor(ws, 1);
  send(ws, { type: "speak", text: "Good evening, Poe." });
  await speakMsgs;

  // Move to study
  console.log("\n3. Moving to study...");
  const moveMsgs = waitFor(ws, 1);
  send(ws, { type: "move", toRoom: "study" });
  await moveMsgs;

  // Speak in study
  console.log("\n4. Speaking in study...");
  const speakMsgs2 = waitFor(ws, 1);
  send(ws, { type: "speak", text: "The books look interesting." });
  await speakMsgs2;

  // Move back to lobby
  console.log("\n5. Moving back to lobby...");
  const moveMsgs2 = waitFor(ws, 1);
  send(ws, { type: "move", toRoom: "lobby" });
  await moveMsgs2;

  // Move to parlor
  console.log("\n6. Moving to parlor...");
  const moveMsgs3 = waitFor(ws, 1);
  send(ws, { type: "move", toRoom: "parlor" });
  await moveMsgs3;

  // Move to garden
  console.log("\n7. Moving to garden...");
  const moveMsgs4 = waitFor(ws, 1);
  send(ws, { type: "move", toRoom: "garden" });
  await moveMsgs4;

  // Speak in garden
  console.log("\n8. Speaking in garden...");
  const speakMsgs3 = waitFor(ws, 1);
  send(ws, { type: "speak", text: "The fountain is lovely." });
  await speakMsgs3;

  console.log("\nDone. All rooms visited, all messages sent and received.");
  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
