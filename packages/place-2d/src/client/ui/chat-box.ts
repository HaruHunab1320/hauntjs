export class ChatBox {
  private log: HTMLElement;
  private input: HTMLInputElement;
  private onSend: (text: string) => void;

  constructor(onSend: (text: string) => void) {
    this.log = document.getElementById("chat-log")!;
    this.input = document.getElementById("chat-input") as HTMLInputElement;
    this.onSend = onSend;

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.input.value.trim()) {
        this.onSend(this.input.value.trim());
        this.input.value = "";
        this.input.blur();
      }
      if (e.key === "Escape") {
        this.input.blur();
      }
      // Prevent game input while typing
      e.stopPropagation();
    });
  }

  addMessage(text: string, cls: "msg-resident" | "msg-guest" | "msg-system" | "msg-self", prefix?: string): void {
    const div = document.createElement("div");
    div.className = cls;
    div.textContent = prefix ? `${prefix}: ${text}` : text;
    this.log.appendChild(div);
    this.log.scrollTop = this.log.scrollHeight;
  }

  addResidentSpeech(text: string): void {
    this.addMessage(text, "msg-resident", "Poe");
  }

  addGuestSpeech(name: string, text: string, isSelf: boolean): void {
    this.addMessage(text, isSelf ? "msg-self" : "msg-guest", name);
  }

  addSystem(text: string): void {
    this.addMessage(text, "msg-system");
  }

  focus(): void {
    this.input.focus();
  }

  blur(): void {
    this.input.blur();
  }

  get isFocused(): boolean {
    return document.activeElement === this.input;
  }
}
