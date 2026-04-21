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

  guestCards.innerHTML = data.guests
    .map((g) => {
      const cls = guestColorMap[g.name.toLowerCase()] ?? "";
      const trustPct = Math.round((g.trustWithResident ?? 0) * 100);
      const trustCls =
        trustPct > 60 ? "drive-fill-high" : trustPct > 30 ? "drive-fill-mid" : "drive-fill-low";
      return `<div class="guest-card ${cls}">
        <div class="guest-name">${g.name}</div>
        <div class="guest-meta">Room: ${g.currentRoom ?? "—"}</div>
        ${g.felt ? `<div class="felt-text">${g.felt}</div>` : ""}
        <div class="trust-bar">
          <div class="drive-bar">
            <span class="drive-label">Trust</span>
            <div class="drive-track"><div class="drive-fill ${trustCls}" style="width: ${trustPct}%"></div></div>
            <span style="width:30px;text-align:right;color:#555;font-size:10px">${trustPct}%</span>
          </div>
        </div>
      </div>`;
    })
    .join("");

  // Sensors — group by room
  const roomSensors = new Map<string, typeof data.sensors>();
  for (const s of data.sensors) {
    if (!roomSensors.has(s.roomName)) roomSensors.set(s.roomName, []);
    roomSensors.get(s.roomName)!.push(s);
  }

  sensorGrid.innerHTML = Array.from(roomSensors.entries())
    .map(([roomName, sensors]) => {
      const sensorList = sensors
        .filter((s) => s.reach !== "place-wide") // Don't show global sensors
        .map((s) => `<span class="${s.enabled ? "sensor-on" : "sensor-off"}">${s.modality}</span>`)
        .join(" ");
      return `<div class="sensor-room"><strong>${roomName}</strong><br/>${sensorList || '<span class="sensor-off">none</span>'}</div>`;
    })
    .join("");
}

// --- Event log ---

function addLogEntry(msg: Record<string, unknown>): void {
  const type = msg.type as string;
  const now = new Date().toLocaleTimeString();

  let detail = "";
  let cls = "log-event";

  if (type === "guest.spoke") {
    detail = `${msg.guestName}: "${(msg.text as string).slice(0, 60)}"`;
    cls = "log-guest-speech";
  } else if (type === "resident.spoke") {
    detail = `Poe: "${(msg.text as string).slice(0, 60)}"`;
    cls = "log-speech";
  } else if (type === "guest.entered") {
    detail = `${msg.guestName} enters ${msg.roomId}`;
  } else if (type === "guest.moved") {
    detail = `${msg.guestName}: ${msg.from} → ${msg.to}`;
  } else if (type === "guest.left") {
    detail = `${msg.guestName} left`;
  } else if (type === "time.phaseChanged") {
    detail = `${msg.from} → ${msg.to}`;
    cls = "log-event";
  } else if (type === "resident.acted") {
    detail = `Poe: ${msg.affordanceId}:${msg.actionId}`;
    cls = "log-speech";
  } else if (type === "tick") {
    return; // Don't log ticks
  } else {
    detail = type;
  }

  const entry = document.createElement("div");
  entry.className = `log-entry ${cls}`;
  entry.innerHTML = `<span class="log-time">${now}</span> ${detail}`;
  eventLog.prepend(entry);

  // Keep log manageable
  while (eventLog.children.length > 100) {
    eventLog.removeChild(eventLog.lastChild!);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Map ---
const vaultMap = new VaultMap(document.getElementById("world-panel")!);

// Wire telemetry to map
const originalUpdateTelemetry = updateTelemetry;
const wrappedUpdateTelemetry = (data: TelemetryData): void => {
  originalUpdateTelemetry(data);

  // Update map phase
  vaultMap.updatePhase(data.time.phase);

  // Update map characters
  vaultMap.updateCharacter("poe", "Poe", data.resident.focusRoom);
  for (const guest of data.guests) {
    vaultMap.updateCharacter(guest.id, guest.name, guest.currentRoom);
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

  // Update map from individual events too
  if (type === "guest.entered" || type === "guest.moved") {
    const guestId = msg.guestId as string;
    const room = (type === "guest.moved" ? msg.to : msg.roomId) as string;
    const name = (msg.guestName as string) ?? guestId;
    vaultMap.updateCharacter(guestId, name, room);
  }
  if (type === "guest.left") {
    vaultMap.updateCharacter(msg.guestId as string, (msg.guestName as string) ?? "", null);
  }
}

// Replace the original handler
handleMessage = handleMessageWithMap;

// --- Boot ---
connect();
