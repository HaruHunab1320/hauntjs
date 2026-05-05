import { ResidencyMap } from "./scenes/residency-map.js";

const WS_URL = `ws://${window.location.hostname}:4004`;

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
    practices?: Array<{ id: string; name: string; depth: number; active: boolean }>;
  };
  guests: Array<{
    id: string;
    name: string;
    currentRoom: string | null;
    goal?: string;
    felt?: string | null;
    lastAction?: string | null;
    drives?: Array<{ id: string; name: string; level: number; pressure: number }>;
    practices?: Array<{ id: string; name: string; depth: number; active: boolean }>;
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
const homeOrientation = document.getElementById("home-orientation")!;
const homeFelt = document.getElementById("home-felt")!;
const homeDrives = document.getElementById("home-drives")!;
const homePractices = document.getElementById("home-practices")!;
const homeAction = document.getElementById("home-action")!;
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

  // Home
  homeOrientation.textContent = `Orientation: ${data.resident.orientation ?? "—"}`;
  homeFelt.textContent = data.resident.felt ?? "...";
  if (data.resident.lastAction) {
    homeAction.textContent = `Last action: ${data.resident.lastAction}`;
  }

  // Home drives (if available from metabolize)
  if (data.resident.drives && data.resident.drives.length > 0) {
    homeDrives.innerHTML = data.resident.drives
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

  // Home practices
  if (data.resident.practices && data.resident.practices.length > 0) {
    homePractices.innerHTML = data.resident.practices
      .map((p) => {
        const pct = Math.round(p.depth * 100);
        return `<div class="practice-row">
          <span class="practice-dot ${p.active ? "practice-active" : "practice-dormant"}"></span>
          <span class="practice-label">${p.name}</span>
          <div class="practice-track"><div class="practice-fill" style="width: ${pct}%"></div></div>
          <span style="width:28px;text-align:right;color:#555;font-size:10px">${pct}%</span>
        </div>`;
      })
      .join("");
  }

  // Guests
  const guestColorMap: Record<string, string> = {
    sable: "guest-sable",
    oren: "guest-oren",
    kit: "guest-kit",
    rho: "guest-rho",
  };

  for (const g of data.guests) {
    const name = g.name.toLowerCase();
    const cls = guestColorMap[name] ?? "";

    let card = document.getElementById(`guest-card-${name}`);
    if (!card) {
      // Create card with embedded mini-stream (no trust bar)
      card = document.createElement("div");
      card.id = `guest-card-${name}`;
      card.className = `guest-card ${cls}`;
      card.innerHTML = `
        <div class="guest-name">${g.name}</div>
        <div class="guest-meta" data-field="room">Room: —</div>
        <div data-field="guest-drives" style="margin-top:4px;"></div>
        <div data-field="guest-practices" style="margin-top:2px;"></div>
        <div data-field="mini-stream" style="max-height:80px;overflow-y:auto;margin-top:6px;font-size:10px;color:#888;border-top:1px solid #1a1a2e;padding-top:4px;"></div>
      `;
      guestCards.appendChild(card);
    }

    // Update fields
    const roomEl = card.querySelector('[data-field="room"]') as HTMLElement;
    roomEl.textContent = `Room: ${g.currentRoom ? prettifyRoom(g.currentRoom) : "—"}`;

    // Guest drives
    const drivesEl = card.querySelector('[data-field="guest-drives"]') as HTMLElement;
    if (g.drives && g.drives.length > 0) {
      drivesEl.innerHTML = g.drives
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

    // Guest practices
    const practicesEl = card.querySelector('[data-field="guest-practices"]') as HTMLElement;
    if (g.practices && g.practices.length > 0) {
      practicesEl.innerHTML = g.practices
        .map((p) => {
          const pct = Math.round(p.depth * 100);
          return `<div class="practice-row">
            <span class="practice-dot ${p.active ? "practice-active" : "practice-dormant"}"></span>
            <span class="practice-label">${p.name}</span>
            <div class="practice-track"><div class="practice-fill" style="width: ${pct}%"></div></div>
            <span style="width:28px;text-align:right;color:#555;font-size:10px">${pct}%</span>
          </div>`;
        })
        .join("");
    }
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
    stream = "home";
    detail = `<strong>Home</strong>: "${msg.text as string}"`;
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
    stream = "home";
    detail = `⚡ Home: ${msg.affordanceId} → ${msg.actionId}`;
    cls = "log-action";
  } else if (type === "resident.moved") {
    stream = "home";
    detail = `↳ Home shifts attention to ${prettifyRoom(msg.to as string)}`;
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

/** Push an entry to a character's mini-stream (in their card or Home section). */
function pushToMiniStream(stream: string, time: string, detail: string): void {
  let container: HTMLElement | null = null;

  if (stream === "home") {
    container = document.getElementById("home-mini-stream");
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
    garden: "the Garden",
    kitchen: "the Kitchen",
    "living-room": "the Living Room",
    hallway: "the Hallway",
    "bedroom-1": "Bedroom 1",
    "bedroom-2": "Bedroom 2",
    "bedroom-3": "Bedroom 3",
    bathroom: "the Bathroom",
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
let lastHomeFelt = "";

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
const residencyMap = new ResidencyMap(document.getElementById("world-panel")!);

// Wire telemetry to map
const originalUpdateTelemetry = updateTelemetry;
const wrappedUpdateTelemetry = (data: TelemetryData): void => {
  originalUpdateTelemetry(data);

  // Log Home's inner state changes
  if (data.resident.felt && data.resident.felt !== lastHomeFelt) {
    lastHomeFelt = data.resident.felt;
    logInnerThought("Home", data.resident.felt, "log-thought");
  }

  // Update map phase
  residencyMap.updatePhase(data.time.phase);

  // Update map characters
  residencyMap.updateCharacter("home", "Home", data.resident.focusRoom ?? "hallway");
  for (const guest of data.guests) {
    residencyMap.updateCharacter(guest.id, prettifyName(guest.name), guest.currentRoom);
  }

  // Update map sensors
  residencyMap.updateSensors(data.sensors);
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
