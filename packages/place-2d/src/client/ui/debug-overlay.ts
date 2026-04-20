import type { DebugSensorInfo, DebugPerceptionInfo } from "../../shared/protocol-types.js";

export class DebugOverlay {
  private container: HTMLElement;
  private visible = false;
  private sensorList: HTMLElement;
  private perceptionList: HTMLElement;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "debug-overlay";
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      width: 320px;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      color: #e0e0e0;
      font-family: monospace;
      font-size: 11px;
      overflow-y: auto;
      padding: 8px;
      z-index: 200;
      display: none;
      border-left: 1px solid #0f3460;
    `;

    const title = document.createElement("div");
    title.textContent = "SENSOR DEBUG [F2]";
    title.style.cssText = "color: #e4a672; font-size: 13px; margin-bottom: 8px; font-weight: bold;";
    this.container.appendChild(title);

    const sensorHeader = document.createElement("div");
    sensorHeader.textContent = "Sensors";
    sensorHeader.style.cssText = "color: #3a7ca5; margin-top: 8px; margin-bottom: 4px;";
    this.container.appendChild(sensorHeader);

    this.sensorList = document.createElement("div");
    this.container.appendChild(this.sensorList);

    const perceptionHeader = document.createElement("div");
    perceptionHeader.textContent = "Recent Perceptions";
    perceptionHeader.style.cssText = "color: #3a7ca5; margin-top: 12px; margin-bottom: 4px;";
    this.container.appendChild(perceptionHeader);

    this.perceptionList = document.createElement("div");
    this.container.appendChild(this.perceptionList);

    document.getElementById("game-container")!.appendChild(this.container);

    document.addEventListener("keydown", (e) => {
      if (e.key === "F2") {
        this.toggle();
      }
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? "block" : "none";
  }

  update(sensors: DebugSensorInfo[], perceptions: DebugPerceptionInfo[]): void {
    // Update sensors
    this.sensorList.innerHTML = "";
    for (const s of sensors) {
      const div = document.createElement("div");
      div.style.cssText = `
        margin-bottom: 4px;
        padding: 3px 4px;
        background: ${s.enabled ? "rgba(50, 80, 50, 0.4)" : "rgba(80, 30, 30, 0.4)"};
        border-radius: 2px;
      `;
      div.innerHTML = `
        <span style="color: ${s.enabled ? "#88cc88" : "#cc4444"}">${s.enabled ? "ON" : "OFF"}</span>
        <span style="color: #aaa">${s.roomName}</span>
        <span style="color: #e0e0e0">${s.name}</span>
        <br/>
        <span style="color: #666; margin-left: 28px">${s.modality} · ${s.fidelity} · ${s.reach}</span>
      `;
      this.sensorList.appendChild(div);
    }

    // Update perceptions
    if (perceptions.length > 0) {
      this.perceptionList.innerHTML = "";
      for (const p of perceptions) {
        const div = document.createElement("div");
        div.style.cssText = "margin-bottom: 4px; color: #ccc; border-left: 2px solid #e4a672; padding-left: 6px;";
        div.textContent = `[${p.modality}] ${p.content.slice(0, 80)} (${(p.confidence * 100).toFixed(0)}%)`;
        this.perceptionList.appendChild(div);
      }
    }
  }
}
