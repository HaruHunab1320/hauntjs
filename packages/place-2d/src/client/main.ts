import * as Phaser from "phaser";
import { GameSocket } from "./net/socket.js";
import { RoostScene } from "./scenes/roost-scene.js";

const WS_URL = `ws://${window.location.hostname}:3002`;

function boot(guestName: string): void {
  const socket = new GameSocket(WS_URL);

  socket.connect().then(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-container",
      width: window.innerWidth,
      height: window.innerHeight - 200,
      backgroundColor: "#1a1a2e",
      scene: RoostScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    game.scene.start("RoostScene", { socket, guestName });

    window.addEventListener("resize", () => {
      game.scale.resize(window.innerWidth, window.innerHeight - 200);
    });
  }).catch((err) => {
    console.error("Failed to connect:", err);
    const log = document.getElementById("chat-log");
    if (log) {
      log.innerHTML = '<div class="msg-system">Failed to connect to The Roost. Is the server running?</div>';
    }
    // Remove modal on error so user can see the message
    const modal = document.getElementById("name-modal");
    if (modal) modal.style.display = "none";
  });
}

// Name entry
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const nameSubmit = document.getElementById("name-submit") as HTMLButtonElement;
const nameModal = document.getElementById("name-modal")!;

function submitName(): void {
  const name = nameInput.value.trim();
  if (!name) return;
  nameModal.style.display = "none";
  boot(name);
}

nameInput.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitName();
  }
});

nameSubmit.addEventListener("click", () => {
  submitName();
});

// Ensure input is focused
nameInput.focus();
