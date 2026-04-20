import type { CharacterDefinition } from "@hauntjs/core";
import { z } from "zod";

const VoiceSchema = z.object({
  register: z.enum(["formal", "warm", "clipped", "poetic"]),
  quirks: z.array(z.string()),
  avoidances: z.array(z.string()),
});

const LoyaltiesSchema = z.object({
  principal: z.string().nullable(),
  values: z.array(z.string()),
});

const DecaySchema = z.object({
  enabled: z.boolean(),
  severity: z.number().min(0).max(1),
  symptoms: z.array(z.string()),
});

const CharacterSchema = z.object({
  name: z.string().min(1),
  archetype: z.string().min(1),
  systemPrompt: z.string().min(50),
  voice: VoiceSchema,
  loyalties: LoyaltiesSchema,
  decay: DecaySchema.optional(),
});

export function validateCharacter(data: unknown): CharacterDefinition {
  return CharacterSchema.parse(data);
}

export function createCharacter(definition: CharacterDefinition): CharacterDefinition {
  return validateCharacter(definition);
}
