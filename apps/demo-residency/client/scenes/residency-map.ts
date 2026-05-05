/**
 * Spectator map of The Residency — room background images with animated character sprites.
 * House-like layout: garden + kitchen up top, living room + hallway in middle,
 * bedrooms + bathroom along the bottom.
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
  // Top row
  garden: { x: -280, y: -380, w: 320, h: 300, image: "Garden.png", label: "Garden" },
  kitchen: { x: 120, y: -380, w: 320, h: 300, image: "Kitchen.png", label: "Kitchen" },
  // Middle row
  "living-room": { x: -200, y: -20, w: 340, h: 300, image: "LivingRoom.png", label: "Living Room" },
  hallway: { x: 200, y: -20, w: 280, h: 300, image: "Hallway.png", label: "Hallway" },
  // Bottom row
  "bedroom-1": { x: -400, y: 380, w: 280, h: 280, image: "Bedroom1.png", label: "Bedroom 1" },
  "bedroom-2": { x: -80, y: 380, w: 280, h: 280, image: "Bedroom2.png", label: "Bedroom 2" },
  "bedroom-3": { x: 240, y: 380, w: 280, h: 280, image: "Bedroom3.png", label: "Bedroom 3" },
  bathroom: { x: 560, y: 380, w: 240, h: 240, image: "Bathroom.png", label: "Bathroom" },
};

const CONNECTIONS = [
  ["garden", "kitchen"],
  ["garden", "living-room"],
  ["kitchen", "hallway"],
  ["living-room", "hallway"],
  ["living-room", "bedroom-1"],
  ["hallway", "bedroom-2"],
  ["hallway", "bedroom-3"],
  ["hallway", "bathroom"],
];

const CHAR_COLORS: Record<string, string> = {
  home: "#c9a86c",
  "guest-sable": "#b39ddb",
  "guest-oren": "#ff8a65",
  "guest-kit": "#4dd0e1",
  "guest-rho": "#aed581",
};

const CHAR_SPRITES: Record<string, string> = {
  home: "Home.png",
  "guest-sable": "Sable.png",
  "guest-oren": "Oren.png",
  "guest-kit": "Kit.png",
  "guest-rho": "Rho.png",
};

const CHAR_LABELS: Record<string, string> = {
  home: "Home",
  "guest-sable": "Sable",
  "guest-oren": "Oren",
  "guest-kit": "Kit",
  "guest-rho": "Rho",
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

export class ResidencyMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private characters = new Map<string, CharacterState>();
  private phase = "dawn";
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

    // Clear
    ctx.fillStyle = isNight ? "#030308" : "#080810";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply zoom
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(this.scale, this.scale);

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

    // Draw rooms
    for (const [roomId, layout] of Object.entries(ROOM_LAYOUTS)) {
      const x = cx + layout.x - layout.w / 2;
      const y = cy + layout.y - layout.h / 2;

      // Draw room image or fallback
      const img = this.roomImages.get(roomId);
      if (img && img.complete && img.naturalWidth > 0) {
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

      ctx.strokeStyle = hasDisabledSensor ? "#331010" : "#1a1a2e";
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
