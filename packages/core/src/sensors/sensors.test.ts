import { describe, expect, it } from "vitest";
import { roomId } from "../types.js";
import { omniscientSensor } from "./omniscient.js";
import { presenceSensor } from "./presence-sensor.js";
import { sightSensor } from "./sight-sensor.js";
import { mutedAudioSensor, soundSensor } from "./sound-sensor.js";
import { stateSensor } from "./state-sensor.js";
import { textSensor } from "./text-sensor.js";

const lobby = roomId("lobby");

describe("sensor factories", () => {
  describe("presenceSensor", () => {
    it("creates a presence sensor with default fidelity", () => {
      const [id, sensor] = presenceSensor("lobby.door", lobby);
      expect(id).toBe("lobby.door");
      expect(sensor.modality).toBe("presence");
      expect(sensor.fidelity).toEqual({ kind: "partial", reveals: ["presence"] });
      expect(sensor.reach).toEqual({ kind: "room" });
      expect(sensor.enabled).toBe(true);
      expect(sensor.roomId).toBe(lobby);
    });

    it("accepts custom fidelity", () => {
      const [, sensor] = presenceSensor("lobby.door", lobby, {
        fidelity: { kind: "full" },
      });
      expect(sensor.fidelity).toEqual({ kind: "full" });
    });

    it("accepts custom reach", () => {
      const [, sensor] = presenceSensor("lobby.door", lobby, {
        reach: { kind: "adjacent", maxDepth: 1 },
      });
      expect(sensor.reach).toEqual({ kind: "adjacent", maxDepth: 1 });
    });
  });

  describe("sightSensor", () => {
    it("creates a sight sensor with full fidelity by default", () => {
      const [id, sensor] = sightSensor("lobby.camera", lobby);
      expect(id).toBe("lobby.camera");
      expect(sensor.modality).toBe("sight");
      expect(sensor.fidelity).toEqual({ kind: "full" });
      expect(sensor.reach).toEqual({ kind: "room" });
    });

    it("accepts partial fidelity", () => {
      const [, sensor] = sightSensor("parlor.dim", lobby, {
        fidelity: { kind: "partial", reveals: ["presence", "identity"] },
      });
      expect(sensor.fidelity).toEqual({ kind: "partial", reveals: ["presence", "identity"] });
    });
  });

  describe("soundSensor", () => {
    it("creates a sound sensor with full fidelity by default", () => {
      const [, sensor] = soundSensor("lobby.mic", lobby);
      expect(sensor.modality).toBe("sound");
      expect(sensor.fidelity).toEqual({ kind: "full" });
    });
  });

  describe("mutedAudioSensor", () => {
    it("creates a muted audio sensor with ambiguous fidelity", () => {
      const [, sensor] = mutedAudioSensor("bathroom.intercom", lobby);
      expect(sensor.modality).toBe("sound");
      expect(sensor.fidelity).toEqual({ kind: "ambiguous", confidence: 0.4 });
    });

    it("accepts custom confidence", () => {
      const [, sensor] = mutedAudioSensor("bathroom.intercom", lobby, {
        confidence: 0.7,
      });
      expect(sensor.fidelity).toEqual({ kind: "ambiguous", confidence: 0.7 });
    });
  });

  describe("stateSensor", () => {
    it("creates a state sensor scoped to an affordance", () => {
      const [, sensor] = stateSensor("lobby.fire-state", lobby, "fireplace");
      expect(sensor.modality).toBe("state");
      expect(sensor.reach).toEqual({ kind: "affordance", affordanceId: "fireplace" });
    });
  });

  describe("textSensor", () => {
    it("creates a text sensor with full fidelity by default", () => {
      const [, sensor] = textSensor("chat.text", lobby);
      expect(sensor.modality).toBe("text");
      expect(sensor.fidelity).toEqual({ kind: "full" });
    });
  });

  describe("omniscientSensor", () => {
    it("creates a place-wide full fidelity sensor", () => {
      const [, sensor] = omniscientSensor("god-eye", lobby);
      expect(sensor.modality).toBe("sight");
      expect(sensor.fidelity).toEqual({ kind: "full" });
      expect(sensor.reach).toEqual({ kind: "place-wide" });
    });
  });

  describe("all factories", () => {
    it("return [id, Sensor] tuples usable with Map constructor", () => {
      const sensors = new Map([
        presenceSensor("lobby.door", lobby),
        sightSensor("lobby.camera", lobby),
        soundSensor("lobby.mic", lobby),
      ]);
      expect(sensors.size).toBe(3);
      expect(sensors.get("lobby.door")?.modality).toBe("presence");
      expect(sensors.get("lobby.camera")?.modality).toBe("sight");
      expect(sensors.get("lobby.mic")?.modality).toBe("sound");
    });
  });
});
