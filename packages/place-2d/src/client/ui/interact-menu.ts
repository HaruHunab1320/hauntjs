export interface InteractOption {
  affordanceId: string;
  affordanceName: string;
  actionId: string;
  actionName: string;
  available: boolean;
}

export class InteractMenu {
  private container: HTMLElement | null = null;
  private onSelect: (affordanceId: string, actionId: string) => void;

  constructor(onSelect: (affordanceId: string, actionId: string) => void) {
    this.onSelect = onSelect;
  }

  show(options: InteractOption[]): void {
    this.hide();

    const container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 8px;
      padding: 16px;
      z-index: 50;
      min-width: 250px;
      max-width: 350px;
    `;

    const title = document.createElement("div");
    title.textContent = "Interact";
    title.style.cssText = "color: #e4a672; font-size: 16px; margin-bottom: 12px; text-align: center;";
    container.appendChild(title);

    for (const opt of options) {
      const btn = document.createElement("button");
      btn.textContent = `${opt.affordanceName}: ${opt.actionName}`;
      btn.disabled = !opt.available;
      btn.style.cssText = `
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 6px;
        background: ${opt.available ? "#1a1a2e" : "#111"};
        color: ${opt.available ? "#e0e0e0" : "#555"};
        border: 1px solid #0f3460;
        border-radius: 4px;
        cursor: ${opt.available ? "pointer" : "not-allowed"};
        font-family: Georgia, serif;
        font-size: 13px;
        text-align: left;
      `;
      if (opt.available) {
        btn.addEventListener("click", () => {
          this.onSelect(opt.affordanceId, opt.actionId);
          this.hide();
        });
      }
      container.appendChild(btn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close (Esc)";
    closeBtn.style.cssText = `
      display: block;
      width: 100%;
      padding: 6px;
      margin-top: 8px;
      background: transparent;
      color: #888;
      border: none;
      cursor: pointer;
      font-family: Georgia, serif;
      font-size: 12px;
    `;
    closeBtn.addEventListener("click", () => this.hide());
    container.appendChild(closeBtn);

    document.getElementById("game-container")!.appendChild(container);
    this.container = container;

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.hide();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
  }

  hide(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  get isVisible(): boolean {
    return this.container !== null;
  }
}
