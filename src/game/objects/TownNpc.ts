import Phaser from 'phaser'
import type { NpcDef } from '../data/townNpcs'

/**
 * A friendly townsperson the player can walk up to and chat with. Rendered from
 * a real CraftPix citizen spritesheet (down-facing idle loop) so it matches the
 * art style, with a soft shadow, a name pill, and a bobbing speech bubble
 * inviting interaction. Proximity + the "Press E to talk" flow live in WorldScene.
 */
export class TownNpc extends Phaser.GameObjects.Container {
  public readonly def: NpcDef

  constructor(scene: Phaser.Scene, def: NpcDef) {
    super(scene, def.x, def.y)
    this.def = def
    scene.add.existing(this)
    this.setDepth(4)

    // Soft ground shadow (the citizen sheets include their own, but a faint
    // extra ellipse grounds the larger display scale nicely).
    const shadow = scene.add.graphics()
    shadow.fillStyle(0x000000, 0.16); shadow.fillEllipse(0, 2, 30, 9)
    this.add(shadow)

    // Citizen sprite. The 32px cell is scaled up to read at town scale; nudge it
    // up so the feet sit near the container origin.
    const sprite = scene.add.sprite(0, -22, def.sprite, 0).setScale(2.2)
    const idleKey = `${def.sprite}_idle`
    if (scene.anims.exists(idleKey)) {
      sprite.anims.play(idleKey)
      // Desync from every other NPC: start at a random point in the loop and
      // drift at a slightly different speed so they don't breathe in unison.
      sprite.anims.setProgress(Phaser.Math.FloatBetween(0, 1))
      sprite.anims.timeScale = Phaser.Math.FloatBetween(0.8, 1.2)
    }
    this.add(sprite)

    // Name pill above the head — clear of the bobbing speech bubble below it.
    this.add(scene.add.text(0, -104, def.name, {
      fontSize: '11px', fontFamily: 'Georgia, serif', color: '#ffe9a8',
      backgroundColor: '#1a0a2ecc', padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 1))

    // Bobbing speech bubble above the head — signals "talk to me".
    const bubble = scene.add.graphics()
    bubble.fillStyle(0xfdf6e3, 0.95)
    bubble.fillRoundedRect(-13, -92, 26, 16, 5)
    bubble.fillTriangle(-4, -77, 4, -77, 0, -71)
    bubble.fillStyle(0x6a5a3a, 1)
    for (const dx of [-6, 0, 6]) bubble.fillCircle(dx, -84, 1.8)
    this.add(bubble)
    scene.tweens.add({
      targets: bubble, y: -5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }
}
