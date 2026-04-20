import { affordanceId, roomId } from "@hauntjs/core";
import { describe, expect, it } from "vitest";
import { Place2DAdapter } from "./adapter.js";
import { ROOST_CONFIG } from "./world-config.js";

describe("Place2DAdapter", () => {
  describe("mount", () => {
    it("builds The Roost place with all rooms", async () => {
      const adapter = new Place2DAdapter(ROOST_CONFIG);
      const place = await adapter.mount();

      expect(place.id).toBe("the-roost");
      expect(place.name).toBe("The Roost");
      expect(place.rooms.size).toBe(4);
      expect(place.rooms.has(roomId("lobby"))).toBe(true);
      expect(place.rooms.has(roomId("study"))).toBe(true);
      expect(place.rooms.has(roomId("parlor"))).toBe(true);
      expect(place.rooms.has(roomId("garden"))).toBe(true);
    });

    it("connects rooms correctly", async () => {
      const adapter = new Place2DAdapter(ROOST_CONFIG);
      const place = await adapter.mount();

      const lobby = place.rooms.get(roomId("lobby"))!;
      expect(lobby.connectedTo).toContain(roomId("study"));
      expect(lobby.connectedTo).toContain(roomId("parlor"));

      const parlor = place.rooms.get(roomId("parlor"))!;
      expect(parlor.connectedTo).toContain(roomId("lobby"));
      expect(parlor.connectedTo).toContain(roomId("garden"));

      // Study only connects to lobby
      const study = place.rooms.get(roomId("study"))!;
      expect(study.connectedTo).toContain(roomId("lobby"));
      expect(study.connectedTo).not.toContain(roomId("garden"));
    });

    it("adds all affordances to the correct rooms", async () => {
      const adapter = new Place2DAdapter(ROOST_CONFIG);
      const place = await adapter.mount();

      const lobby = place.rooms.get(roomId("lobby"))!;
      expect(lobby.affordances.has(affordanceId("fireplace"))).toBe(true);
      expect(lobby.affordances.has(affordanceId("notice-board"))).toBe(true);

      const study = place.rooms.get(roomId("study"))!;
      expect(study.affordances.has(affordanceId("desk"))).toBe(true);
      expect(study.affordances.has(affordanceId("bookshelf"))).toBe(true);

      const parlor = place.rooms.get(roomId("parlor"))!;
      expect(parlor.affordances.has(affordanceId("piano"))).toBe(true);

      const garden = place.rooms.get(roomId("garden"))!;
      expect(garden.affordances.has(affordanceId("fountain"))).toBe(true);
    });

    it("sets up affordance actions with availability", async () => {
      const adapter = new Place2DAdapter(ROOST_CONFIG);
      const place = await adapter.mount();

      const fireplace = place.rooms
        .get(roomId("lobby"))!
        .affordances.get(affordanceId("fireplace"))!;
      expect(fireplace.state.lit).toBe(false);

      const lightAction = fireplace.actions.find((a) => a.id === "light")!;
      expect(lightAction.availableWhen!(fireplace.state)).toBe(true);

      const extinguishAction = fireplace.actions.find((a) => a.id === "extinguish")!;
      expect(extinguishAction.availableWhen!(fireplace.state)).toBe(false);
    });
  });
});
