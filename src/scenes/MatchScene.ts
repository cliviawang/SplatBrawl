import Phaser from 'phaser';
import { GameLoop } from '@/single/GameLoop';
import { MapRenderer } from '@/render/MapRenderer';
import { PlayerRenderer } from '@/render/PlayerRenderer';
import { PickupRenderer } from '@/render/PickupRenderer';
import { ProjectileRenderer } from '@/render/ProjectileRenderer';
import { AreaEffectRenderer } from '@/render/AreaEffectRenderer';
import { StarFlashRenderer } from '@/render/StarFlashRenderer';
import { BombRenderer } from '@/render/BombRenderer';
import { SkillSlotRenderer } from '@/render/SkillSlotRenderer';
import { KeyboardInput } from '@/input/KeyboardInput';
import { DebugHUD } from '@/render/DebugHUD';
import { DebugConsole } from '@/render/DebugConsole';
import { HUD } from '@/render/HUD';
import { BottomHUD } from '@/render/BottomHUD';
import { ResultPanel } from '@/render/ResultPanel';
import { createAIController, type Difficulty } from '@/ai/factory';
import type { AIDecider } from '@/ai/AIContext';
import type { SkillId } from '@/core/skills/types';

/**
 * 主对局场景：
 *   - 玩家 0 走键盘输入
 *   - 玩家 1/2/3 走 AIController（难度由 init({ difficulty }) 注入）
 *   - 每帧：poll 键盘 + 各 AI decide → setIntent → loop.update → 同步渲染
 *
 * 阶段 11.2：
 *   - init(data) 接收难度参数；MenuScene 通过 scene.start('Match', { difficulty }) 传入
 *   - ResultPanel 注入再来一局/返回菜单回调；再来一局走 scene.restart 沿用当前难度
 *
 * 资源预加载由 BootScene 统一负责，本场景不再实现 preload。
 */
export interface MatchSceneInitData {
  difficulty?: Difficulty;
}

export class MatchScene extends Phaser.Scene {
  private loop!: GameLoop;
  private mapR!: MapRenderer;
  private playerR!: PlayerRenderer;
  private pickupR!: PickupRenderer;
  private projectileR!: ProjectileRenderer;
  private areaR!: AreaEffectRenderer;
  private starFlashR!: StarFlashRenderer;
  private bombR!: BombRenderer;
  private slotR!: SkillSlotRenderer;
  private input1!: KeyboardInput;
  private ais: AIDecider[] = [];
  private debugHud!: DebugHUD;
  private debugConsole!: DebugConsole;
  private hud!: HUD;
  private bottomHud!: BottomHUD;
  private resultPanel!: ResultPanel;
  private difficulty: Difficulty = 'easy';

  constructor() {
    super('Match');
  }

  /** Phaser 在 scene.start('Match', data) 时调用，create 之前 */
  init(data?: MatchSceneInitData): void {
    this.difficulty = data?.difficulty ?? 'easy';
  }

  create(): void {
    // 阶段 11：画布扩到 1024×792，TopHUD 占 0..80，游戏区从 y=80 起。
    // 让 cell 坐标渲染器（地图/玩家/pickup/投射物）整体下移最简洁的方式 —— camera scrollY=-80。
    // HUD / ResultPanel / DebugHUD 都 setScrollFactor(0)，不受影响。
    this.cameras.main.setScroll(0, -80);

    this.loop = new GameLoop();
    this.mapR = new MapRenderer(this, this.loop.state);
    this.areaR = new AreaEffectRenderer(this);
    this.starFlashR = new StarFlashRenderer(this);
    this.bombR = new BombRenderer(this);
    this.pickupR = new PickupRenderer(this);
    this.projectileR = new ProjectileRenderer(this);
    this.playerR = new PlayerRenderer(this, this.loop.state);
    this.slotR = new SkillSlotRenderer(this, this.loop.state);
    this.input1 = new KeyboardInput(this, 0);
    // 玩家 1/2/3 用选定难度的 AI；rand 默认 Math.random（联机才需要确定性，本场景仅单机）
    this.ais = [];
    for (let id = 1; id < this.loop.state.players.length; id++) {
      this.ais.push(createAIController(id, this.difficulty));
    }
    this.hud = new HUD(this);
    this.bottomHud = new BottomHUD(this, 0, this.loop.state);
    this.resultPanel = new ResultPanel(this, {
      onRestart: () => this.scene.restart({ difficulty: this.difficulty } as MatchSceneInitData),
      onBackToMenu: () => this.scene.start('Menu'),
    });
    this.debugHud = new DebugHUD(this);
    this.debugConsole = new DebugConsole(this);
    this.debugHud.setForceSkillProvider(() => this.debugConsole.getForceSkillId());
  }

  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    // 1. 玩家输入
    this.loop.setIntent(this.input1.poll());
    // 2. AI 决策：以渲染帧 dt 推进，和 GameLoop 的固定步长在 AI 内部不严格同步，
    //    但 Easy 的 decisionInterval 远大于帧间抖动，偏差可忽略；阶段 9+ 若需严格一致，
    //    可改为 per-tick 驱动（把 AI 决策挪到 GameLoop.tick 内部）。
    //    调试：DebugConsole 的 ai off 把 AI 替换为零意图（静止+不冲刺+不主动放技能），
    //    但仍每帧投递 Intent —— 保证上一份 Intent 不会残留导致鬼畜移动；
    //    technique slot 在 GameState 里不受影响，玩家冲刺撞 AI 仍能抢技能。
    const aiFrozen = this.debugConsole.isAiFrozen();
    for (const ai of this.ais) {
      const intent = aiFrozen
        ? { playerId: ai.playerId, moveDir: { x: 0, y: 0 }, dash: false, useSkill: false }
        : ai.decide(this.loop.state, dt);
      this.loop.setIntent(intent);
    }
    const stepsRan = this.loop.update(dt);
    // 仅当至少跑过一个 tick（latch 已被消费）才清离散按键，避免按下信号被 0-tick 帧吞掉
    if (stepsRan > 0) {
      this.input1.consume();
    }
    // 调试：强制技能模式
    //   - 把场上所有 pickup 的 skillId 改成强制项（地图上看到的也是它）
    //   - 玩家 0 的 skillSlot 持续填充，用掉立即补满，方便反复测试
    const forced = this.debugConsole.getForceSkillId();
    if (forced) {
      // DebugConsole 入口已经校验过 forced 一定是合法 SkillId
      const fid = forced as SkillId;
      for (const pk of this.loop.state.pickups) pk.skillId = fid;
      const p0 = this.loop.state.players[0];
      if (p0) p0.skillSlot = { id: fid, used: false };
    }
    this.mapR.sync(this.loop.state);
    this.areaR.sync(this.loop.state);
    this.starFlashR.sync(this.loop.state);
    this.bombR.sync(this.loop.state);
    this.pickupR.sync(this.loop.state);
    this.projectileR.sync(this.loop.state);
    this.playerR.sync(this.loop.state, dt);
    this.slotR.sync(this.loop.state);
    this.hud.sync(this.loop.state);
    this.bottomHud.sync(this.loop.state);
    this.resultPanel.sync(this.loop.state);
    this.debugHud.update(this.loop.state, dt, this.game.loop.actualFps);
  }
}
