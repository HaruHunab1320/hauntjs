import * as Phaser from "phaser";

export class SpeechBubble {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(x: number, y: number, text: string, duration = 5000): void {
    this.hide();

    const maxWidth = 250;
    const padding = 10;

    const textObj = this.scene.add.text(0, 0, text, {
      fontSize: "13px",
      fontFamily: "Georgia, serif",
      color: "#1a1a2e",
      wordWrap: { width: maxWidth - padding * 2 },
      lineSpacing: 4,
    });

    const bgWidth = Math.min(textObj.width + padding * 2, maxWidth);
    const bgHeight = textObj.height + padding * 2;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0xe4a672, 0.95);
    bg.fillRoundedRect(-bgWidth / 2, -bgHeight - 10, bgWidth, bgHeight, 6);

    // Little triangle pointing down
    bg.fillTriangle(
      -6, -10,
      6, -10,
      0, 0,
    );

    textObj.setOrigin(0.5, 1);
    textObj.setPosition(0, -10 - padding);

    this.container = this.scene.add.container(x, y, [bg, textObj]);
    this.container.setDepth(100);

    this.timer = setTimeout(() => this.hide(), duration);
  }

  hide(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }

  updatePosition(x: number, y: number): void {
    if (this.container) {
      this.container.setPosition(x, y);
    }
  }

  get isVisible(): boolean {
    return this.container !== null;
  }
}
