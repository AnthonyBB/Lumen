import Phaser from 'phaser'
import { DIR_ROW, type AnimalSpecies, type Facing } from '../data/animals'

/**
 * A single wandering ambient animal. Extends an arcade-physics Container so it
 * has a velocity-driven body, with a child Sprite that plays a 4-direction walk
 * cycle from the species' CraftPix spritesheet.
 *
 * Wander AI: it alternates between PAUSE (stand a beat, idle frame) and WALK
 * (pick a random heading and move at the species speed for a short duration). It
 * faces its travel direction (down/up/right/left). When it collides with
 * something, hits the world bounds, or strays outside its roam area, it picks a
 * fresh heading (biased back toward its home point).
 *
 * Walk/idle animations are registered once in BootScene under the keys
 * `${id}_walk_{down|up|right|left}` and `${id}_idle` (see BootScene.makeAnimalAnims).
 */
export class Animal extends Phaser.GameObjects.Container {
  // Arcade physics gives this container a body once `physics.add.existing` runs.
  declare body: Phaser.Physics.Arcade.Body

  public readonly species: AnimalSpecies

  private readonly homeX: number
  private readonly homeY: number
  private readonly roamRadius: number
  private readonly sprite: Phaser.GameObjects.Sprite

  private mode: 'pause' | 'walk' = 'pause'
  private stateTimer = 0
  private heading = 0
  private facing: Facing = 'down'

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    species: AnimalSpecies,
    homeX: number,
    homeY: number,
    roamRadius: number,
  ) {
    super(scene, x, y)
    this.species = species
    this.homeX = homeX
    this.homeY = homeY
    this.roamRadius = roamRadius

    scene.add.existing(this)
    scene.physics.add.existing(this)

    // Sort with world props (trees/buildings sit around depth 3–5).
    this.setDepth(4)

    const body = this.body as Phaser.Physics.Arcade.Body
    const bw = species.bodySize
    const bh = Math.round(species.bodySize * 0.6)
    body.setSize(bw, bh)
    body.setOffset(-bw / 2, 0)
    body.setCollideWorldBounds(true)
    body.setBounce(0)

    // Sprite child. The frame cell has transparent headroom, so nudge it up a
    // touch so the feet sit near the body center.
    this.sprite = scene.add.sprite(0, -species.frame * species.scale * 0.18, species.sheet, 0)
    this.sprite.setScale(species.scale)
    // Per-animal speed jitter so herds don't cycle their legs in lockstep.
    this.sprite.anims.timeScale = Phaser.Math.FloatBetween(0.82, 1.18)
    this.add(this.sprite)
    this.faceDir('down')

    // Start in a short random pause so the herd doesn't move in lockstep.
    this.enterPause()
    this.stateTimer = Phaser.Math.FloatBetween(0, 1.2)
  }

  /** Per-frame wander tick. `dt` is in seconds. */
  public tick(dt: number) {
    const body = this.body as Phaser.Physics.Arcade.Body
    this.stateTimer -= dt

    if (this.mode === 'walk') {
      const b = body.blocked
      if (b.left || b.right || b.up || b.down) {
        // Bounced off a building/prop — steer AWAY from the wall we hit (with a
        // little jitter) instead of re-aiming home straight back into it, which
        // caused the stuck back-and-forth. Hold the new heading for a beat.
        let ax = (b.left ? 1 : 0) - (b.right ? 1 : 0)
        let ay = (b.up ? 1 : 0) - (b.down ? 1 : 0)
        if (ax === 0 && ay === 0) { ax = -Math.cos(this.heading); ay = -Math.sin(this.heading) }
        this.heading = Math.atan2(ay, ax) + Phaser.Math.FloatBetween(-0.5, 0.5)
        this.applyHeading()
        this.stateTimer = Phaser.Math.FloatBetween(0.6, 1.2)
      } else if (Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY) > this.roamRadius) {
        this.enterWalk(true)   // strayed too far — head back toward home
      }
    }

    if (this.stateTimer <= 0) {
      if (this.mode === 'walk') this.enterPause()
      else this.enterWalk(false)
    }
  }

  private enterPause() {
    this.mode = 'pause'
    this.stateTimer = Phaser.Math.FloatBetween(0.8, 2.4)
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0, 0)
    // Settle on the first (standing) frame of the current facing.
    this.sprite.anims.stop()
    this.sprite.setFrame(this.facingBaseFrame())
  }

  /** Begin walking. If `steerHome`, bias the heading back toward home. */
  private enterWalk(steerHome: boolean) {
    this.mode = 'walk'
    this.stateTimer = Phaser.Math.FloatBetween(0.7, 2.0)

    if (steerHome) {
      const toHome = Phaser.Math.Angle.Between(this.x, this.y, this.homeX, this.homeY)
      this.heading = toHome + Phaser.Math.FloatBetween(-0.7, 0.7)
    } else {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY)
      if (dist > this.roamRadius * 0.7) {
        const toHome = Phaser.Math.Angle.Between(this.x, this.y, this.homeX, this.homeY)
        this.heading = toHome + Phaser.Math.FloatBetween(-1.0, 1.0)
      } else {
        this.heading = Phaser.Math.FloatBetween(-Math.PI, Math.PI)
      }
    }

    this.applyHeading()
  }

  /** Apply the current heading to the body velocity + sprite facing/anim. */
  private applyHeading() {
    const speed = this.species.speed
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setVelocity(Math.cos(this.heading) * speed, Math.sin(this.heading) * speed)
    this.faceDir(this.headingToFacing())
  }

  /** Quantize the current heading to one of the four cardinal facings. */
  private headingToFacing(): Facing {
    // heading: 0 = right, +PI/2 = down (y grows downward), PI = left, -PI/2 = up.
    const a = Phaser.Math.Angle.Wrap(this.heading)
    if (a >= -Math.PI / 4 && a < Math.PI / 4) return 'right'
    if (a >= Math.PI / 4 && a < (3 * Math.PI) / 4) return 'down'
    if (a >= -(3 * Math.PI) / 4 && a < -Math.PI / 4) return 'up'
    return 'left'
  }

  /** Switch the sprite to the given facing and play its walk anim. */
  private faceDir(dir: Facing) {
    this.facing = dir
    const key = `${this.species.id}_walk_${dir}`
    if (this.scene.anims.exists(key)) {
      this.sprite.anims.play(key, true)
    } else {
      this.sprite.setFrame(this.facingBaseFrame())
    }
  }

  /** First (standing) frame index for the current facing. */
  private facingBaseFrame(): number {
    return DIR_ROW[this.facing] * this.species.cols
  }
}
