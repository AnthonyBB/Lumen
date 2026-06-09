import Phaser from 'phaser'

export class NPC extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, name: string) {
    super(scene, x, y)
    scene.add.existing(this)

    // NPC body (simple colored rectangle)
    const body = scene.add.graphics()
    body.fillStyle(0xcc6644, 1)
    body.fillRect(-10, -14, 20, 28)
    body.fillStyle(0xeebb99, 1)
    body.fillRect(-8, -14, 16, 10) // head
    this.add(body)

    // Name label
    const nameText = scene.add.text(0, -22, name, {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    })
    nameText.setOrigin(0.5, 1)
    this.add(nameText)

    this.setDepth(8)
    scene.physics.add.existing(this, true)
  }
}
