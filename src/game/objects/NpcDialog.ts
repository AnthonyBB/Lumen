import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'

/**
 * A camera-fixed dialogue box for talking to town NPCs. One instance is shared
 * by the scene: call open(name, lines) to start a conversation, advance() to
 * page through it (closes after the last page), and close() to dismiss.
 */
export class NpcDialog {
  private container: Phaser.GameObjects.Container
  private nameText: Phaser.GameObjects.Text
  private bodyText: Phaser.GameObjects.Text
  private hintText: Phaser.GameObjects.Text
  private lines: string[] = []
  private page = 0
  public isOpen = false

  constructor(scene: Phaser.Scene) {
    const W = 760, H = 144
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT - 110

    const bg = scene.add.graphics()
    bg.fillStyle(0x140a22, 0.96)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 12)
    bg.lineStyle(2, 0xffd700, 0.9)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 12)

    this.nameText = scene.add.text(-W / 2 + 22, -H / 2 + 14, '', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    })
    this.bodyText = scene.add.text(-W / 2 + 22, -H / 2 + 44, '', {
      fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#ede6ff',
      wordWrap: { width: W - 44 }, lineSpacing: 4,
    })
    this.hintText = scene.add.text(W / 2 - 22, H / 2 - 20, '', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#9988bb',
    }).setOrigin(1, 0.5)

    this.container = scene.add.container(cx, cy, [bg, this.nameText, this.bodyText, this.hintText])
    this.container.setScrollFactor(0).setDepth(140).setVisible(false)
  }

  open(name: string, lines: string[]) {
    this.lines = lines
    this.page = 0
    this.isOpen = true
    this.nameText.setText(name)
    this.render()
    this.container.setVisible(true)
  }

  /** Advance to the next page; closes after the last. Returns true if still open. */
  advance(): boolean {
    this.page++
    if (this.page >= this.lines.length) { this.close(); return false }
    this.render()
    return true
  }

  close() {
    this.isOpen = false
    this.container.setVisible(false)
  }

  private render() {
    this.bodyText.setText(this.lines[this.page] ?? '')
    const last = this.page >= this.lines.length - 1
    this.hintText.setText(last ? 'E / Click — done   ·   ESC — close'
                               : 'E / Click — more   ·   ESC — close')
  }
}
