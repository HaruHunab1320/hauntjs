import type {
  Place,
  Room,
  Affordance,
  Guest,
  RoomId,
  AffordanceId,
  GuestId,
  LoyaltyTier,
  RelationshipState,
} from "./types.js";

export interface CreatePlaceOptions {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
}

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

export function addRoom(place: Place, options: AddRoomOptions): Room {
  if (place.rooms.has(options.id)) {
    throw new Error(`Room "${options.id}" already exists in place "${place.name}"`);
  }

  const room: Room = {
    id: options.id,
    name: options.name,
    description: options.description,
    affordances: new Map(),
    connectedTo: options.connectedTo ?? [],
    state: options.state ?? {},
  };

  place.rooms.set(options.id, room);
  return room;
}

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

export function connectRooms(place: Place, a: RoomId, b: RoomId): void {
  const roomA = place.rooms.get(a);
  const roomB = place.rooms.get(b);

  if (!roomA) throw new Error(`Room "${a}" does not exist`);
  if (!roomB) throw new Error(`Room "${b}" does not exist`);

  if (!roomA.connectedTo.includes(b)) roomA.connectedTo.push(b);
  if (!roomB.connectedTo.includes(a)) roomB.connectedTo.push(a);
}

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

export function updateAffordanceState(
  place: Place,
  roomId: RoomId,
  affordanceId: AffordanceId,
  update: Record<string, unknown>,
): { prevState: Record<string, unknown>; newState: Record<string, unknown> } {
  const room = place.rooms.get(roomId);
  if (!room) throw new Error(`Room "${roomId}" does not exist`);

  const affordance = room.affordances.get(affordanceId);
  if (!affordance) throw new Error(`Affordance "${affordanceId}" does not exist in room "${roomId}"`);

  const prevState = { ...affordance.state };
  affordance.state = { ...affordance.state, ...update };
  const newState = { ...affordance.state };

  return { prevState, newState };
}

export function getAffordance(place: Place, affordanceId: AffordanceId): Affordance | undefined {
  for (const room of place.rooms.values()) {
    const aff = room.affordances.get(affordanceId);
    if (aff) return aff;
  }
  return undefined;
}

export interface AddGuestOptions {
  id: GuestId;
  name: string;
  loyaltyTier?: LoyaltyTier;
  relationship?: RelationshipState;
}

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

export function enterRoom(place: Place, guestId: GuestId, roomId: RoomId): void {
  const guest = place.guests.get(guestId);
  if (!guest) throw new Error(`Guest "${guestId}" does not exist`);

  const room = place.rooms.get(roomId);
  if (!room) throw new Error(`Room "${roomId}" does not exist`);

  guest.currentRoom = roomId;
  guest.lastSeen = new Date();
  guest.visitCount += 1;
}

export function moveGuest(place: Place, guestId: GuestId, toRoomId: RoomId): void {
  const guest = place.guests.get(guestId);
  if (!guest) throw new Error(`Guest "${guestId}" does not exist`);
  if (!guest.currentRoom) throw new Error(`Guest "${guestId}" is not in any room`);

  const currentRoom = place.rooms.get(guest.currentRoom);
  if (!currentRoom) throw new Error(`Guest's current room "${guest.currentRoom}" does not exist`);

  if (!currentRoom.connectedTo.includes(toRoomId)) {
    throw new Error(
      `Room "${toRoomId}" is not connected to "${guest.currentRoom}"`,
    );
  }

  const toRoom = place.rooms.get(toRoomId);
  if (!toRoom) throw new Error(`Room "${toRoomId}" does not exist`);

  guest.currentRoom = toRoomId;
  guest.lastSeen = new Date();
}

export function leavePlace(place: Place, guestId: GuestId): RoomId {
  const guest = place.guests.get(guestId);
  if (!guest) throw new Error(`Guest "${guestId}" does not exist`);
  if (!guest.currentRoom) throw new Error(`Guest "${guestId}" is not in any room`);

  const roomId = guest.currentRoom;
  guest.currentRoom = null;
  guest.lastSeen = new Date();

  return roomId;
}

export function getGuestsInRoom(place: Place, roomId: RoomId): Guest[] {
  const guests: Guest[] = [];
  for (const guest of place.guests.values()) {
    if (guest.currentRoom === roomId) {
      guests.push(guest);
    }
  }
  return guests;
}
