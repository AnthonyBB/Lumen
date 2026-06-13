import Phaser from 'phaser'

/**
 * Suspend a scene's keyboard input while an input-bearing React overlay (e.g.
 * the roster panel's recruit-name / team-rename <input>s) sits over the canvas.
 *
 * React signals open/close via window CustomEvents (`lumen:overlay-open` /
 * `lumen:overlay-close`, dispatched from GamePage). While open we:
 *  1. flip `scene.input.keyboard.enabled = false` so update() stops reading
 *     WASD/arrows/E (no movement / NPC-talk sound), and
 *  2. release GLOBAL key capture so Phaser stops preventDefault()-ing those keys
 *     at the manager level — otherwise captured keys (WASD/arrows/E/space) never
 *     reach a focused DOM <input>, even with the plugin disabled.
 *
 * Re-enabling is made robust: the scene's own SHUTDOWN re-enables and removes
 * the listeners, so a scene can never get stuck with keyboard disabled.
 */
export function bindOverlayInputSuspension(scene: Phaser.Scene): void {
  const setEnabled = (enabled: boolean) => {
    const kb = scene.input?.keyboard
    if (!kb) return
    kb.enabled = enabled
    if (enabled) kb.enableGlobalCapture()
    else kb.disableGlobalCapture()
  }
  const onOpen = () => setEnabled(false)
  const onClose = () => setEnabled(true)

  window.addEventListener('lumen:overlay-open', onOpen)
  window.addEventListener('lumen:overlay-close', onClose)

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    window.removeEventListener('lumen:overlay-open', onOpen)
    window.removeEventListener('lumen:overlay-close', onClose)
    setEnabled(true)
  })
}
