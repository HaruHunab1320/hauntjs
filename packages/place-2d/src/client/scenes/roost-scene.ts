import * as Phaser from "phaser";
import { GameSocket } from "../net/socket.js";
import { ChatBox } from "../ui/chat-box.js";
import { SpeechBubble } from "../ui/speech-bubble.js";
import { InteractMenu } from "../ui/interact-menu.js";
import type { PublicPlaceState } from "../../../shared/protocol-types.js";

// Room visual layouts — positions of affordances and doorways relative to room center
interface RoomLayout {
  color: number;
  affordancePositions: Record<string, { x: number; y: number }>;
  doorPositions: Record<string, { x: number; y: number }>;
}

const ROOM_LAYOUTS: Record<string, RoomLayout> = {
  lobby: {
    color: 0x2d1b0e,
    affordancePositions: {
      fireplace: { x: -180, y: -80 },
      "notice-board": { x: 180, y: -80 },
    },
    doorPositions: {
      study: { x: 220, y: 0 },
      parlor: { x: -220, y: 0 },
    },
  },
  study: {
    color: 0x1a2636,
    affordancePositions: {
      desk: { x: -120, y: -60 },
      bookshelf: { x: 150, y: -80 },
    },
    doorPositions: {
      lobby: { x: -220, y: 0 },
    },
  },
  parlor: {
    color: 0x2a1a2e,
    affordancePositions: {
      piano: { x: 140, y: -70 },
    },
    doorPositions: {
      lobby: { x: 220, y: 0 },
      garden: { x: 0, y: 120 },
    },
  },
  garden: {
    color: 0x1a2e1a,
    affordancePositions: {
      fountain: { x: 0, y: -40 },
    },
    doorPositions: {
      parlor: { x: 0, y: -120 },
    },
  },
};

const PLAYER_SPEED = 160;
const PLAYER_RADIUS = 12;
const RESIDENT_RADIUS = 14;
const AFFORDANCE_SIZE = 20;
const DOOR_SIZE = 30;

export class RoostScene extends Phaser.Scene {
  private socket!: GameSocket;
  private chatBox!: ChatBox;
  private interactMenu!: InteractMenu;
  private speechBubble!: SpeechBubble;

  private guestId: string | null = null;
  private guestName: string = "";
  private placeState: PublicPlaceState | null = null;

  // Player
  private playerSprite!: Phaser.GameObjects.Arc;
  private playerNameText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  // Resident
  private residentSprite!: Phaser.GameObjects.Arc;
  private residentNameText!: Phaser.GameObjects.Text;

  // Other guests
  private otherGuests = new Map<string, { sprite: Phaser.GameObjects.Arc; nameText: Phaser.GameObjects.Text }>();

  // Room objects
  private affordanceSprites = new Map<string, { rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();
  private doorSprites = new Map<string, { rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();

  private roomLabel!: HTMLElement;
  private roomDesc!: HTMLElement;
  private interactHint!: HTMLElement;
  private nearDoor: string | null = null;
  private nearAffordance: string | null = null;

  constructor() {
    super({ key: "RoostScene" });
  }

  init(data: { socket: GameSocket; guestName: string }): void {
    this.socket = data.socket;
    this.guestName = data.guestName;
  }

  create(): void {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Chat
    this.chatBox = new ChatBox((text) => {
      this.socket.speak(text);
    });
    this.chatBox.addSystem("Connected to The Roost.");

    // Interact menu
    this.interactMenu = new InteractMenu((affordanceId, actionId) => {
      this.socket.interact(affordanceId, actionId);
    });

    // Speech bubble
    this.speechBubble = new SpeechBubble(this);

    // Player sprite
    this.playerSprite = this.add.circle(cx, cy, PLAYER_RADIUS, 0x88ccaa);
    this.playerSprite.setDepth(10);
    this.playerNameText = this.add.text(cx, cy + PLAYER_RADIUS + 4, this.guestName, {
      fontSize: "11px",
      fontFamily: "Georgia, serif",
      color: "#c3e88d",
    }).setOrigin(0.5, 0).setDepth(10);

    // Resident sprite
    this.residentSprite = this.add.circle(cx - 60, cy - 30, RESIDENT_RADIUS, 0xe4a672);
    this.residentSprite.setDepth(10);
    this.residentNameText = this.add.text(cx - 60, cy - 30 + RESIDENT_RADIUS + 4, "Poe", {
      fontSize: "11px",
      fontFamily: "Georgia, serif",
      color: "#e4a672",
    }).setOrigin(0.5, 0).setDepth(10);

    // Controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      e: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    };

    // HTML refs
    this.roomLabel = document.getElementById("room-label")!;
    this.roomDesc = document.getElementById("room-desc")!;
    this.interactHint = document.getElementById("interact-hint")!;

    // Socket events
    this.setupSocketHandlers();

    // Join
    this.socket.join(this.guestName);
  }

  update(_time: number, delta: number): void {
    if (this.chatBox.isFocused || this.interactMenu.isVisible) return;

    // Movement
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.a.isDown) vx = -1;
    if (this.cursors.right.isDown || this.wasd.d.isDown) vx = 1;
    if (this.cursors.up.isDown || this.wasd.w.isDown) vy = -1;
    if (this.cursors.down.isDown || this.wasd.s.isDown) vy = 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      const speed = PLAYER_SPEED * (delta / 1000);
      this.playerSprite.x += (vx / len) * speed;
      this.playerSprite.y += (vy / len) * speed;

      // Clamp to room bounds
      const hw = 240;
      const hh = 140;
      const cx = this.cameras.main.centerX;
      const cy = this.cameras.main.centerY;
      this.playerSprite.x = Phaser.Math.Clamp(this.playerSprite.x, cx - hw, cx + hw);
      this.playerSprite.y = Phaser.Math.Clamp(this.playerSprite.y, cy - hh, cy + hh);
    }

    // Update name position
    this.playerNameText.setPosition(this.playerSprite.x, this.playerSprite.y + PLAYER_RADIUS + 4);

    // Update speech bubble
    if (this.speechBubble.isVisible) {
      this.speechBubble.updatePosition(this.residentSprite.x, this.residentSprite.y - RESIDENT_RADIUS - 8);
    }

    // Check proximity to doors
    this.checkDoorProximity();
    this.checkAffordanceProximity();

    // E to interact
    if (Phaser.Input.Keyboard.JustDown(this.wasd.e)) {
      if (this.nearDoor) {
        this.socket.move(this.nearDoor);
      } else if (this.nearAffordance) {
        this.showAffordanceMenu(this.nearAffordance);
      }
    }
  }

  private setupSocketHandlers(): void {
    this.socket.on("joined", (msg) => {
      if (msg.type === "joined") {
        this.guestId = msg.guestId;
      }
    });

    this.socket.on("state", (msg) => {
      if (msg.type === "state") {
        this.placeState = msg.place;
        this.renderRoom();
      }
    });

    this.socket.on("resident.spoke", (msg) => {
      if (msg.type === "resident.spoke") {
        this.chatBox.addResidentSpeech(msg.text);
        this.speechBubble.show(
          this.residentSprite.x,
          this.residentSprite.y - RESIDENT_RADIUS - 8,
          msg.text,
          6000,
        );
      }
    });

    this.socket.on("resident.moved", (msg) => {
      if (msg.type === "resident.moved" && this.placeState) {
        this.placeState.residentRoom = msg.to;
        this.updateResidentVisibility();
        this.chatBox.addSystem(`Poe moves to the ${msg.to}.`);
      }
    });

    this.socket.on("guest.spoke", (msg) => {
      if (msg.type === "guest.spoke") {
        const isSelf = msg.guestId === this.guestId;
        this.chatBox.addGuestSpeech(msg.guestName, msg.text, isSelf);
      }
    });

    this.socket.on("guest.entered", (msg) => {
      if (msg.type === "guest.entered" && msg.guestId !== this.guestId) {
        this.chatBox.addSystem(`${msg.guestName} enters the room.`);
        this.addOtherGuest(msg.guestId, msg.guestName);
      }
    });

    this.socket.on("guest.left", (msg) => {
      if (msg.type === "guest.left" && msg.guestId !== this.guestId) {
        this.chatBox.addSystem(`${msg.guestName} has left.`);
        this.removeOtherGuest(msg.guestId);
      }
    });

    this.socket.on("guest.moved", (msg) => {
      if (msg.type === "guest.moved" && msg.guestId !== this.guestId) {
        if (msg.to === this.placeState?.currentRoom) {
          this.chatBox.addSystem(`${msg.guestName} arrives.`);
          this.addOtherGuest(msg.guestId, msg.guestName);
        } else {
          this.chatBox.addSystem(`${msg.guestName} leaves.`);
          this.removeOtherGuest(msg.guestId);
        }
      }
    });

    this.socket.on("affordance.changed", (msg) => {
      if (msg.type === "affordance.changed") {
        this.chatBox.addSystem(`Something changes...`);
        // Update local state
        if (this.placeState) {
          const room = this.placeState.rooms.find((r) => r.id === msg.roomId);
          if (room) {
            const aff = room.affordances.find((a) => a.id === msg.affordanceId);
            if (aff) {
              aff.state = msg.newState;
              this.renderRoom();
            }
          }
        }
      }
    });

    this.socket.on("error", (msg) => {
      if (msg.type === "error") {
        this.chatBox.addSystem(`Error: ${msg.message}`);
      }
    });
  }

  private renderRoom(): void {
    if (!this.placeState || !this.placeState.currentRoom) return;

    const currentRoom = this.placeState.rooms.find((r) => r.id === this.placeState!.currentRoom);
    if (!currentRoom) return;

    const layout = ROOM_LAYOUTS[currentRoom.id] ?? ROOM_LAYOUTS.lobby;
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Update HTML labels
    this.roomLabel.textContent = currentRoom.name;
    this.roomDesc.textContent = currentRoom.description;

    // Clear old room objects
    this.clearRoomObjects();

    // Draw room background
    const bg = this.add.rectangle(cx, cy, 500, 300, layout.color, 0.6);
    bg.setStrokeStyle(2, 0x0f3460);
    bg.setDepth(0);

    // Draw affordances
    for (const aff of currentRoom.affordances) {
      const pos = layout.affordancePositions[aff.id] ?? { x: 0, y: 0 };
      const ax = cx + pos.x;
      const ay = cy + pos.y;

      const isLit = aff.id === "fireplace" && aff.state.lit === true;
      const color = isLit ? 0xff6600 : 0x444466;

      const rect = this.add.rectangle(ax, ay, AFFORDANCE_SIZE, AFFORDANCE_SIZE, color);
      rect.setStrokeStyle(1, 0x888888);
      rect.setDepth(5);

      const label = this.add.text(ax, ay + AFFORDANCE_SIZE / 2 + 4, aff.name, {
        fontSize: "10px",
        fontFamily: "Georgia, serif",
        color: "#aaa",
      }).setOrigin(0.5, 0).setDepth(5);

      this.affordanceSprites.set(aff.id, { rect, label });
    }

    // Draw doors
    for (const connId of currentRoom.connectedTo) {
      const pos = layout.doorPositions[connId] ?? { x: 0, y: 0 };
      const dx = cx + pos.x;
      const dy = cy + pos.y;

      const connRoom = this.placeState!.rooms.find((r) => r.id === connId);
      const doorLabel = connRoom ? `→ ${connRoom.name}` : `→ ${connId}`;

      const rect = this.add.rectangle(dx, dy, DOOR_SIZE, DOOR_SIZE, 0x0f3460, 0.8);
      rect.setStrokeStyle(1, 0x3a7ca5);
      rect.setDepth(5);

      const label = this.add.text(dx, dy + DOOR_SIZE / 2 + 4, doorLabel, {
        fontSize: "10px",
        fontFamily: "Georgia, serif",
        color: "#3a7ca5",
      }).setOrigin(0.5, 0).setDepth(5);

      this.doorSprites.set(connId, { rect, label });
    }

    // Reset player position
    this.playerSprite.setPosition(cx, cy + 40);
    this.playerNameText.setPosition(cx, cy + 40 + PLAYER_RADIUS + 4);

    // Other guests in this room
    this.clearOtherGuests();
    for (const guest of currentRoom.guests) {
      if (guest.id !== this.guestId) {
        this.addOtherGuest(guest.id, guest.name);
      }
    }

    // Resident
    this.updateResidentVisibility();
  }

  private updateResidentVisibility(): void {
    if (!this.placeState) return;

    const residentInRoom = this.placeState.residentRoom === this.placeState.currentRoom;
    this.residentSprite.setVisible(residentInRoom);
    this.residentNameText.setVisible(residentInRoom);

    if (residentInRoom) {
      const cx = this.cameras.main.centerX;
      const cy = this.cameras.main.centerY;
      this.residentSprite.setPosition(cx - 60, cy - 30);
      this.residentNameText.setPosition(cx - 60, cy - 30 + RESIDENT_RADIUS + 4);
    }
  }

  private clearRoomObjects(): void {
    for (const { rect, label } of this.affordanceSprites.values()) {
      rect.destroy();
      label.destroy();
    }
    this.affordanceSprites.clear();

    for (const { rect, label } of this.doorSprites.values()) {
      rect.destroy();
      label.destroy();
    }
    this.doorSprites.clear();
  }

  private addOtherGuest(id: string, name: string): void {
    if (this.otherGuests.has(id)) return;

    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const ox = cx + 60 + this.otherGuests.size * 40;
    const oy = cy + 30;

    const sprite = this.add.circle(ox, oy, PLAYER_RADIUS - 2, 0xa8d8ea);
    sprite.setDepth(10);

    const nameText = this.add.text(ox, oy + PLAYER_RADIUS + 2, name, {
      fontSize: "10px",
      fontFamily: "Georgia, serif",
      color: "#a8d8ea",
    }).setOrigin(0.5, 0).setDepth(10);

    this.otherGuests.set(id, { sprite, nameText });
  }

  private removeOtherGuest(id: string): void {
    const guest = this.otherGuests.get(id);
    if (guest) {
      guest.sprite.destroy();
      guest.nameText.destroy();
      this.otherGuests.delete(id);
    }
  }

  private clearOtherGuests(): void {
    for (const { sprite, nameText } of this.otherGuests.values()) {
      sprite.destroy();
      nameText.destroy();
    }
    this.otherGuests.clear();
  }

  private checkDoorProximity(): void {
    this.nearDoor = null;
    const threshold = 40;

    for (const [roomId, { rect }] of this.doorSprites) {
      const dist = Phaser.Math.Distance.Between(
        this.playerSprite.x, this.playerSprite.y,
        rect.x, rect.y,
      );
      if (dist < threshold) {
        this.nearDoor = roomId;
        break;
      }
    }

    if (this.nearDoor && !this.nearAffordance) {
      this.interactHint.style.display = "block";
      this.interactHint.textContent = "Press E to enter";
    } else if (!this.nearAffordance) {
      this.interactHint.style.display = "none";
    }
  }

  private checkAffordanceProximity(): void {
    this.nearAffordance = null;
    const threshold = 40;

    for (const [affId, { rect }] of this.affordanceSprites) {
      const dist = Phaser.Math.Distance.Between(
        this.playerSprite.x, this.playerSprite.y,
        rect.x, rect.y,
      );
      if (dist < threshold) {
        this.nearAffordance = affId;
        break;
      }
    }

    if (this.nearAffordance) {
      this.interactHint.style.display = "block";
      this.interactHint.textContent = "Press E to interact";
    } else if (!this.nearDoor) {
      this.interactHint.style.display = "none";
    }
  }

  private showAffordanceMenu(affordanceId: string): void {
    if (!this.placeState || !this.placeState.currentRoom) return;

    const room = this.placeState.rooms.find((r) => r.id === this.placeState!.currentRoom);
    if (!room) return;

    const aff = room.affordances.find((a) => a.id === affordanceId);
    if (!aff) return;

    const options = aff.actions.map((action) => ({
      affordanceId: aff.id,
      affordanceName: aff.name,
      actionId: action.id,
      actionName: action.name,
      available: action.available,
    }));

    this.interactMenu.show(options);
  }
}
