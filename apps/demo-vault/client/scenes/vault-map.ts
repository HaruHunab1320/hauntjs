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
  foyer: { x: 0, y: -380, w: 360, h: 340, image: "Foyer.png", label: "Foyer" },
  gallery: { x: -420, y: -20, w: 360, h: 320, image: "Gallery.png", label: "Gallery" },
  library: { x: 420, y: -20, w: 360, h: 320, image: "Library.png", label: "Library" },
  conservatory: { x: -420, y: 380, w: 360, h: 340, image: "Conservatory.png", label: "Conservatory" },
  archive: { x: 420, y: 380, w: 320, h: 280, image: "Archive.png", label: "Archive" },
  "hidden-room": { x: 420, y: 720, w: 260, h: 260, image: "Hidden.png", label: "Hidden Room" },
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

const CHAR_SPRITES: Record<string, string> = {
  poe: "Poe.png",
  "guest-kovacs": "Kovacs.png",
  "guest-raven": "Raven.png",
  "guest-lira": "Lira.png",
  "guest-marsh": "Marsh.png",
};

const CHAR_LABELS: Record<string, string> = {
  poe: "Poe",
  "guest-kovacs": "Kovacs",
  "guest-raven": "Raven",
  "guest-lira": "Lira",
  "guest-marsh": "Marsh",
};

const CHAR_RADIUS = 16;
const SPRITE_SIZE = 48; // rendered size for character sprites

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
  private charImages = new Map<string, HTMLImageElement>();
  private imagesLoaded = false;
  private scale = 1;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());

    // Mouse wheel zoom
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      this.scale = Math.min(2, Math.max(0.25, this.scale + delta));
    }, { passive: false });

    // Load room images
    this.loadImages();

    // Start render loop
    this.render();
  }

  private loadImages(): void {
    let loaded = 0;
    const totalRooms = Object.keys(ROOM_LAYOUTS).length;
    const totalChars = Object.keys(CHAR_SPRITES).length;
    const total = totalRooms + totalChars;

    const onLoad = () => {
      loaded++;
      if (loaded >= total) this.imagesLoaded = true;
    };

    for (const [roomId, layout] of Object.entries(ROOM_LAYOUTS)) {
      const img = new Image();
      img.onload = onLoad;
      img.onerror = onLoad;
      img.src = `./assets/${layout.image}`;
      this.roomImages.set(roomId, img);

    }

    for (const [charId, filename] of Object.entries(CHAR_SPRITES)) {
      const img = new Image();
      img.onload = onLoad;
      img.onerror = onLoad;
      img.src = `./assets/${filename}`;
      this.charImages.set(charId, img);
    }
  }

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    // cx/cy are the center of the world in world-space (before scale).
    // We'll apply the transform in render().
    this.cx = 0;
    this.cy = 0;

    // Compute fit-to-view scale based on the bounding box of all rooms
    this.fitToView(rect.width, rect.height);
  }

  private fitToView(viewW: number, viewH: number): void {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const layout of Object.values(ROOM_LAYOUTS)) {
      minX = Math.min(minX, layout.x - layout.w / 2);
      maxX = Math.max(maxX, layout.x + layout.w / 2);
      minY = Math.min(minY, layout.y - layout.h / 2 - 20); // label space
      maxY = Math.max(maxY, layout.y + layout.h / 2 + 30); // char labels
    }
    const worldW = maxX - minX + 60; // padding
    const worldH = maxY - minY + 60;
    this.scale = Math.min(viewW / worldW, viewH / worldH, 1);
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
        this.layoutCharactersInRoom(room);
      }
    }
  }

  /** Spread all characters in a room across the room area so they don't overlap. */
  private layoutCharactersInRoom(room: string): void {
    const layout = ROOM_LAYOUTS[room];
    if (!layout) return;

    const chars = Array.from(this.characters.values()).filter((c) => c.room === room);
    const count = chars.length;
    if (count === 0) return;

    // Usable area inside the room (inset from edges)
    const pad = SPRITE_SIZE + 8;
    const roomCx = this.cx + layout.x;
    const roomCy = this.cy + layout.y;

    // Predefined positions within the room for up to 6 characters.
    // Spread in a loose grid pattern so they never overlap.
    const slots: Array<[number, number]> = [];
    if (count === 1) {
      slots.push([0, 0]);
    } else if (count === 2) {
      slots.push([-0.25, 0], [0.25, 0]);
    } else if (count === 3) {
      slots.push([0, -0.2], [-0.25, 0.2], [0.25, 0.2]);
    } else if (count === 4) {
      slots.push([-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]);
    } else {
      // 5+: two rows
      const topCount = Math.ceil(count / 2);
      const botCount = count - topCount;
      for (let i = 0; i < topCount; i++) {
        const frac = topCount === 1 ? 0 : (i / (topCount - 1)) - 0.5;
        slots.push([frac * 0.5, -0.2]);
      }
      for (let i = 0; i < botCount; i++) {
        const frac = botCount === 1 ? 0 : (i / (botCount - 1)) - 0.5;
        slots.push([frac * 0.5, 0.2]);
      }
    }

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const [fx, fy] = slots[i];
      char.targetX = roomCx + fx * (layout.w - pad);
      char.targetY = roomCy + fy * (layout.h - pad);

      // Snap on first placement
      if (char.currentX === 0 && char.currentY === 0) {
        char.currentX = char.targetX;
        char.currentY = char.targetY;
      }
    }
  }

  updateSensors(sensors: Array<{ id: string; enabled: boolean }>): void {
    for (const s of sensors) {
      this.sensorStates.set(s.id, s.enabled);
    }
  }

  private render = (): void => {
    const { ctx, canvas } = this;
    const isNight = this.phase === "night" || this.phase === "dusk";

    // Clear (full canvas, before transform)
    ctx.fillStyle = isNight ? "#030308" : "#080810";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply zoom: translate to center of canvas, then scale
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(this.scale, this.scale);

    // In world space, cx=0, cy=0 is the origin
    const cx = 0;
    const cy = 0;

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
      ctx.font = "13px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(layout.label, cx + layout.x, y - 6);
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
      const charImg = this.charImages.get(char.id);

      // Shadow beneath character
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(char.currentX, char.currentY + SPRITE_SIZE / 2 + 2, SPRITE_SIZE * 0.35, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      if (charImg && charImg.complete && charImg.naturalWidth > 0) {
        // Draw sprite image
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.imageSmoothingEnabled = false; // keep pixel-art crisp
        ctx.drawImage(
          charImg,
          char.currentX - SPRITE_SIZE / 2,
          char.currentY - SPRITE_SIZE / 2,
          SPRITE_SIZE,
          SPRITE_SIZE,
        );
        ctx.imageSmoothingEnabled = true;
        ctx.shadowBlur = 0;
      } else {
        // Fallback: colored circle with glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(char.currentX, char.currentY, CHAR_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath();
        ctx.arc(char.currentX - 2, char.currentY - 3, CHAR_RADIUS * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Name label
      ctx.fillStyle = color;
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, char.currentX, char.currentY + SPRITE_SIZE / 2 + 16);
    }

    ctx.restore();
    requestAnimationFrame(this.render);
  };
}
