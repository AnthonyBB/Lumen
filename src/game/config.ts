import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { WorldScene } from './scenes/WorldScene'
import { UIScene } from './scenes/UIScene'
import { ClassroomScene } from './scenes/ClassroomScene'
import { CharacterScene } from './scenes/CharacterScene'
import { EquipmentScene } from './scenes/EquipmentScene'
import { ChestScene } from './scenes/ChestScene'
import { BiomeScene } from './scenes/BiomeScene'
import { BattleScene } from './scenes/BattleScene'
import { StrategyScene } from './scenes/StrategyScene'
import { SkillShopScene } from './scenes/SkillShopScene'
import { MarketScene } from './scenes/MarketScene'
import { TavernScene } from './scenes/TavernScene'
import { ForgeScene } from './scenes/ForgeScene'
import { GAME_WIDTH, GAME_HEIGHT } from './constants'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#2d5a1b',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, WorldScene, UIScene, ClassroomScene, CharacterScene, EquipmentScene, ChestScene, BiomeScene, BattleScene, StrategyScene, SkillShopScene, MarketScene, TavernScene, ForgeScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}
