import Phaser from 'phaser'
import { Animal } from '../objects/Animal'
import {
  ANIMAL_SPECIES,
  PET_IDS,
  FARM_IDS,
  WILD_IDS,
} from '../data/animals'

/**
 * AnimalManager — spawns and self-drives wandering ambient animals in the
 * overworld. It registers its OWN scene UPDATE handler and cleans itself up on
 * SHUTDOWN, so WorldScene only has to construct it once.
 *
 * ── How WorldScene activates it (the only hookup needed) ───────────────────
 *
 *   import { AnimalManager } from '../systems/AnimalManager'
 *   import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants'
 *
 *   // (after buildings/props are created)
 *   const colliders = this.buildings.map(b => b.building.collider)
 *   this.animals = new AnimalManager(this, {
 *     worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT,
 *     townCenter: { x: 1280, y: 1280 }, townRadius: 520,
 *     colliders,
 *   })
 *
 * That's it — no per-frame call required; the manager runs its own update loop.
 * `colliders` may be any Phaser GameObjects that have arcade bodies (building
 * and prop colliders). Each animal gets `physics.add.collider(animal, c)` for
 * every collider, plus `setCollideWorldBounds(true)`, so animals respect both
 * object collisions and the world bounds.
 */

export interface AnimalManagerOptions {
  worldWidth: number
  worldHeight: number
  /** Center of the city area. */
  townCenter: { x: number; y: number }
  /** Radius of the city area; pets stay within it, farm/wild spawn outside. */
  townRadius: number
  /** Building/prop physics colliders to collide animals against. */
  colliders: Phaser.GameObjects.GameObject[]
  /** Optional spawn-count overrides. */
  petCount?: number
  /** Farm animals that roam inside the city (in addition to those outside). */
  cityFarmCount?: number
  farmWildCount?: number
}

export class AnimalManager {
  private readonly scene: Phaser.Scene
  private readonly opts: AnimalManagerOptions
  private readonly animals: Animal[] = []
  private readonly onUpdate: () => void
  private readonly onShutdown: () => void

  constructor(scene: Phaser.Scene, opts: AnimalManagerOptions) {
    this.scene = scene
    this.opts = opts

    this.spawnPets()
    this.spawnCityFarm()      // farm animals also wander the city (wild never do)
    this.spawnOutsideAnimals()

    // Self-managed update loop.
    this.onUpdate = () => this.update()
    this.onShutdown = () => this.destroy()
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown)
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown)
  }

  // ── Spawning ───────────────────────────────────────────────────────────────

  private spawnPets() {
    const count = this.opts.petCount ?? 6
    const petRoam = this.opts.townRadius * 0.55
    for (let i = 0; i < count; i++) {
      const id = PET_IDS[i % PET_IDS.length]
      const { x, y } = this.cityHome()
      this.spawnAt(id, x, y, petRoam)
    }
  }

  /** Farm animals also roam inside the city. (Wild animals never spawn here —
   *  they're placed exclusively outside the town in spawnOutsideAnimals.) */
  private spawnCityFarm() {
    const count = this.opts.cityFarmCount ?? 5
    const roam = this.opts.townRadius * 0.5
    for (let i = 0; i < count; i++) {
      const id = FARM_IDS[i % FARM_IDS.length]
      const { x, y } = this.cityHome()
      this.spawnAt(id, x, y, roam)
    }
  }

  /** A random home point inside the town ring that clears building footprints. */
  private cityHome(): { x: number; y: number } {
    const { townCenter, townRadius } = this.opts
    for (let tries = 0; tries < 30; tries++) {
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI)
      const dist = Phaser.Math.FloatBetween(townRadius * 0.25, townRadius * 0.9)
      const x = townCenter.x + Math.cos(angle) * dist
      const y = townCenter.y + Math.sin(angle) * dist
      if (this.clearOfBuildings(x, y, 40)) return { x, y }
    }
    return { x: townCenter.x, y: townCenter.y + townRadius * 0.6 }
  }

  /** True when (x,y) is clear of every building/prop collider by `margin` px. */
  private clearOfBuildings(x: number, y: number, margin: number): boolean {
    for (const c of this.opts.colliders) {
      const r = c as Phaser.GameObjects.Rectangle
      if (typeof r.getBounds !== 'function') continue
      const b = r.getBounds()
      if (x > b.x - margin && x < b.x + b.width + margin &&
          y > b.y - margin && y < b.y + b.height + margin) return false
    }
    return true
  }

  private spawnOutsideAnimals() {
    const { worldWidth, worldHeight, townCenter, townRadius } = this.opts
    const count = this.opts.farmWildCount ?? 14
    const margin = 120
    const outsideIds = [...FARM_IDS, ...WILD_IDS]

    let placed = 0
    let guard = 0
    while (placed < count && guard < count * 40) {
      guard++
      const hx = Phaser.Math.FloatBetween(margin, worldWidth - margin)
      const hy = Phaser.Math.FloatBetween(margin, worldHeight - margin)
      // Keep them clear of the town area.
      if (Phaser.Math.Distance.Between(hx, hy, townCenter.x, townCenter.y) < townRadius + 80) {
        continue
      }
      const id = outsideIds[placed % outsideIds.length]
      // Each animal loosely roams its own home area.
      const roam = Phaser.Math.FloatBetween(180, 320)
      this.spawnAt(id, hx, hy, roam)
      placed++
    }
  }

  private spawnAt(id: string, homeX: number, homeY: number, roamRadius: number) {
    const species = ANIMAL_SPECIES[id]
    if (!species) return

    // Start near the home point — but if the jitter lands on a building, start
    // exactly at the (already-cleared) home so nothing spawns inside a wall.
    let sx = homeX + Phaser.Math.FloatBetween(-roamRadius * 0.3, roamRadius * 0.3)
    let sy = homeY + Phaser.Math.FloatBetween(-roamRadius * 0.3, roamRadius * 0.3)
    if (!this.clearOfBuildings(sx, sy, 24)) { sx = homeX; sy = homeY }

    const animal = new Animal(this.scene, sx, sy, species, homeX, homeY, roamRadius)
    this.animals.push(animal)

    // Collide against every supplied building/prop collider.
    for (const c of this.opts.colliders) {
      if (c) this.scene.physics.add.collider(animal, c)
    }
  }

  // ── Update / teardown ───────────────────────────────────────────────────────

  private update() {
    const dt = this.scene.game.loop.delta / 1000
    for (const a of this.animals) a.tick(dt)
  }

  /** Remove update hooks and destroy all animals. Safe to call more than once. */
  public destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate)
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown)
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.onShutdown)
    for (const a of this.animals) a.destroy()
    this.animals.length = 0
  }
}
