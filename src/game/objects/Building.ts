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

    const textureMap: Record<string, string> = {
      'Learning Center': 'building_learning',
      'Combat Training': 'building_combat',
      'Market':          'building_market',
      'Combat Strategy': 'building_strategy',
    }
    const textureKey = textureMap[label] ?? 'building_learning'

    // Ground shadow
    const shadow = scene.add.graphics()
    shadow.fillStyle(0x000000, 0.2)
    shadow.fillEllipse(6, height / 2 + 12, width * 1.05, 22)
    this.add(shadow)

    // Building image
    const img = scene.add.image(0, 0, textureKey)
    img.setDisplaySize(width, height)
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
