import { VaultMap } from "./scenes/vault-map.js";

const WS_URL = `ws://${window.location.hostname}:4002`;

interface TelemetryData {
  time: { phase: string; inWorldHour: number; day: number };
  resident: {
    id: string;
    name: string;
    focusRoom: string | null;
    orientation: string | null;
    felt: string | null;
    lastAction: string | null;
    drives?: Array<{ id: string; name: string; level: number; pressure: number }>;
  };
  guests: Array<{
    id: string;
    name: string;
    currentRoom: string | null;
    goal?: string;
    felt?: string | null;
    lastAction?: string | null;
    trustWithResident?: number;
  }>;
  sensors: Array<{
    id: string;
    roomId: string;
    roomName: string;
    modality: string;
    name: string;
    enabled: boolean;
    fidelity: string;
    reach: string;
  }>;
}

// --- DOM refs ---
const connectionStatus = document.getElementById("connection-status")!;
const timePhase = document.getElementById("time-phase")!;
const timeDetail = document.getElementById("time-detail")!;
const poeOrientation = document.getElementById("poe-orientation")!;
const poeFelt = document.getElementById("poe-felt")!;
const poeDrives = document.getElementById("poe-drives")!;
const poeAction = document.getElementById("poe-action")!;
const guestCards = document.getElementById("guest-cards")!;
const sensorGrid = document.getElementById("sensor-grid")!;
const eventLog = document.getElementById("event-log")!;

// --- WebSocket ---
let ws: WebSocket | null = null;

function connect(): void {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    connectionStatus.textContent = "connected";
    connectionStatus.className = "connected";
    // Register as spectator
    ws!.send(JSON.stringify({ type: "spectate" }));
  };

  ws.onclose = () => {
    connectionStatus.textContent = "disconnected";
    connectionStatus.className = "disconnected";
    setTimeout(connect, 3000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch {
      // ignore parse errors
    }
  };
}

let handleMessage = (msg: Record<string, unknown>): void => {
  const type = msg.type as string;

  if (type === "telemetry") {
    updateTelemetry(msg.data as TelemetryData);
  }

  // Log events
  if (type.includes(".") || type === "tick") {
    addLogEntry(msg);
  }
}

// --- Telemetry updates ---

function updateTelemetry(data: TelemetryData): void {
  // Time
  timePhase.textContent = capitalize(data.time.phase);
  timePhase.className = `phase-${data.time.phase}`;
  timeDetail.textContent = `Day ${data.time.day} — Hour ${data.time.inWorldHour}:00`;

  // Poe
  poeOrientation.textContent = `Orientation: ${data.resident.orientation ?? "—"}`;
  poeFelt.textContent = data.resident.felt ?? "...";
  if (data.resident.lastAction) {
    poeAction.textContent = `Last action: ${data.resident.lastAction}`;
  }

  // Poe drives (if available from metabolize)
  if (data.resident.drives && data.resident.drives.length > 0) {
    poeDrives.innerHTML = data.resident.drives
      .map((d) => {
        const pct = Math.round(d.level * 100);
        const cls = pct > 60 ? "drive-fill-high" : pct > 30 ? "drive-fill-mid" : "drive-fill-low";
        return `<div class="drive-bar">
          <span class="drive-label">${d.name}</span>
          <div class="drive-track"><div class="drive-fill ${cls}" style="width: ${pct}%"></div></div>
          <span style="width:30px;text-align:right;color:#555;font-size:10px">${pct}%</span>
        </div>`;
      })
      .join("");
  }

  // Guests
  const guestColorMap: Record<string, string> = {
    kovacs: "guest-kovacs",
    raven: "guest-raven",
    lira: "guest-lira",
    marsh: "guest-marsh",
  };

  for (const g of data.guests) {
    const name = g.name.toLowerCase();
    const cls = guestColorMap[name] ?? "";
    const trustPct = Math.round((g.trustWithResident ?? 0) * 100);
    const trustCls =
      trustPct > 60 ? "drive-fill-high" : trustPct > 30 ? "drive-fill-mid" : "drive-fill-low";

    let card = document.getElementById(`guest-card-${name}`);
    if (!card) {
      // Create card with embedded mini-stream
      card = document.createElement("div");
      card.id = `guest-card-${name}`;
      card.className = `guest-card ${cls}`;
      card.innerHTML = `
        <div class="guest-name">${g.name}</div>
        <div class="guest-meta" data-field="room">Room: —</div>
        <div class="trust-bar">
          <div class="drive-bar">
            <span class="drive-label">Trust</span>
            <div class="drive-track"><div class="drive-fill" data-field="trust-fill" style="width: 0%"></div></div>
            <span data-field="trust-pct" style="width:30px;text-align:right;color:#555;font-size:10px">0%</span>
          </div>
        </div>
        <div data-field="mini-stream" style="max-height:80px;overflow-y:auto;margin-top:6px;font-size:10px;color:#888;border-top:1px solid #1a1a2e;padding-top:4px;"></div>
      `;
      guestCards.appendChild(card);
    }

    // Update fields
    const roomEl = card.querySelector('[data-field="room"]') as HTMLElement;
    roomEl.textContent = `Room: ${g.currentRoom ? prettifyRoom(g.currentRoom) : "—"}`;

    const trustFill = card.querySelector('[data-field="trust-fill"]') as HTMLElement;
    trustFill.style.width = `${trustPct}%`;
    trustFill.className = `drive-fill ${trustCls}`;

    const trustPctEl = card.querySelector('[data-field="trust-pct"]') as HTMLElement;
    trustPctEl.textContent = `${trustPct}%`;
  }

  // Sensors — group by room, show occupants and active state
  const roomSensors = new Map<string, typeof data.sensors>();
  for (const s of data.sensors) {
    if (!roomSensors.has(s.roomName)) roomSensors.set(s.roomName, []);
    roomSensors.get(s.roomName)!.push(s);
  }

  // Find which rooms have occupants
  const roomOccupants = new Map<string, string[]>();
  for (const g of data.guests) {
    if (g.currentRoom) {
      const roomName = prettifyRoom(g.currentRoom).replace("the ", "The ");
      if (!roomOccupants.has(roomName)) roomOccupants.set(roomName, []);
      roomOccupants.get(roomName)!.push(g.name);
    }
  }

  sensorGrid.innerHTML = Array.from(roomSensors.entries())
    .map(([roomName, sensors]) => {
      const occupants = roomOccupants.get(roomName) ?? [];
      const hasOccupants = occupants.length > 0;
      const localSensors = sensors.filter((s) => s.reach !== "place-wide");

      const sensorList = localSensors
        .map((s) => {
          const active = s.enabled && hasOccupants;
          const icon = s.modality === "sight" ? "👁" : s.modality === "sound" ? "🎙" : s.modality === "presence" ? "📡" : "📊";
          const cls = !s.enabled ? "sensor-off" : active ? "sensor-active" : "sensor-on";
          return `<span class="${cls}" title="${s.name}">${icon} ${s.modality}</span>`;
        })
        .join(" ");

      const occupantLine = hasOccupants
        ? `<div style="font-size:9px;color:#555;margin-top:2px">${occupants.join(", ")}</div>`
        : "";

      return `<div class="sensor-room ${hasOccupants ? "sensor-room-occupied" : ""}">
        <strong>${roomName}</strong>${occupantLine}
        <div style="margin-top:3px">${sensorList || '<span class="sensor-off">none</span>'}</div>
      </div>`;
    })
    .join("");
}

// --- Event log ---

function addLogEntry(msg: Record<string, unknown>): void {
  const type = msg.type as string;
  const now = new Date().toLocaleTimeString();

  let detail = "";
  let cls = "log-event";
  let stream = "all"; // which character stream this belongs to

  if (type === "guest.spoke") {
    const rawName = (msg.guestName as string) ?? (msg.guestId as string);
    const name = prettifyName(rawName);
    stream = name.toLowerCase();
    detail = `<strong>${name}</strong>: "${msg.text as string}"`;
    cls = "log-guest-speech";
  } else if (type === "resident.spoke") {
    stream = "poe";
    detail = `<strong>Poe</strong>: "${msg.text as string}"`;
    cls = "log-speech";
  } else if (type === "guest.entered") {
    const rawName = (msg.guestName as string) ?? (msg.guestId as string);
    const name = prettifyName(rawName);
    stream = name.toLowerCase();
    detail = `▸ <strong>${name}</strong> arrives in ${prettifyRoom(msg.roomId as string)}`;
    cls = "log-arrival";
  } else if (type === "guest.moved") {
    const rawName = (msg.guestName as string) ?? (msg.guestId as string);
    const name = prettifyName(rawName);
    stream = name.toLowerCase();
    detail = `↳ ${name} moves to ${prettifyRoom(msg.to as string)}`;
    cls = "log-event";
  } else if (type === "guest.left") {
    const rawName = (msg.guestName as string) ?? (msg.guestId as string);
    const name = prettifyName(rawName);
    stream = name.toLowerCase();
    detail = `◂ ${name} has left`;
    cls = "log-event";
  } else if (type === "time.phaseChanged") {
    detail = `⏱ Phase: ${capitalize(msg.from as string)} → <strong>${capitalize(msg.to as string)}</strong>`;
    cls = "log-phase";
  } else if (type === "resident.acted") {
    stream = "poe";
    detail = `⚡ Poe: ${msg.affordanceId} → ${msg.actionId}`;
    cls = "log-action";
  } else if (type === "resident.moved") {
    stream = "poe";
    detail = `↳ Poe shifts attention to ${prettifyRoom(msg.to as string)}`;
    cls = "log-action";
  } else if (type === "tick") {
    return;
  } else {
    detail = type;
  }

  const entry = document.createElement("div");
  entry.className = `log-entry ${cls}`;
  entry.dataset.stream = stream;
  entry.innerHTML = `<span class="log-time">${now}</span> ${detail}`;

  // Apply current filter
  if (activeStream !== "all" && stream !== activeStream) {
    entry.style.display = "none";
  }

  // Only auto-scroll if user is already at the top (not reading history)
  const wasAtTop = eventLog.scrollTop <= 10;
  eventLog.prepend(entry);
  if (wasAtTop) {
    eventLog.scrollTop = 0;
  }

  // Also push to the character's mini-stream in their guest card
  if (stream !== "all") {
    pushToMiniStream(stream, now, detail);
  }

  // Keep log manageable
  while (eventLog.children.length > 200) {
    eventLog.removeChild(eventLog.lastChild!);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Push an entry to a character's mini-stream (in their card or Poe section). */
function pushToMiniStream(stream: string, time: string, detail: string): void {
  let container: HTMLElement | null = null;

  if (stream === "poe") {
    container = document.getElementById("poe-mini-stream");
  } else {
    const card = document.getElementById(`guest-card-${stream}`);
    if (card) {
      container = card.querySelector('[data-field="mini-stream"]') as HTMLElement;
    }
  }

  if (!container) return;

  const el = document.createElement("div");
  el.style.borderBottom = "1px solid rgba(255,255,255,0.03)";
  el.style.padding = "1px 0";
  el.innerHTML = `<span style="color:#444">${time}</span> ${detail}`;
  container.prepend(el);

  // Keep manageable
  while (container.children.length > 30) {
    container.removeChild(container.lastChild!);
  }
}

function prettifyName(name: string): string {
  return capitalize(name.replace("guest-", ""));
}

function prettifyRoom(roomId: string): string {
  const names: Record<string, string> = {
    foyer: "the Foyer",
    gallery: "the Gallery",
    library: "the Library",
    conservatory: "the Conservatory",
    archive: "the Archive",
    "hidden-room": "the Hidden Room",
  };
  return names[roomId] ?? roomId;
}

// --- Copy stream button ---
const copyBtn = document.getElementById("copy-stream")!;
copyBtn.addEventListener("click", () => {
  const entries = Array.from(eventLog.children)
    .reverse()
    .map((el) => el.textContent ?? "")
    .join("\n");
  navigator.clipboard.writeText(entries).then(() => {
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("copied");
    }, 2000);
  });
});

// --- Stream tabs (filter the combined log) ---
let activeStream = "all";

document.getElementById("stream-tabs")!.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".stream-tab") as HTMLElement | null;
  if (!btn) return;

  const stream = btn.dataset.stream ?? "all";
  activeStream = stream;

  // Update active tab
  for (const tab of document.querySelectorAll(".stream-tab")) {
    tab.classList.toggle("active", (tab as HTMLElement).dataset.stream === stream);
  }

  // Show/hide entries
  for (const entry of eventLog.children) {
    const el = entry as HTMLElement;
    const entryStream = el.dataset.stream ?? "all";
    el.style.display = (stream === "all" || entryStream === stream) ? "" : "none";
  }
});

// Track last known felt string to detect changes
let lastPoeFelt = "";

function logInnerThought(name: string, felt: string, cls: string): void {
  const now = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry ${cls}`;
  entry.dataset.stream = name.toLowerCase();
  entry.innerHTML = `<span class="log-time">${now}</span> 💭 <em>${name}</em>: "${felt}"`;

  if (activeStream !== "all" && name.toLowerCase() !== activeStream) {
    entry.style.display = "none";
  }

  const wasAtTop = eventLog.scrollTop <= 10;
  eventLog.prepend(entry);
  if (wasAtTop) eventLog.scrollTop = 0;
}

// --- Map ---
const vaultMap = new VaultMap(document.getElementById("world-panel")!);

// Wire telemetry to map
const originalUpdateTelemetry = updateTelemetry;
const wrappedUpdateTelemetry = (data: TelemetryData): void => {
  originalUpdateTelemetry(data);

  // Log Poe's inner state changes
  if (data.resident.felt && data.resident.felt !== lastPoeFelt) {
    lastPoeFelt = data.resident.felt;
    logInnerThought("Poe", data.resident.felt, "log-thought");
  }

  // Update map phase
  vaultMap.updatePhase(data.time.phase);

  // Update map characters
  vaultMap.updateCharacter("poe", "Poe", data.resident.focusRoom);
  for (const guest of data.guests) {
    vaultMap.updateCharacter(guest.id, prettifyName(guest.name), guest.currentRoom);
  }

  // Update map sensors
  vaultMap.updateSensors(data.sensors);
};

// Override the telemetry handler
function handleMessageWithMap(msg: Record<string, unknown>): void {
  const type = msg.type as string;
  if (type === "telemetry") {
    wrappedUpdateTelemetry(msg.data as TelemetryData);
  }
  if (type.includes(".") || type === "tick") {
    addLogEntry(msg);
  }

  // Map positions are updated from telemetry only (authoritative source).
  // Individual events update the log but not the map to avoid race conditions.
}

// Replace the original handler
handleMessage = handleMessageWithMap;

// --- Boot ---
connect();
