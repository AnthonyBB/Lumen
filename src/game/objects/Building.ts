import Phaser from 'phaser'

export class Building extends Phaser.GameObjects.Container {
  public collider: Phaser.GameObjects.Rectangle

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    width = 160,
    height = 130
  ) {
    super(scene, x, y)
    scene.add.existing(this)

    const hw = width / 2
    const hh = height / 2

    // ── Ground shadow ──────────────────────────────────────────────────────
    const shadow = scene.add.graphics()
    shadow.fillStyle(0x000000, 0.2)
    shadow.fillEllipse(6, hh + 10, width * 1.1, 22)
    this.add(shadow)

    // ── Stone foundation ───────────────────────────────────────────────────
    const found = scene.add.graphics()
    found.fillStyle(0x555060, 1)
    found.fillRect(-hw - 4, hh - 10, width + 8, 14)
    found.lineStyle(1, 0x332e3a, 1)
    found.strokeRect(-hw - 4, hh - 10, width + 8, 14)
    this.add(found)

    // ── Main stone wall ────────────────────────────────────────────────────
    const wall = scene.add.graphics()
    // Base stone color
    wall.fillStyle(0x7a7090, 1)
    wall.fillRect(-hw, -hh, width, height)
    // Stone block pattern — horizontal rows
    wall.lineStyle(1, 0x5a5068, 0.8)
    for (let row = 0; row < 6; row++) {
      const rowY = -hh + row * (height / 6)
      wall.lineBetween(-hw, rowY, hw, rowY)
      // Offset vertical joints per row
      const offset = (row % 2 === 0) ? 0 : width / 4
      for (let col = 0; col < 5; col++) {
        const jx = -hw + offset + col * (width / 4)
        if (jx > -hw && jx < hw) {
          wall.lineBetween(jx, rowY, jx, rowY + height / 6)
        }
      }
    }
    // Left edge dark shading
    wall.fillStyle(0x504860, 0.35)
    wall.fillRect(-hw, -hh, 12, height)
    // Right edge darker shading
    wall.fillStyle(0x302840, 0.25)
    wall.fillRect(hw - 10, -hh, 10, height)
    // Wall border
    wall.lineStyle(2, 0x332e3a, 1)
    wall.strokeRect(-hw, -hh, width, height)
    this.add(wall)

    // ── Corner towers (small turrets) ─────────────────────────────────────
    const towerW = 24
    const towerH = height + 20
    for (const tx of [-hw + towerW / 2 - 2, hw - towerW / 2 + 2]) {
      const tower = scene.add.graphics()
      // Tower body
      tower.fillStyle(0x6a6080, 1)
      tower.fillRect(-towerW / 2, -towerH / 2, towerW, towerH)
      // Stone lines on tower
      tower.lineStyle(1, 0x4a4060, 0.7)
      for (let r = 0; r < 5; r++) {
        tower.lineBetween(-towerW / 2, -towerH / 2 + r * (towerH / 5), towerW / 2, -towerH / 2 + r * (towerH / 5))
      }
      tower.lineStyle(2, 0x332e3a, 1)
      tower.strokeRect(-towerW / 2, -towerH / 2, towerW, towerH)
      // Battlements on top
      tower.fillStyle(0x5a5070, 1)
      for (let b = 0; b < 3; b++) {
        tower.fillRect(-towerW / 2 + b * 8 + 1, -towerH / 2 - 10, 6, 10)
      }
      tower.setPosition(tx, -5)
      this.add(tower)
    }

    // ── Pointed fantasy roof ───────────────────────────────────────────────
    const roofH = 54
    const roof = scene.add.graphics()
    // Roof base fill
    roof.fillStyle(0x4a1a6e, 1)
    roof.fillTriangle(-hw - 8, -hh, 0, -hh - roofH, hw + 8, -hh)
    // Roof shading layers
    roof.fillStyle(0x6b2fa0, 0.5)
    roof.fillTriangle(-hw / 2, -hh, 0, -hh - roofH + 8, 4, -hh)
    // Roof edge
    roof.lineStyle(2, 0x2a0a4e, 1)
    roof.strokeTriangle(-hw - 8, -hh, 0, -hh - roofH, hw + 8, -hh)
    // Roof tiles (diagonal lines)
    roof.lineStyle(1, 0x3a1060, 0.5)
    for (let i = 1; i < 6; i++) {
      const frac = i / 6
      const lx = Phaser.Math.Linear(-hw - 8, 0, frac)
      const rx = Phaser.Math.Linear(hw + 8, 0, frac)
      const ly = Phaser.Math.Linear(-hh, -hh - roofH, frac)
      const ry = Phaser.Math.Linear(-hh, -hh - roofH, frac)
      roof.lineBetween(-hw - 8 + (hw + 8 + lx) * frac, ly, rx + (hw + 8) * (1 - frac), ry)
    }
    this.add(roof)

    // ── Tower cone tops ────────────────────────────────────────────────────
    for (const tx of [-hw + 10, hw - 10]) {
      const cone = scene.add.graphics()
      cone.fillStyle(0x3a1060, 1)
      cone.fillTriangle(-10, 0, 0, -26, 10, 0)
      cone.lineStyle(1, 0x2a0850, 1)
      cone.strokeTriangle(-10, 0, 0, -26, 10, 0)
      // Flag pennant
      cone.fillStyle(0xffd700, 1)
      cone.fillTriangle(0, -26, 8, -20, 0, -15)
      cone.setPosition(tx, -hh - 10)
      this.add(cone)
    }

    // ── Arched doorway ─────────────────────────────────────────────────────
    const doorW = 32
    const doorH = 46
    const door = scene.add.graphics()
    // Door frame (stone arch)
    door.fillStyle(0x3a3048, 1)
    door.fillRect(-doorW / 2 - 4, hh - doorH - 4, doorW + 8, doorH + 4)
    // Door opening — arch shape
    door.fillStyle(0x100c1a, 1)
    door.fillRect(-doorW / 2, hh - doorH, doorW, doorH - doorW / 2)
    door.fillCircle(0, hh - doorH + doorW / 2, doorW / 2)
    // Wooden door planks
    door.fillStyle(0x6b3d12, 0.85)
    door.fillRect(-doorW / 2 + 2, hh - doorH + 4, doorW / 2 - 3, doorH - doorW / 2 - 4)
    door.fillRect(2, hh - doorH + 4, doorW / 2 - 3, doorH - doorW / 2 - 4)
    // Door planks horizontal bar
    door.fillStyle(0x4a2a08, 1)
    door.fillRect(-doorW / 2 + 2, hh - doorH / 2 - 2, doorW - 4, 3)
    // Door handle
    door.fillStyle(0xffd700, 1)
    door.fillCircle(-3, hh - doorH / 2 + 6, 3)
    this.add(door)

    // ── Stained glass windows ──────────────────────────────────────────────
    const winW = 22
    const winH = 30
    const winY = -hh + height * 0.3

    const winColors = [0x88aaff, 0xffaa44, 0xaa44ff]
    let colorIdx = 0
    for (const wx of [-hw + 22, hw - 22]) {
      const win = scene.add.graphics()
      // Window frame
      win.fillStyle(0x3a3048, 1)
      win.fillRect(-winW / 2 - 3, -winH / 2 - 3, winW + 6, winH + 6)
      // Arched top
      win.fillCircle(0, -winH / 2, winW / 2 + 3)
      // Colored glass
      win.fillStyle(winColors[colorIdx % winColors.length], 0.75)
      win.fillRect(-winW / 2, -winH / 2, winW, winH)
      win.fillCircle(0, -winH / 2, winW / 2)
      // Pane dividers
      win.lineStyle(2, 0x1a1428, 0.9)
      win.lineBetween(0, -winH / 2 - 3, 0, winH / 2)
      win.lineBetween(-winW / 2, 0, winW / 2, 0)
      // Window glow
      win.fillStyle(0xffffff, 0.12)
      win.fillRect(-winW / 2 + 2, -winH / 2 + 2, winW / 2 - 2, winH - 4)
      win.setPosition(wx, winY)
      this.add(win)
      colorIdx++
    }

    // ── Sign label ─────────────────────────────────────────────────────────
    const signText = scene.add.text(0, -hh - roofH - 14, label, {
      fontSize: '13px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      fontStyle: 'bold',
    })
    signText.setOrigin(0.5, 1)

    const padX = 14
    const padY = 7
    const tw = signText.width + padX * 2
    const th = signText.height + padY * 2
    const signBg = scene.add.graphics()
    signBg.fillStyle(0x1a0a2e, 0.92)
    signBg.fillRoundedRect(-tw / 2, -hh - roofH - 14 - th, tw, th, 6)
    signBg.lineStyle(1, 0xffd700, 0.9)
    signBg.strokeRoundedRect(-tw / 2, -hh - roofH - 14 - th, tw, th, 6)
    // Decorative corners on sign
    signBg.fillStyle(0xffd700, 1)
    signBg.fillCircle(-tw / 2, -hh - roofH - 14 - th, 3)
    signBg.fillCircle(tw / 2, -hh - roofH - 14 - th, 3)
    signBg.fillCircle(-tw / 2, -hh - roofH - 14, 3)
    signBg.fillCircle(tw / 2, -hh - roofH - 14, 3)
    this.add(signBg)
    this.add(signText)

    this.setDepth(5)

    // Physics collider
    const colH = height - 40
    this.collider = scene.add.rectangle(x, y - 20, width - 10, colH)
    this.collider.setOrigin(0.5, 0.5)
    scene.physics.add.existing(this.collider, true)
    this.collider.setVisible(false)
  }
}
