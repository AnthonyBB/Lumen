import Phaser from 'phaser'
import { PLAYER_SPEED } from '../constants'

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys
type WASDKeys = {
  W: Phaser.Input.Keyboard.Key
  A: Phaser.Input.Keyboard.Key
  S: Phaser.Input.Keyboard.Key
  D: Phaser.Input.Keyboard.Key
}

type Direction = 'down' | 'left' | 'right' | 'up'

export class Player extends Phaser.Physics.Arcade.Sprite {
  // Remembers the last facing direction so the correct idle animation plays
  // when the player stops moving.
  private lastDir: Direction = 'down'

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Start with the idle spritesheet
    super(scene, x, y, 'character_idle')
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    this.setDepth(10)

    // Hitbox tuned to character feet (40x48 frame)
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(24, 20)
    body.setOffset(8, 28)

    // ── Animations ────────────────────────────────────────────────────────────
    // Both spritesheets are 160x192: 4 cols x 4 rows of 40x48 frames.
    // Row 0 (frames  0-3 ): facing down
    // Row 1 (frames  4-7 ): facing left
    // Row 2 (frames  8-11): facing right
    // Row 3 (frames 12-15): facing up
    //
    // Guard prevents re-registration when scenes restart.
    if (!scene.anims.exists('walk_down')) {
      // Walk animations (character_walk spritesheet)
      scene.anims.create({
        key: 'walk_down',
        frames: scene.anims.generateFrameNumbers('character_walk', { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      })
      scene.anims.create({
        key: 'walk_left',
        frames: scene.anims.generateFrameNumbers('character_walk', { start: 4, end: 7 }),
        frameRate: 8,
        repeat: -1,
      })
      scene.anims.create({
        key: 'walk_right',
        frames: scene.anims.generateFrameNumbers('character_walk', { start: 8, end: 11 }),
        frameRate: 8,
        repeat: -1,
      })
      scene.anims.create({
        key: 'walk_up',
        frames: scene.anims.generateFrameNumbers('character_walk', { start: 12, end: 15 }),
        frameRate: 8,
        repeat: -1,
      })

      // Idle animations (character_idle spritesheet)
      scene.anims.create({
        key: 'idle_down',
        frames: scene.anims.generateFrameNumbers('character_idle', { start: 0, end: 3 }),
        frameRate: 4,
        repeat: -1,
      })
      scene.anims.create({
        key: 'idle_left',
        frames: scene.anims.generateFrameNumbers('character_idle', { start: 4, end: 7 }),
        frameRate: 4,
        repeat: -1,
      })
      scene.anims.create({
        key: 'idle_right',
        frames: scene.anims.generateFrameNumbers('character_idle', { start: 8, end: 11 }),
        frameRate: 4,
        repeat: -1,
      })
      scene.anims.create({
        key: 'idle_up',
        frames: scene.anims.generateFrameNumbers('character_idle', { start: 12, end: 15 }),
        frameRate: 4,
        repeat: -1,
      })
    }

    this.playAnim('idle_down')
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
      // Prefer the axis with more input magnitude so diagonals look right
      if (Math.abs(vy) >= Math.abs(vx)) {
        this.lastDir = vy > 0 ? 'down' : 'up'
      } else {
        this.lastDir = vx > 0 ? 'right' : 'left'
      }
      this.playAnim(`walk_${this.lastDir}`)
    } else {
      this.playAnim(`idle_${this.lastDir}`)
    }
  }

  /** Play an animation only if it isn't already playing. */
  private playAnim(key: string) {
    if (this.anims.currentAnim?.key !== key) {
      this.play(key)
    }
  }
}
