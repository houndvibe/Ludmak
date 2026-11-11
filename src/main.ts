import * as Phaser from 'phaser';
import { BackpackScene } from './scenes/BackpackScene';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { GameOverScene } from './scenes/GameOverScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultsScene } from './scenes/ResultsScene';
import { ShopScene } from './scenes/ShopScene';
import { H, W } from './ui';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14121a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  disableContextMenu: true,
  // Порядок: Boot → Menu → (Home ⇄ Shop / Backpack → Battle → Results) × 5 → GameOver
  scene: [BootScene, MenuScene, HomeScene, ShopScene, BackpackScene, BattleScene, ResultsScene, GameOverScene],
});
