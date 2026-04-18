import { describe, it, expect } from "vitest";
import { validateCharacter } from "./character.js";

const validCharacter = {
  name: "Poe",
  archetype: "hospitable concierge",
  systemPrompt: "You are Poe, the resident of The Roost. You tend to the place with quiet pride and warmth.",
  voice: {
    register: "warm" as const,
    quirks: ["references literature"],
    avoidances: ["corporate language"],
  },
  loyalties: {
    principal: null,
    values: ["guest comfort"],
  },
};

describe("validateCharacter", () => {
  it("accepts a valid character definition", () => {
    const result = validateCharacter(validCharacter);
    expect(result.name).toBe("Poe");
    expect(result.archetype).toBe("hospitable concierge");
  });

  it("rejects a character with missing name", () => {
    expect(() =>
      validateCharacter({ ...validCharacter, name: "" }),
    ).toThrow();
  });

  it("rejects a character with too-short system prompt", () => {
    expect(() =>
      validateCharacter({ ...validCharacter, systemPrompt: "Short." }),
    ).toThrow();
  });

  it("rejects an invalid voice register", () => {
    expect(() =>
      validateCharacter({
        ...validCharacter,
        voice: { ...validCharacter.voice, register: "booming" },
      }),
    ).toThrow();
  });

  it("accepts a character with decay config", () => {
    const result = validateCharacter({
      ...validCharacter,
      decay: { enabled: true, severity: 0.3, symptoms: ["occasional reboot"] },
    });
    expect(result.decay?.enabled).toBe(true);
  });
});
