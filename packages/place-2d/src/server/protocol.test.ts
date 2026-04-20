import { describe, expect, it } from "vitest";
import { ClientMessage } from "./protocol.js";

describe("ClientMessage validation", () => {
  it("accepts a valid join message", () => {
    const result = ClientMessage.safeParse({ type: "join", guestName: "Takeshi" });
    expect(result.success).toBe(true);
  });

  it("rejects a join message with empty name", () => {
    const result = ClientMessage.safeParse({ type: "join", guestName: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid move message", () => {
    const result = ClientMessage.safeParse({ type: "move", toRoom: "study" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid speak message", () => {
    const result = ClientMessage.safeParse({ type: "speak", text: "Hello, Poe." });
    expect(result.success).toBe(true);
  });

  it("rejects a speak message with empty text", () => {
    const result = ClientMessage.safeParse({ type: "speak", text: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid interact message", () => {
    const result = ClientMessage.safeParse({
      type: "interact",
      affordanceId: "fireplace",
      actionId: "light",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an interact message with params", () => {
    const result = ClientMessage.safeParse({
      type: "interact",
      affordanceId: "desk",
      actionId: "leave-note",
      params: { content: "Hello" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown message type", () => {
    const result = ClientMessage.safeParse({ type: "fly", destination: "moon" });
    expect(result.success).toBe(false);
  });

  it("rejects malformed JSON objects", () => {
    const result = ClientMessage.safeParse("not an object");
    expect(result.success).toBe(false);
  });
});
