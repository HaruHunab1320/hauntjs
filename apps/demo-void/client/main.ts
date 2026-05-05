const WS_URL = `ws://${window.location.hostname}:4006`;

const connectionStatus = document.getElementById("connection-status")!;
const timeBar = document.getElementById("time-bar")!;
const orientationEl = document.getElementById("orientation")!;
const feltEl = document.getElementById("felt")!;
const roomEl = document.getElementById("room")!;
const drivesEl = document.getElementById("drives")!;
const practicesEl = document.getElementById("practices")!;
const logEl = document.getElementById("log")!;

let ws: WebSocket | null = null;

function connect(): void {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    connectionStatus.textContent = "connected";
    connectionStatus.className = "connected";
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
    } catch { /* ignore */ }
  };
}

function handleMessage(msg: Record<string, unknown>): void {
  const type = msg.type as string;

  if (type === "telemetry") {
    const data = msg.data as {
      time: { phase: string; inWorldHour: number; day: number };
      resident: {
        focusRoom: string | null;
        orientation: string | null;
        felt: string | null;
        drives?: Array<{ id: string; name: string; level: number; pressure: number }>;
        practices?: Array<{ id: string; name: string; depth: number; active: boolean }>;
      };
    };

    // Time
    const t = data.time;
    timeBar.textContent = `Day ${t.day} — Hour ${t.inWorldHour} — ${capitalize(t.phase)}`;

    // Orientation
    orientationEl.textContent = data.resident.orientation ?? "—";

    // Felt
    if (data.resident.felt) {
      feltEl.textContent = data.resident.felt;
    }

    // Room
    const roomNames: Record<string, string> = {
      hearth: "The Hearth",
      study: "The Study",
      dark: "The Dark",
    };
    roomEl.textContent = roomNames[data.resident.focusRoom ?? "hearth"] ?? data.resident.focusRoom ?? "—";

    // Drives
    if (data.resident.drives && data.resident.drives.length > 0) {
      drivesEl.innerHTML = data.resident.drives
        .map((d) => {
          const pct = Math.round(d.level * 100);
          const cls = pct > 60 ? "drive-fill-high" : pct > 30 ? "drive-fill-mid" : "drive-fill-low";
          return `<div class="drive-bar">
            <span class="drive-label">${d.name}</span>
            <div class="drive-track"><div class="drive-fill ${cls}" style="width: ${pct}%"></div></div>
            <span class="drive-pct">${pct}%</span>
          </div>`;
        })
        .join("");
    }

    // Practices
    if (data.resident.practices && data.resident.practices.length > 0) {
      practicesEl.innerHTML = data.resident.practices
        .map((p) => {
          const pct = Math.round(p.depth * 100);
          const dotCls = p.active ? "practice-active" : "practice-dormant";
          return `<div class="practice-row">
            <span class="practice-dot ${dotCls}"></span>
            <span class="practice-label">${p.name}</span>
            <div class="practice-track"><div class="practice-fill" style="width: ${pct}%"></div></div>
          </div>`;
        })
        .join("");
    }
  }

  // Log events
  if (type === "resident.spoke" || type === "resident.moved" || type === "resident.acted" || type === "time.phaseChanged") {
    addLogEntry(type, msg);
  }
}

function addLogEntry(type: string, msg: Record<string, unknown>): void {
  const now = new Date().toLocaleTimeString();
  let detail = "";
  let cls = "log-entry";

  if (type === "resident.spoke") {
    detail = `"${msg.text}"`;
    cls += " log-speech";
  } else if (type === "resident.moved") {
    const roomNames: Record<string, string> = { hearth: "the Hearth", study: "the Study", dark: "the Dark" };
    detail = `↳ moves to ${roomNames[msg.to as string] ?? msg.to}`;
    cls += " log-move";
  } else if (type === "resident.acted") {
    detail = `⚡ ${msg.affordanceId} → ${msg.actionId}`;
    cls += " log-action";
  } else if (type === "time.phaseChanged") {
    detail = `⏱ ${capitalize(msg.from as string)} → ${capitalize(msg.to as string)}`;
    cls += " log-phase";
  }

  const entry = document.createElement("div");
  entry.className = cls;
  entry.innerHTML = `<span class="log-time">${now}</span> ${detail}`;
  logEl.prepend(entry);

  while (logEl.children.length > 100) {
    logEl.removeChild(logEl.lastChild!);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

connect();
