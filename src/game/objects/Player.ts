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
    body.setOffset(6, 22)

    // Create animations once — guard prevents re-registration on scene restart
    if (!scene.anims.exists('walk_right')) {
      scene.anims.create({
        key: 'walk_right',
        frames: scene.anims.generateFrameNumbers('player', { frames: [1, 0, 2, 0] }),
        frameRate: 8,
        repeat: -1,
      })
      scene.anims.create({
        key: 'walk_left',
        frames: scene.anims.generateFrameNumbers('player', { frames: [4, 3, 5, 3] }),
        frameRate: 8,
        repeat: -1,
      })
      scene.anims.create({
        key: 'idle_right',
        frames: scene.anims.generateFrameNumbers('player', { frames: [0] }),
        frameRate: 1,
        repeat: -1,
      })
      scene.anims.create({
        key: 'idle_left',
        frames: scene.anims.generateFrameNumbers('player', { frames: [3] }),
        frameRate: 1,
        repeat: -1,
      })
    }

    this.play('idle_right')
  }

  update(cursors: CursorKeys, wasd: WASDKeys) {
    let vx = 0
    let vy = 0

    const left  = cursors.left.isDown  || wasd.A.isDown
    const right = cursors.right.isDown || wasd.D.isDown
    const up    = cursors.up.isDown    || wasd.W.isDown
    const down  = cursors.down.isDown  || wasd.S.isDown

    if (left)  vx -= 1
    if (right) vx += 1
    if (up)    vy -= 1
    if (down)  vy += 1

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707
      vy *= 0.707
    }

    this.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)

    if (vx !== 0 || vy !== 0) {
      if (vx < 0) {
        if (this.anims.currentAnim?.key !== 'walk_left')  this.play('walk_left')
      } else {
        if (this.anims.currentAnim?.key !== 'walk_right') this.play('walk_right')
      }
    } else {
      const idle = this.anims.currentAnim?.key?.startsWith('walk_left') ? 'idle_left' : 'idle_right'
      if (this.anims.currentAnim?.key !== idle) this.play(idle)
    }
  }
}
