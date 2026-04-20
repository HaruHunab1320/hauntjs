import type {
  Affordance,
  AffordanceId,
  Guest,
  GuestId,
  LoyaltyTier,
  Place,
  RelationshipState,
  Room,
  RoomId,
} from "./types.js";

export interface CreatePlaceOptions {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
}

/** Creates a new Place with empty rooms and guests maps. */
export function createPlace(options: CreatePlaceOptions): Place {
  return {
    id: options.id,
    name: options.name,
    rooms: new Map(),
    guests: new Map(),
    metadata: options.metadata ?? {},
  };
}

export interface AddRoomOptions {
  id: RoomId;
  name: string;
  description: string;
  connectedTo?: RoomId[];
  state?: Record<string, unknown>;
}

/**
 * Adds a new room to the place and returns it.
 * @throws If a room with the same id already exists in the place.
 */
export function addRoom(place: Place, options: AddRoomOptions): Room {
  if (place.rooms.has(options.id)) {
    throw new Error(`Room "${options.id}" already exists in place "${place.name}"`);
  }

  const room: Room = {
    id: options.id,
    name: options.name,
    description: options.description,
    affordances: new Map(),
    sensors: new Map(),
    connectedTo: options.connectedTo ?? [],
    state: options.state ?? {},
  };

  place.rooms.set(options.id, room);
  return room;
}

/**
 * Removes a room from the place and cleans up connections from other rooms.
 * @throws If the room does not exist or any guest is still in it.
 */
export function removeRoom(place: Place, roomId: RoomId): void {
  if (!place.rooms.has(roomId)) {
    throw new Error(`Room "${roomId}" does not exist in place "${place.name}"`);
  }

  // Check no guests are in this room
  for (const guest of place.guests.values()) {
    if (guest.currentRoom === roomId) {
      throw new Error(`Cannot remove room "${roomId}": guest "${guest.name}" is still in it`);
    }
  }

  place.rooms.delete(roomId);

  // Remove from other rooms' connectedTo lists
  for (const room of place.rooms.values()) {
    room.connectedTo = room.connectedTo.filter((id) => id !== roomId);
  }
}

/**
 * Creates a bidirectional connection between two rooms.
 * @throws If either room does not exist in the place.
 */
export function connectRooms(place: Place, a: RoomId, b: RoomId): void {
  const roomA = place.rooms.get(a);
  const roomB = place.rooms.get(b);

  if (!roomA) throw new Error(`Room "${a}" does not exist`);
  if (!roomB) throw new Error(`Room "${b}" does not exist`);

  if (!roomA.connectedTo.includes(b)) roomA.connectedTo.push(b);
  if (!roomB.connectedTo.includes(a)) roomB.connectedTo.push(a);
}

/**
 * Adds an affordance to the specified room.
 * @throws If the room does not exist or an affordance with the same id is already present.
 */
export function addAffordance(place: Place, roomId: RoomId, affordance: Affordance): void {
  const room = place.rooms.get(roomId);
  if (!room) {
    throw new Error(`Room "${roomId}" does not exist in place "${place.name}"`);
  }
  if (room.affordances.has(affordance.id)) {
    throw new Error(`Affordance "${affordance.id}" already exists in room "${roomId}"`);
  }

  room.affordances.set(affordance.id, { ...affordance, roomId });
}

/**
 * Removes an affordance from the specified room.
 * @throws If the room or affordance does not exist.
 */
export function removeAffordance(place: Place, roomId: RoomId, affordanceId: AffordanceId): void {
  const room = place.rooms.get(roomId);
  if (!room) {
    throw new Error(`Room "${roomId}" does not exist`);
  }
  if (!room.affordances.has(affordanceId)) {
    throw new Error(`Affordance "${affordanceId}" does not exist in room "${roomId}"`);
  }

  room.affordances.delete(affordanceId);
}

/**
 * Merges an update into an affordance's state and returns the previous and new state.
 * @throws If the room or affordance does not exist.
 */
export function updateAffordanceState(
  place: Place,
  roomId: RoomId,
  affordanceId: AffordanceId,
  update: Record<string, unknown>,
): { prevState: Record<string, unknown>; newState: Record<string, unknown> } {
  const room = place.rooms.get(roomId);
  if (!room) throw new Error(`Room "${roomId}" does not exist`);

  const affordance = room.affordances.get(affordanceId);
  if (!affordance)
    throw new Error(`Affordance "${affordanceId}" does not exist in room "${roomId}"`);

  const prevState = { ...affordance.state };
  affordance.state = { ...affordance.state, ...update };
  const newState = { ...affordance.state };

  return { prevState, newState };
}

/** Searches all rooms for an affordance by id, returning it or undefined if not found. */
export function getAffordance(place: Place, id: AffordanceId | string): Affordance | undefined {
  for (const room of place.rooms.values()) {
    const aff = room.affordances.get(id as AffordanceId);
    if (aff) return aff;
  }
  return undefined;
}

/** Searches all rooms for a sensor by id, returning it or undefined if not found. */
export function getSensor(place: Place, id: string): import("./types.js").Sensor | undefined {
  for (const room of place.rooms.values()) {
    const sensor = room.sensors.get(id as import("./types.js").SensorId);
    if (sensor) return sensor;
  }
  return undefined;
}

export interface AddGuestOptions {
  id: GuestId;
  name: string;
  loyaltyTier?: LoyaltyTier;
  relationship?: RelationshipState;
}

/**
 * Registers a new guest in the place (not yet in any room) and returns it.
 * @throws If a guest with the same id already exists in the place.
 */
export function addGuest(place: Place, options: AddGuestOptions): Guest {
  if (place.guests.has(options.id)) {
    throw new Error(`Guest "${options.id}" already exists in place "${place.name}"`);
  }

  const now = new Date();
  const guest: Guest = {
    id: options.id,
    name: options.name,
    currentRoom: null,
    firstSeen: now,
    lastSeen: now,
    visitCount: 0,
    loyaltyTier: options.loyaltyTier ?? "stranger",
    relationship: options.relationship ?? { notes: [], sentiment: 0 },
  };

  place.guests.set(options.id, guest);
  return guest;
}

/**
 * Places a guest into a room, updating their lastSeen timestamp and visit count.
 * @throws If the guest or room does not exist.
 */
export function enterRoom(place: Place, guestId: GuestId, roomId: RoomId): void {
  const guest = place.guests.get(guestId);
  if (!guest) throw new Error(`Guest "${guestId}" does not exist`);

  const room = place.rooms.get(roomId);
  if (!room) throw new Error(`Room "${roomId}" does not exist`);

  guest.currentRoom = roomId;
  guest.lastSeen = new Date();
  guest.visitCount += 1;
}

/**
 * Moves a guest from their current room to a connected room.
 * @throws If the guest or room does not exist, the guest is not in a room, or the rooms are not connected.
 */
export function moveGuest(place: Place, guestId: GuestId, toRoomId: RoomId): void {
  const guest = place.guests.get(guestId);
  if (!guest) throw new Error(`Guest "${guestId}" does not exist`);
  if (!guest.currentRoom) throw new Error(`Guest "${guestId}" is not in any room`);

  const currentRoom = place.rooms.get(guest.currentRoom);
  if (!currentRoom) throw new Error(`Guest's current room "${guest.currentRoom}" does not exist`);

  if (!currentRoom.connectedTo.includes(toRoomId)) {
    throw new Error(`Room "${toRoomId}" is not connected to "${guest.currentRoom}"`);
  }

  const toRoom = place.rooms.get(toRoomId);
  if (!toRoom) throw new Error(`Room "${toRoomId}" does not exist`);

  guest.currentRoom = toRoomId;
  guest.lastSeen = new Date();
}

/**
 * Removes a guest from their current room (sets currentRoom to null) and returns the room they left.
 * @throws If the guest does not exist or is not in any room.
 */
export function leavePlace(place: Place, guestId: GuestId): RoomId {
  const guest = place.guests.get(guestId);
  if (!guest) throw new Error(`Guest "${guestId}" does not exist`);
  if (!guest.currentRoom) throw new Error(`Guest "${guestId}" is not in any room`);

  const roomId = guest.currentRoom;
  guest.currentRoom = null;
  guest.lastSeen = new Date();

  return roomId;
}

/** Returns all guests currently located in the specified room. */
export function getGuestsInRoom(place: Place, roomId: RoomId): Guest[] {
  const guests: Guest[] = [];
  for (const guest of place.guests.values()) {
    if (guest.currentRoom === roomId) {
      guests.push(guest);
    }
  }
  return guests;
}
