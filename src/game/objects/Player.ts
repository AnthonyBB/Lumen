import Phaser from 'phaser'
import { PLAYER_SPEED } from '../constants'

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys
type WASDKeys = {
  W: Phaser.Input.Keyboard.Key
  A: Phaser.Input.Keyboard.Key
  S: Phaser.Input.Keyboard.Key
  D: Phaser.Input.Keyboard.Key
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player')
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    this.setDepth(10)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(20, 24)
    body.setOffset(2, 8)
  }

  update(cursors: CursorKeys, wasd: WASDKeys) {
    let vx = 0
    let vy = 0

    const left = cursors.left.isDown || wasd.A.isDown
    const right = cursors.right.isDown || wasd.D.isDown
    const up = cursors.up.isDown || wasd.W.isDown
    const down = cursors.down.isDown || wasd.S.isDown

    if (left) vx -= 1
    if (right) vx += 1
    if (up) vy -= 1
    if (down) vy += 1

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707
      vy *= 0.707
    }

    this.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)

    if (vx < 0) {
      this.setFlipX(true)
    } else if (vx > 0) {
      this.setFlipX(false)
    }
  }
}
