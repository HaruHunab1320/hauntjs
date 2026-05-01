/**
 * Spectator map of The Vault — room background images with animated character sprites.
 */

interface RoomLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  image: string;
  label: string;
}

const ROOM_LAYOUTS: Record<string, RoomLayout> = {
  foyer: { x: 0, y: -200, w: 180, h: 180, image: "Foyer.png", label: "Foyer" },
  gallery: { x: -220, y: -20, w: 180, h: 160, image: "Gallery.png", label: "Gallery" },
  library: { x: 220, y: -20, w: 180, h: 160, image: "Library.png", label: "Library" },
  conservatory: { x: -220, y: 180, w: 180, h: 180, image: "Conservatory.png", label: "Conservatory" },
  archive: { x: 220, y: 180, w: 160, h: 140, image: "Archive.png", label: "Archive" },
  "hidden-room": { x: 220, y: 360, w: 130, h: 130, image: "Hidden.png", label: "Hidden Room" },
};

const CONNECTIONS = [
  ["foyer", "gallery"],
  ["foyer", "library"],
  ["gallery", "conservatory"],
  ["library", "archive"],
];

const CHAR_COLORS: Record<string, string> = {
  poe: "#e4a672",
  "guest-kovacs": "#64b5f6",
  "guest-raven": "#ef5350",
  "guest-lira": "#81c784",
  "guest-marsh": "#ffb74d",
};

const CHAR_LABELS: Record<string, string> = {
  poe: "Poe",
  "guest-kovacs": "Kovacs",
  "guest-raven": "Raven",
  "guest-lira": "Lira",
  "guest-marsh": "Marsh",
};

const CHAR_RADIUS = 10;

interface CharacterState {
  id: string;
  name: string;
  room: string | null;
  // Smooth animation
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
}

export class VaultMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private characters = new Map<string, CharacterState>();
  private phase = "dawn";
  private hiddenRoomOpen = false;
  private sensorStates = new Map<string, boolean>();
  private cx = 0;
  private cy = 0;
  private roomImages = new Map<string, HTMLImageElement>();
  private imagesLoaded = false;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());

    // Load room images
    this.loadImages();

    // Start render loop
    this.render();
  }

  private loadImages(): void {
    let loaded = 0;
    const total = Object.keys(ROOM_LAYOUTS).length;

    for (const [roomId, layout] of Object.entries(ROOM_LAYOUTS)) {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded >= total) this.imagesLoaded = true;
      };
      img.onerror = () => {
        loaded++;
        if (loaded >= total) this.imagesLoaded = true;
      };
      img.src = `./assets/${layout.image}`;
      this.roomImages.set(roomId, img);
    }
  }

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.cx = rect.width / 2;
    this.cy = rect.height / 2 - 40; // Shift up a bit to center the layout
  }

  updatePhase(phase: string): void {
    this.phase = phase;
    this.hiddenRoomOpen = phase === "night" || phase === "dusk";
  }

  updateCharacter(id: string, name: string, room: string | null): void {
    let char = this.characters.get(id);
    if (!char) {
      char = { id, name, room: null, currentX: 0, currentY: 0, targetX: 0, targetY: 0 };
      this.characters.set(id, char);
    }

    char.name = name;

    if (room !== char.room) {
      char.room = room;
      if (room) {
        const layout = ROOM_LAYOUTS[room];
        if (layout) {
          // Compute position within room (jitter for spacing)
          const chars = Array.from(this.characters.values()).filter((c) => c.room === room);
          const idx = chars.indexOf(char);
          const offsetX = (idx - (chars.length - 1) / 2) * 22;

          char.targetX = this.cx + layout.x + offsetX;
          char.targetY = this.cy + layout.y + 15;

          // If this is the first placement, snap immediately
          if (char.currentX === 0 && char.currentY === 0) {
            char.currentX = char.targetX;
            char.currentY = char.targetY;
          }
        }
      }
    }
  }

  updateSensors(sensors: Array<{ id: string; enabled: boolean }>): void {
    for (const s of sensors) {
      this.sensorStates.set(s.id, s.enabled);
    }
  }

  private render = (): void => {
    const { ctx, cx, cy, canvas } = this;
    const isNight = this.phase === "night" || this.phase === "dusk";

    // Clear
    ctx.fillStyle = isNight ? "#030308" : "#080810";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw connections
    ctx.strokeStyle = isNight ? "#0a0a18" : "#151525";
    ctx.lineWidth = 3;
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

    // Hidden room connection (night only)
    if (this.hiddenRoomOpen) {
      const archive = ROOM_LAYOUTS.archive;
      const hidden = ROOM_LAYOUTS["hidden-room"];
      ctx.strokeStyle = "#1a0830";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx + archive.x, cy + archive.y);
      ctx.lineTo(cx + hidden.x, cy + hidden.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw rooms
    for (const [roomId, layout] of Object.entries(ROOM_LAYOUTS)) {
      if (roomId === "hidden-room" && !this.hiddenRoomOpen) continue;

      const x = cx + layout.x - layout.w / 2;
      const y = cy + layout.y - layout.h / 2;

      // Draw room image or fallback
      const img = this.roomImages.get(roomId);
      if (img && img.complete && img.naturalWidth > 0) {
        // Night overlay
        if (isNight) {
          ctx.globalAlpha = 0.5;
        }
        ctx.drawImage(img, x, y, layout.w, layout.h);
        ctx.globalAlpha = 1;

        if (isNight) {
          ctx.fillStyle = "rgba(0, 0, 20, 0.4)";
          ctx.fillRect(x, y, layout.w, layout.h);
        }
      } else {
        // Fallback colored rectangle
        ctx.fillStyle = isNight ? "#0a0a14" : "#151520";
        ctx.fillRect(x, y, layout.w, layout.h);
      }

      // Room border
      const hasDisabledSensor = Array.from(this.sensorStates.entries())
        .filter(([id]) => id.startsWith(roomId.split("-")[0]))
        .some(([, enabled]) => !enabled);

      ctx.strokeStyle = hasDisabledSensor ? "#331010" : (roomId === "hidden-room" ? "#1a0830" : "#1a1a2e");
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, layout.w, layout.h);

      // Room label
      ctx.fillStyle = isNight ? "#333" : "#555";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(layout.label, cx + layout.x, y - 4);
    }

    // Animate and draw characters
    for (const char of this.characters.values()) {
      if (!char.room) continue;

      // Smooth interpolation toward target
      const lerpSpeed = 0.08;
      char.currentX += (char.targetX - char.currentX) * lerpSpeed;
      char.currentY += (char.targetY - char.currentY) * lerpSpeed;

      const color = CHAR_COLORS[char.id] ?? "#cccccc";
      const label = CHAR_LABELS[char.id] ?? char.name;

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(char.currentX, char.currentY + CHAR_RADIUS + 2, CHAR_RADIUS * 0.8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Character circle with glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(char.currentX, char.currentY, CHAR_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner highlight
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(char.currentX - 2, char.currentY - 3, CHAR_RADIUS * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Name label
      ctx.fillStyle = color;
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, char.currentX, char.currentY + CHAR_RADIUS + 14);
    }

    requestAnimationFrame(this.render);
  };
}
