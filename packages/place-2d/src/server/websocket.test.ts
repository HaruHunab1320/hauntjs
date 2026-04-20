import { Runtime, roomId } from "@hauntjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { Place2DAdapter } from "./adapter.js";
import type { ServerMessage } from "./protocol.js";
import { ROOST_CONFIG } from "./world-config.js";

const TEST_PORT = 9871;

function waitForMessage(ws: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Message timeout")), 5000);
    ws.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as ServerMessage);
    });
  });
}

function collectMessages(ws: WebSocket, count: number): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = [];
    const timeout = setTimeout(
      () => reject(new Error(`Expected ${count} messages, got ${messages.length}`)),
      5000,
    );

    ws.on("message", (data) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
      if (messages.length >= count) {
        clearTimeout(timeout);
        resolve(messages);
      }
    });
  });
}

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

describe("Place2DServer", () => {
  let adapter: Place2DAdapter;
  let runtime: Runtime;
  const openSockets: WebSocket[] = [];

  beforeEach(async () => {
    adapter = new Place2DAdapter({ ...ROOST_CONFIG, port: TEST_PORT });
    const place = await adapter.mount();
    runtime = new Runtime({
      place,
      resident: {
        id: "poe",
        character: {
          name: "Poe",
          archetype: "hospitable concierge",
          systemPrompt: "You are Poe.",
          voice: { register: "warm", quirks: [], avoidances: [] },
          loyalties: { principal: null, values: [] },
        },
        currentRoom: roomId("lobby"),
        mood: { energy: 0.8, focus: 0.7, valence: 0.5 },
      },
    });
    await runtime.start();
    await adapter.start(runtime);
  });

  afterEach(async () => {
    for (const ws of openSockets) {
      ws.close();
    }
    openSockets.length = 0;
    await adapter.stop();
    await runtime.stop();
  });

  async function connectAndTrack(): Promise<WebSocket> {
    const ws = await connect();
    openSockets.push(ws);
    return ws;
  }

  it("accepts a guest connection and join", async () => {
    const ws = await connectAndTrack();
    const msgs = collectMessages(ws, 2);

    ws.send(JSON.stringify({ type: "join", guestName: "Takeshi" }));

    const [joined, state] = await msgs;
    expect(joined.type).toBe("joined");
    if (joined.type === "joined") {
      expect(joined.roomId).toBe("lobby");
    }
    expect(state.type).toBe("state");
    if (state.type === "state") {
      expect(state.place.rooms).toHaveLength(4);
      expect(state.place.currentRoom).toBe("lobby");
    }
  });

  it("rejects invalid messages", async () => {
    const ws = await connectAndTrack();
    const msg = waitForMessage(ws);

    ws.send(JSON.stringify({ type: "fly" }));

    const response = await msg;
    expect(response.type).toBe("error");
  });

  it("requires join before other actions", async () => {
    const ws = await connectAndTrack();
    const msg = waitForMessage(ws);

    ws.send(JSON.stringify({ type: "speak", text: "Hello" }));

    const response = await msg;
    expect(response.type).toBe("error");
    if (response.type === "error") {
      expect(response.message).toContain("Must join first");
    }
  });

  it("guest can move between connected rooms", async () => {
    const ws = await connectAndTrack();

    // Join first
    const joinMsgs = collectMessages(ws, 2);
    ws.send(JSON.stringify({ type: "join", guestName: "Takeshi" }));
    await joinMsgs;

    // Move to study
    const moveMsg = waitForMessage(ws);
    ws.send(JSON.stringify({ type: "move", toRoom: "study" }));
    const response = await moveMsg;

    expect(response.type).toBe("state");
    if (response.type === "state") {
      expect(response.place.currentRoom).toBe("study");
    }
  });

  it("rejects move to unconnected room", async () => {
    const ws = await connectAndTrack();

    const joinMsgs = collectMessages(ws, 2);
    ws.send(JSON.stringify({ type: "join", guestName: "Takeshi" }));
    await joinMsgs;

    // Lobby is not directly connected to garden
    const moveMsg = waitForMessage(ws);
    ws.send(JSON.stringify({ type: "move", toRoom: "garden" }));
    const response = await moveMsg;

    expect(response.type).toBe("error");
  });

  it("two guests see each other's speech", async () => {
    const ws1 = await connectAndTrack();
    const ws2 = await connectAndTrack();

    // Guest 1 joins
    const join1 = collectMessages(ws1, 2);
    ws1.send(JSON.stringify({ type: "join", guestName: "Takeshi" }));
    await join1;

    // Guest 2 joins — ws1 gets a guest.entered notification
    const ws1Notification = waitForMessage(ws1);
    const join2 = collectMessages(ws2, 2);
    ws2.send(JSON.stringify({ type: "join", guestName: "Rei" }));
    await join2;
    const entered = await ws1Notification;
    expect(entered.type).toBe("guest.entered");

    // Guest 1 speaks — both should hear it
    const ws1Hear = waitForMessage(ws1);
    const ws2Hear = waitForMessage(ws2);
    ws1.send(JSON.stringify({ type: "speak", text: "Hello, Rei." }));

    const [msg1, msg2] = await Promise.all([ws1Hear, ws2Hear]);
    expect(msg1.type).toBe("guest.spoke");
    expect(msg2.type).toBe("guest.spoke");
    if (msg2.type === "guest.spoke") {
      expect(msg2.text).toBe("Hello, Rei.");
    }
  });

  it("guests in different rooms do not hear each other", async () => {
    const ws1 = await connectAndTrack();
    const ws2 = await connectAndTrack();

    // Guest 1 joins lobby
    const join1 = collectMessages(ws1, 2);
    ws1.send(JSON.stringify({ type: "join", guestName: "Takeshi" }));
    await join1;

    // Guest 2 joins lobby
    const _ws1Note = waitForMessage(ws1); // guest.entered notification
    const join2 = collectMessages(ws2, 2);
    ws2.send(JSON.stringify({ type: "join", guestName: "Rei" }));
    await join2;
    await _ws1Note;

    // Guest 2 moves to study
    const move2 = waitForMessage(ws2);
    ws2.send(JSON.stringify({ type: "move", toRoom: "study" }));
    await move2;

    // Also consume the guest.moved notification on ws1
    const movedNotification = waitForMessage(ws1);
    await movedNotification;

    // Guest 1 speaks in lobby — guest 2 in study should NOT hear it
    // We'll send the message and check that ws1 gets it but ws2 does not
    const ws1Hear = waitForMessage(ws1);
    ws1.send(JSON.stringify({ type: "speak", text: "Anyone here?" }));
    const heard = await ws1Hear;
    expect(heard.type).toBe("guest.spoke");

    // Give ws2 a moment to potentially receive the message
    const noMessage = await Promise.race([
      waitForMessage(ws2).then(() => "received"),
      new Promise<string>((r) => setTimeout(() => r("timeout"), 200)),
    ]);
    expect(noMessage).toBe("timeout");
  });
});
