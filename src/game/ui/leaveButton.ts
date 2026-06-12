import Phaser from 'phaser'

/**
 * The standard "Leave" button shown on every building screen, so the exit
 * affordance is identical everywhere: a bordered pill in the top-left corner
 * reading "⟵  Leave  (Esc)". Fixed to the camera and drawn at a high depth so it
 * always sits above scene content. The whole pill is clickable.
 *
 * Pair it with an ESC key handler that calls the same `onLeave`.
 */
export function addLeaveButton(
  scene: Phaser.Scene,
  onLeave: () => void,
  accent = 0xffb74d,
): void {
  const w = 150, h = 38, x = 20, y = 14
  const g = scene.add.graphics().setDepth(2000).setScrollFactor(0)
  g.fillStyle(0x000000, 0.6)
  g.fillRoundedRect(x, y, w, h, 8)
  g.lineStyle(2, accent, 1)
  g.strokeRoundedRect(x, y, w, h, 8)

  const label = scene.add.text(x + w / 2, y + h / 2, '⟵  Leave  (Esc)', {
    fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(2001).setScrollFactor(0)

  // A zone over the whole pill makes the entire button clickable (not just the
  // text glyphs) and drives the hover tint.
  const zone = scene.add.zone(x, y, w, h).setOrigin(0)
    .setDepth(2002).setScrollFactor(0).setInteractive({ useHandCursor: true })
  zone.on('pointerover', () => label.setColor('#ffd54f'))
  zone.on('pointerout', () => label.setColor('#ffffff'))
  zone.on('pointerdown', onLeave)
}
