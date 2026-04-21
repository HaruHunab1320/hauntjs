/**
 * A top-down spectator map of The Vault — all 6 rooms visible at once.
 * Characters are colored dots. Rooms are rectangles with labels.
 * No tileset needed — pure procedural graphics.
 */

// Room layout — positions relative to canvas center
interface RoomLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  nightColor: number;
  label: string;
}

const ROOM_LAYOUTS: Record<string, RoomLayout> = {
  foyer: { x: 0, y: -180, w: 160, h: 100, color: 0x2a1a0e, nightColor: 0x15100a, label: "Foyer" },
  gallery: { x: -200, y: -40, w: 160, h: 120, color: 0x1a2636, nightColor: 0x0d1520, label: "Gallery" },
  library: { x: 200, y: -40, w: 160, h: 120, color: 0x2d1b0e, nightColor: 0x180e06, label: "Library" },
  conservatory: { x: -200, y: 140, w: 160, h: 100, color: 0x1a2e1a, nightColor: 0x0d180d, label: "Conservatory" },
  archive: { x: 200, y: 140, w: 140, h: 100, color: 0x1e1e2e, nightColor: 0x0f0f18, label: "Archive" },
  "hidden-room": { x: 200, y: 280, w: 120, h: 80, color: 0x0a0a0a, nightColor: 0x050505, label: "Hidden Room" },
};

// Connections between rooms (for drawing lines)
const CONNECTIONS = [
  ["foyer", "gallery"],
  ["foyer", "library"],
  ["gallery", "conservatory"],
  ["library", "archive"],
  // archive ↔ hidden-room only at night (drawn conditionally)
];

// Character colors
const CHAR_COLORS: Record<string, number> = {
  poe: 0xe4a672,
  "guest-kovacs": 0x64b5f6,
  "guest-raven": 0xef5350,
  "guest-lira": 0x81c784,
  "guest-marsh": 0xffb74d,
};

const CHAR_RADIUS = 8;

interface CharacterState {
  id: string;
  name: string;
  room: string | null;
}

export class VaultMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private characters: Map<string, CharacterState> = new Map();
  private phase: string = "dawn";
  private hiddenRoomOpen = false;
  private sensorStates: Map<string, boolean> = new Map();
  private cx = 0;
  private cy = 0;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;

    this.resize();
    window.addEventListener("resize", () => this.resize());

    // Start render loop
    this.render();
  }

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.cx = rect.width / 2;
    this.cy = rect.height / 2;
  }

  updatePhase(phase: string): void {
    this.phase = phase;
    this.hiddenRoomOpen = phase === "night" || phase === "dusk";
  }

  updateCharacter(id: string, name: string, room: string | null): void {
    this.characters.set(id, { id, name, room });
  }

  updateSensors(sensors: Array<{ id: string; enabled: boolean }>): void {
    for (const s of sensors) {
      this.sensorStates.set(s.id, s.enabled);
    }
  }

  private render = (): void => {
    const { ctx, cx, cy, canvas } = this;

    // Clear
    const isNight = this.phase === "night" || this.phase === "dusk";
    ctx.fillStyle = isNight ? "#050510" : "#0a0a14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw connections
    ctx.strokeStyle = isNight ? "#0f0f20" : "#1a1a2e";
    ctx.lineWidth = 2;
    for (const [a, b] of CONNECTIONS) {
      const ra = ROOM_LAYOUTS[a];
      const rb = ROOM_LAYOUTS[b];
      if (ra && rb) {
        ctx.beginPath();
        ctx.moveTo(cx + ra.x, cy + ra.y);
        ctx.lineTo(cx + rb.x, cy + rb.y);
        ctx.stroke();
      }
    }

    // Hidden room connection (only at night)
    if (this.hiddenRoomOpen) {
      const archive = ROOM_LAYOUTS.archive;
      const hidden = ROOM_LAYOUTS["hidden-room"];
      ctx.strokeStyle = "#2a1040";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx + archive.x, cy + archive.y);
      ctx.lineTo(cx + hidden.x, cy + hidden.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw rooms
    for (const [roomId, layout] of Object.entries(ROOM_LAYOUTS)) {
      // Skip hidden room during day
      if (roomId === "hidden-room" && !this.hiddenRoomOpen) continue;

      const x = cx + layout.x - layout.w / 2;
      const y = cy + layout.y - layout.h / 2;

      // Room fill
      const color = isNight ? layout.nightColor : layout.color;
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.fillRect(x, y, layout.w, layout.h);

      // Room border
      ctx.strokeStyle = roomId === "hidden-room" ? "#2a1040" : "#1a1a2e";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, layout.w, layout.h);

      // Room label
      ctx.fillStyle = "#555";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(layout.label, cx + layout.x, cy + layout.y - layout.h / 2 + 14);

      // Sensor indicator (small dot in corner)
      // Check if any room-scoped sensor is disabled
      const roomSensorIds = Array.from(this.sensorStates.keys()).filter(
        (id) => id.startsWith(roomId.split("-")[0]),
      );
      const hasDisabledSensor = roomSensorIds.some((id) => !this.sensorStates.get(id));
      if (hasDisabledSensor) {
        ctx.fillStyle = "#f44336";
        ctx.beginPath();
        ctx.arc(x + layout.w - 8, y + 8, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw characters
    for (const char of this.characters.values()) {
      if (!char.room) continue;
      const layout = ROOM_LAYOUTS[char.room];
      if (!layout) continue;

      const color = CHAR_COLORS[char.id] ?? 0xcccccc;

      // Position within room (jitter based on character index for spacing)
      const chars = Array.from(this.characters.values()).filter((c) => c.room === char.room);
      const idx = chars.indexOf(char);
      const offsetX = (idx - chars.length / 2) * 20;

      const charX = cx + layout.x + offsetX;
      const charY = cy + layout.y + 10;

      // Draw circle
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.beginPath();
      ctx.arc(charX, charY, CHAR_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Draw name
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(char.name, charX, charY + CHAR_RADIUS + 12);
    }

    requestAnimationFrame(this.render);
  };
}
