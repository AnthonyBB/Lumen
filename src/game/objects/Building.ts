import Phaser from 'phaser'

export class Building extends Phaser.GameObjects.Container {
  public collider: Phaser.GameObjects.Rectangle

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    width = 160,
    height = 120
  ) {
    super(scene, x, y)
    scene.add.existing(this)

    const hw = width / 2
    const hh = height / 2

    // Foundation shadow
    const shadow = scene.add.graphics()
    shadow.fillStyle(0x000000, 0.25)
    shadow.fillEllipse(0, hh + 8, width * 0.9, 20)
    this.add(shadow)

    // Main wall body
    const wall = scene.add.graphics()
    wall.fillStyle(0xd4b483, 1)
    wall.fillRect(-hw, -hh, width, height)
    wall.lineStyle(2, 0x9a7a50, 1)
    wall.strokeRect(-hw, -hh, width, height)
    this.add(wall)

    // Roof stripe
    const roofH = 22
    const roof = scene.add.graphics()
    roof.fillStyle(0x7a4e2d, 1)
    roof.fillRect(-hw - 6, -hh - roofH + 4, width + 12, roofH)
    roof.lineStyle(2, 0x5c3317, 1)
    roof.strokeRect(-hw - 6, -hh - roofH + 4, width + 12, roofH)
    this.add(roof)

    // Door (centered bottom)
    const doorW = 28
    const doorH = 40
    const door = scene.add.graphics()
    door.fillStyle(0x5c3317, 1)
    door.fillRect(-doorW / 2, hh - doorH, doorW, doorH)
    door.lineStyle(1, 0x3d2010, 1)
    door.strokeRect(-doorW / 2, hh - doorH, doorW, doorH)
    // Door knob
    door.fillStyle(0xf0c040, 1)
    door.fillCircle(doorW / 2 - 5, hh - doorH / 2, 3)
    this.add(door)

    // Two windows
    const winW = 28
    const winH = 24
    const winY = -hh + height * 0.35

    for (const wx of [-hw + 20 + winW / 2, hw - 20 - winW / 2]) {
      const win = scene.add.graphics()
      win.fillStyle(0x88ccee, 0.8)
      win.fillRect(-winW / 2, -winH / 2, winW, winH)
      win.lineStyle(2, 0x5c3317, 1)
      win.strokeRect(-winW / 2, -winH / 2, winW, winH)
      // Window cross
      win.lineStyle(1, 0x5c3317, 0.6)
      win.lineBetween(0, -winH / 2, 0, winH / 2)
      win.lineBetween(-winW / 2, 0, winW / 2, 0)
      win.setPosition(wx, winY)
      this.add(win)
    }

    // Sign label above building
    const signPadX = 12
    const signPadY = 6
    const signText = scene.add.text(0, -hh - roofH - 20, label, {
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    signText.setOrigin(0.5, 1)

    const signBg = scene.add.graphics()
    const tw = signText.width + signPadX * 2
    const th = signText.height + signPadY * 2
    signBg.fillStyle(0x1a1a2e, 0.85)
    signBg.fillRoundedRect(-tw / 2, -hh - roofH - 20 - th, tw, th, 6)
    signBg.lineStyle(1, 0xffd700, 0.8)
    signBg.strokeRoundedRect(-tw / 2, -hh - roofH - 20 - th, tw, th, 6)
    this.add(signBg)
    this.add(signText)

    this.setDepth(5)

    // Physics collider rectangle
    this.collider = scene.add.rectangle(x, y, width, height - doorH)
    this.collider.setOrigin(0.5, 0.5)
    this.collider.setY(y - doorH / 2)
    scene.physics.add.existing(this.collider, true) // static body
    this.collider.setVisible(false)
  }
}
