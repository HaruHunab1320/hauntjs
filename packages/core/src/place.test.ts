import { describe, expect, it } from "vitest";
import {
  addAffordance,
  addGuest,
  addRoom,
  connectRooms,
  createPlace,
  enterRoom,
  getAffordance,
  getGuestsInRoom,
  leavePlace,
  moveGuest,
  removeAffordance,
  removeRoom,
  updateAffordanceState,
} from "./place.js";
import type { Affordance } from "./types.js";
import { affordanceId, guestId, roomId } from "./types.js";

function makePlace() {
  const place = createPlace({ id: "test", name: "Test Place" });
  const lobby = roomId("lobby");
  const study = roomId("study");

  addRoom(place, { id: lobby, name: "Lobby", description: "The main hall" });
  addRoom(place, { id: study, name: "Study", description: "A quiet room" });
  connectRooms(place, lobby, study);

  return { place, lobby, study };
}

function makeFireplace(rId: string): Affordance {
  return {
    id: affordanceId("fireplace"),
    roomId: roomId(rId),
    kind: "fireplace",
    name: "Fireplace",
    description: "A stone fireplace",
    state: { lit: false },
    actions: [
      {
        id: "light",
        name: "Light",
        description: "Light the fire",
        availableWhen: (state) => state.lit === false,
      },
      {
        id: "extinguish",
        name: "Extinguish",
        description: "Put out the fire",
        availableWhen: (state) => state.lit === true,
      },
    ],
    sensable: true,
  };
}

describe("createPlace", () => {
  it("creates a place with empty rooms and guests", () => {
    const place = createPlace({ id: "roost", name: "The Roost" });
    expect(place.id).toBe("roost");
    expect(place.name).toBe("The Roost");
    expect(place.rooms.size).toBe(0);
    expect(place.guests.size).toBe(0);
  });
});

describe("rooms", () => {
  it("adds a room", () => {
    const place = createPlace({ id: "test", name: "Test" });
    const room = addRoom(place, {
      id: roomId("lobby"),
      name: "Lobby",
      description: "The main hall",
    });
    expect(room.name).toBe("Lobby");
    expect(place.rooms.size).toBe(1);
  });

  it("throws on duplicate room id", () => {
    const place = createPlace({ id: "test", name: "Test" });
    addRoom(place, { id: roomId("lobby"), name: "Lobby", description: "Hall" });
    expect(() =>
      addRoom(place, { id: roomId("lobby"), name: "Lobby 2", description: "Hall 2" }),
    ).toThrow(/already exists/);
  });

  it("connects rooms bidirectionally", () => {
    const { place, lobby, study } = makePlace();
    const lobbyRoom = place.rooms.get(lobby)!;
    const studyRoom = place.rooms.get(study)!;
    expect(lobbyRoom.connectedTo).toContain(study);
    expect(studyRoom.connectedTo).toContain(lobby);
  });

  it("removes a room and cleans up connections", () => {
    const { place, lobby, study } = makePlace();
    removeRoom(place, study);
    expect(place.rooms.size).toBe(1);
    expect(place.rooms.get(lobby)!.connectedTo).not.toContain(study);
  });

  it("throws when removing a room with guests in it", () => {
    const { place, lobby } = makePlace();
    const guest = addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    enterRoom(place, guest.id, lobby);
    expect(() => removeRoom(place, lobby)).toThrow(/still in it/);
  });
});

describe("affordances", () => {
  it("adds and retrieves an affordance", () => {
    const { place, lobby } = makePlace();
    addAffordance(place, lobby, makeFireplace("lobby"));
    const aff = getAffordance(place, affordanceId("fireplace"));
    expect(aff).toBeDefined();
    expect(aff!.kind).toBe("fireplace");
  });

  it("throws on duplicate affordance", () => {
    const { place, lobby } = makePlace();
    addAffordance(place, lobby, makeFireplace("lobby"));
    expect(() => addAffordance(place, lobby, makeFireplace("lobby"))).toThrow(/already exists/);
  });

  it("removes an affordance", () => {
    const { place, lobby } = makePlace();
    addAffordance(place, lobby, makeFireplace("lobby"));
    removeAffordance(place, lobby, affordanceId("fireplace"));
    expect(getAffordance(place, affordanceId("fireplace"))).toBeUndefined();
  });

  it("updates affordance state", () => {
    const { place, lobby } = makePlace();
    addAffordance(place, lobby, makeFireplace("lobby"));
    const { prevState, newState } = updateAffordanceState(place, lobby, affordanceId("fireplace"), {
      lit: true,
    });
    expect(prevState.lit).toBe(false);
    expect(newState.lit).toBe(true);
  });

  it("throws when updating affordance in non-existent room", () => {
    const { place } = makePlace();
    expect(() => updateAffordanceState(place, roomId("nowhere"), affordanceId("x"), {})).toThrow(
      /does not exist/,
    );
  });
});

describe("guests", () => {
  it("adds a guest with defaults", () => {
    const { place } = makePlace();
    const guest = addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    expect(guest.name).toBe("Takeshi");
    expect(guest.currentRoom).toBeNull();
    expect(guest.loyaltyTier).toBe("stranger");
    expect(guest.visitCount).toBe(0);
  });

  it("enters a room", () => {
    const { place, lobby } = makePlace();
    const guest = addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    enterRoom(place, guest.id, lobby);
    expect(guest.currentRoom).toBe(lobby);
    expect(guest.visitCount).toBe(1);
  });

  it("moves between connected rooms", () => {
    const { place, lobby, study } = makePlace();
    const guest = addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    enterRoom(place, guest.id, lobby);
    moveGuest(place, guest.id, study);
    expect(guest.currentRoom).toBe(study);
  });

  it("throws when moving to unconnected room", () => {
    const { place, lobby } = makePlace();
    const garden = roomId("garden");
    addRoom(place, { id: garden, name: "Garden", description: "Outside" });
    const guest = addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    enterRoom(place, guest.id, lobby);
    expect(() => moveGuest(place, guest.id, garden)).toThrow(/not connected/);
  });

  it("throws when moving a guest not in any room", () => {
    const { place, lobby } = makePlace();
    const guest = addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    expect(() => moveGuest(place, guest.id, lobby)).toThrow(/not in any room/);
  });

  it("leaves the place", () => {
    const { place, lobby } = makePlace();
    const guest = addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    enterRoom(place, guest.id, lobby);
    const leftRoom = leavePlace(place, guest.id);
    expect(leftRoom).toBe(lobby);
    expect(guest.currentRoom).toBeNull();
  });

  it("gets guests in a specific room", () => {
    const { place, lobby, study } = makePlace();
    addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    addGuest(place, { id: guestId("g2"), name: "Rei" });
    enterRoom(place, guestId("g1"), lobby);
    enterRoom(place, guestId("g2"), study);

    const lobbyGuests = getGuestsInRoom(place, lobby);
    expect(lobbyGuests).toHaveLength(1);
    expect(lobbyGuests[0].name).toBe("Takeshi");
  });

  it("throws on duplicate guest id", () => {
    const { place } = makePlace();
    addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    expect(() => addGuest(place, { id: guestId("g1"), name: "Takeshi 2" })).toThrow(
      /already exists/,
    );
  });

  it("throws when entering a non-existent room", () => {
    const { place } = makePlace();
    const guest = addGuest(place, { id: guestId("g1"), name: "Takeshi" });
    expect(() => enterRoom(place, guest.id, roomId("nowhere"))).toThrow(/does not exist/);
  });
});
