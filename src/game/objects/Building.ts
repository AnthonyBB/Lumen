import Phaser from 'phaser'

export class Building extends Phaser.GameObjects.Container {
  public collider: Phaser.GameObjects.Rectangle

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    width = 200,
    height = 240
  ) {
    super(scene, x, y)
    scene.add.existing(this)

    // Each building gets a shell + a function tint so it reads as its purpose at
    // a glance (the frontage is further dressed with a function emblem in
    // WorldScene.decorateBuilding). We only have a handful of house shells, so a
    // few are reused but tinted + dressed differently.
    const textureMap: Record<string, string> = {
      'Learning Center': 'building_learning',
      'Combat Training': 'building_combat',
      'Market':          'building_market',
      'Combat Strategy': 'building_strategy',
      'Tavern':          'building_tavern',
      'The Forge':       'building_combat',   // sturdy stone shell, warm-tinted
      'The Armory':      'building_strategy',  // steel-tinted
      'Alchemy Lab':     'building_learning',  // the arcane purple house
    }
    const textureKey = textureMap[label] ?? 'building_learning'

    // Subtle multiply-tint per function (0xffffff = untinted). Kept gentle so the
    // pixel art stays readable rather than washed out.
    const tintMap: Record<string, number> = {
      'The Forge':       0xffb38a, // warm forge-glow orange
      'The Armory':      0xacc4e0, // cool steel blue
      'Alchemy Lab':     0xb8f0c4, // alchemical green
      'Market':          0xffe6b0, // warm trade-gold
      'Combat Training': 0xe8c4a0, // weathered tan
    }
    const tint = tintMap[label]

    // Worn-dirt apron under the footprint so the building sits ON the ground
    // (grounds the building without a drop shadow).
    const apron = scene.add.graphics()
    apron.fillStyle(0x9c7a50, 0.30)
    apron.fillEllipse(0, height / 2 - 6, width * 1.15, 36)
    apron.fillStyle(0x8a6a44, 0.25)
    apron.fillEllipse(0, height / 2 - 6, width * 0.9, 26)
    this.add(apron)

    // Building image
    const img = scene.add.image(0, 0, textureKey)
    img.setDisplaySize(width, height)
    if (tint !== undefined) img.setTint(tint)
    this.add(img)

    // Sign label
    const signAboveY = -height / 2 - 20
    const signText = scene.add.text(0, signAboveY, label, {
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
    signBg.fillRoundedRect(-tw / 2, signAboveY - th, tw, th, 6)
    signBg.lineStyle(1, 0xffd700, 0.9)
    signBg.strokeRoundedRect(-tw / 2, signAboveY - th, tw, th, 6)
    // Decorative corner dots
    signBg.fillStyle(0xffd700, 1)
    signBg.fillCircle(-tw / 2, signAboveY - th, 3)
    signBg.fillCircle(tw / 2,  signAboveY - th, 3)
    signBg.fillCircle(-tw / 2, signAboveY, 3)
    signBg.fillCircle(tw / 2,  signAboveY, 3)
    this.add(signBg)
    this.add(signText)

    this.setDepth(5)

    // Physics collider
    const colH = height - 50
    this.collider = scene.add.rectangle(x, y - 25, width - 20, colH)
    this.collider.setOrigin(0.5, 0.5)
    scene.physics.add.existing(this.collider, true)
    this.collider.setVisible(false)
  }
}
