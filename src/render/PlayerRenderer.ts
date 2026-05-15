import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import playerCfg from '@/config/player.json';
import skillsCfg from '@/config/skills.json';
import type { GameState, Player } from '@/core/types';

type Sprite = Phaser.GameObjects.Arc | Phaser.GameObjects.Image;

/**
 * 朝向平滑跟随速度（弧度/秒）≈ 576°/s，180° 急转约 0.31s 转完。
 * TODO: 加速技能接入后改为动态 —— 按 player.moveSpeed 线性缩放，
 *       让"速度越快 = 转身越灵活"（奖励加速状态，避免漂移挫败感）。
 */
const FACING_FOLLOW_SPEED = Math.PI * 3.2;

/** 普通描边宽度（px），fallback 圆形分支使用 */
const STROKE_WIDTH = 2;
/** 状态描边宽度（px），略加粗以增强可读性 */
const STROKE_WIDTH_STATUS = 3;

/**
 * 玩家描边状态：按优先级从高到低
 *   - stun：被火箭命中眩晕（紫）
 *   - slow：踏敌减速（红）
 *   - speed：极速 buff（黄）
 *   - none：默认黑色细边
 *
 * 多状态同帧同时存在时，按声明顺序取第一个为渲染色。
 */
type StatusKind = 'stun' | 'slow' | 'speed' | 'none';

function statusOf(state: GameState, p: Player): StatusKind {
  if (state.tick < p.stunUntilTick) return 'stun';
  if (state.tick < p.slowUntilTick) return 'slow';
  if (state.tick < p.speedBoostUntilTick) return 'speed';
  return 'none';
}

/**
 * 冲刺拖尾配置（阶段 3.2）
 *   - TRAIL_INTERVAL_FRAMES: 每隔 N 帧生成一个拖尾点，控制密度（dashing 0.2s × 60fps = 12 帧，
 *     每 2 帧一个 → 单次 dash 约 6 个拖尾，视觉够浓但不会爆 GC）
 *   - TRAIL_FADE_MS: 拖尾从初始 alpha 渐隐到 0 的时长（ms）
 *   - TRAIL_INIT_ALPHA: 初始透明度，留点空间做"由实变虚"
 *   - TRAIL_RADIUS_RATIO: 相对玩家圆半径的比例
 */
const TRAIL_INTERVAL_FRAMES = 2;
const TRAIL_FADE_MS = 200;
const TRAIL_INIT_ALPHA = 0.55;
const TRAIL_RADIUS_RATIO = 0.32;

/**
 * 冷却进度环配置（阶段 3.2）
 *   - 在玩家脚下绘制一段弧，弧长 = 已恢复的冷却比例 × 360°
 *   - 起点 -π/2（正上方），顺时针方向填充（参考主流游戏 CD 表达）
 *   - 半径略大于角色圆，避免遮挡角色本体
 */
const COOLDOWN_RING_RADIUS_RATIO = 0.55;
const COOLDOWN_RING_THICKNESS = 4;

/**
 * 涂刷指示框配置（阶段 6.3.5，方案 D：双层描边 + 离散格子标记）
 *
 * 视觉语言：
 *   - 不用大矩形 / 不旋转 / 不半透明填充
 *   - 改为 3 个独立的格栅对齐方块（仅描边、不填充），对应"前方一排 3 格"
 *   - 每方块 = 外层黑色 + 内层白色 双层描边（在任何彩色背景上都能看清，参考 RTS 选择框惯例）
 *   - 整体 alpha 在 1.0 ↔ 0.55 间快速闪烁，强化"激活态"信号
 *
 * 取格规则：
 *   - 锚点格 = floor(player.pos)（玩家当前所在格）
 *   - 主方向 = |facing.x| > |facing.y| 时沿 X，否则沿 Y
 *   - 沿主方向前进 1 格作为中心，副方向取 -1/0/+1 共 3 格
 *   - facing=(0,0) 时（未输入方向）保留上一帧的取格结果，避免闪回
 *
 * 仅在 state.tick < p.rollerUntilTick 期间显示。
 */
const ROLLER_CELLS = 3; // 每玩家 3 个标记格
const ROLLER_OUTER_STROKE_WIDTH = 5;
const ROLLER_OUTER_STROKE_COLOR = 0x000000;
const ROLLER_OUTER_STROKE_ALPHA = 0.9;
const ROLLER_INNER_STROKE_WIDTH = 3;
const ROLLER_INNER_STROKE_COLOR = 0xffffff;
const ROLLER_INNER_STROKE_ALPHA = 1.0;
/** 闪烁周期（ms）：每 BLINK_MS 切换一次 alpha */
const ROLLER_BLINK_MS = 220;
const ROLLER_BLINK_ALPHA_HIGH = 1.0;
const ROLLER_BLINK_ALPHA_LOW = 0.55;

/**
 * 角度最短弧插值，处理 ±π 环绕。
 * 把角度差归一到 [-π, π]，再按 maxStep 夹紧。
 */
function lerpAngle(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  // 归一到 [-π, π]
  diff = ((diff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const step = Math.max(-maxStep, Math.min(maxStep, diff));
  return current + step;
}

/**
 * 玩家是否处于"踏敌减速 debuff"期间（含离开敌色后的尾巴时长）。
 * 当前已被 statusOf 取代，保留 export 以便其他模块仍可直接查询。
 */
export function isSlowed(state: GameState, p: Player): boolean {
  return state.tick < p.slowUntilTick;
}

/**
 * 玩家渲染：4 个角色，按 player.<color> 取色。
 *
 * 资源策略：
 *   - hasTexture('character.<color>') 为 true：使用 image
 *   - 否则 fallback：圆形 + 黑色描边
 *
 * 坐标约定：
 *   GameState.player.pos 已经是连续格坐标，整数+0.5 即格中心。
 *   渲染时 sprite.x = pos.x * tileSize，无需额外偏移。
 *
 * 朝向（读 GameState.player.facing，纯视觉插值）：
 *   - targetAngle = atan2(facing.y, facing.x)
 *   - 静止时 facing 由 movement/dash 在最后一次写入后保持，渲染层不再自行用
 *     "位置差"反推（与逻辑层数据源不一致会导致 HUD facing 与画面朝向背离）
 *   - lerpAngle 平滑跟随，180° 急转也能顺滑过渡
 *   - facing=(0,0) 视为无朝向，保持当前角度
 *   - 素材基准朝右（rotation=0 即朝右），初始角度 0
 *
 * 踏敌减速反馈（阶段 2.2）：
 *   - 玩家处于减速 debuff 期间（state.tick < slowUntilTick，含离开敌色的"尾巴"），
 *     fallback 圆形描边切换为 ui.warning（红色）+ 略加粗
 *   - image 分支暂不做描边（Image 无 strokeStyle）；后续接图片时考虑外加 ring 子节点
 *
 * 冲刺反馈（阶段 3.2）：
 *   - dashing 期间每隔 TRAIL_INTERVAL_FRAMES 帧在玩家位置生成一个半透明圆，
 *     tween alpha → 0 后自动 destroy；色取 player.<color>，与角色一致
 *   - cooldown 期间在脚下用 Graphics 画一段弧，弧长 = 已恢复进度（0→1）
 *   - 不引入图片素材：纯 circle + Graphics 图元，符合"渲染层零硬编码 + AssetRegistry 取色"
 */
export class PlayerRenderer {
  private sprites: Sprite[] = [];
  /** 标记每个 sprite 是否为 fallback 圆形（true 才有 strokeStyle） */
  private isFallback: boolean[] = [];
  /** 上一帧 status 描边状态，避免重复 setStrokeStyle */
  private lastStatus: StatusKind[] = [];
  /** 当前实际朝向（弧度），每帧插值逼近 targetAngle */
  private facingAngles: number[] = [];
  /** 各玩家颜色（数值），用于拖尾着色，避免每帧重复查表 */
  private playerColors: number[] = [];
  /** 各玩家冷却进度环 Graphics（与玩家一一对应） */
  private cooldownRings: Phaser.GameObjects.Graphics[] = [];
  /**
   * 各玩家涂刷指示格：每玩家 ROLLER_CELLS 组，每组由 [outer, inner] 两个 Rectangle 组成
   *   - outer：黑色粗描边（5px）
   *   - inner：白色细描边（3px），叠在 outer 上 → 形成黑白双层边框
   *   - 都不填充（fillAlpha = 0）
   *   - 只通过 setPosition / setVisible / setAlpha 控制
   */
  private rollerCells: Phaser.GameObjects.Rectangle[][] = [];
  /** 各玩家闪烁定时事件（active 期间运行，inactive 时 remove） */
  private rollerBlinkEvents: Array<Phaser.Time.TimerEvent | null> = [];
  /** 各玩家闪烁当前相位（true = 高 alpha，false = 低 alpha） */
  private rollerBlinkHigh: boolean[] = [];
  /** 上一帧记录的取格中心格坐标（facing=(0,0) 时复用，避免闪回原点） */
  private rollerLastCenter: Array<{ cx: number; cy: number } | null> = [];
  /** 上一帧涂刷激活状态，避免每帧重复切换 */
  private lastRollerActive: boolean[] = [];
  /** 拖尾节流计数（每个玩家独立） */
  private trailFrameCounters: number[] = [];
  /** 上一次记录的 dashState.phase，用于检测 dashing → cooldown 切换时清拖尾计数 */
  private lastDashPhase: string[] = [];

  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, state: GameState, public tileSize = 64) {
    this.scene = scene;
    for (const p of state.players) {
      const textureKey = `character.${p.color}`;
      let sprite: Sprite;
      let fallback = false;
      const playerColor = AssetRegistry.getColor(`player.${p.color}`);
      if (AssetRegistry.hasTexture(textureKey)) {
        sprite = scene.add
          .image(0, 0, textureKey)
          .setDisplaySize(tileSize * 1.15, tileSize * 1.15);
      } else {
        sprite = scene.add.circle(0, 0, tileSize * 0.4, playerColor).setStrokeStyle(STROKE_WIDTH, 0x000000);
        fallback = true;
      }
      this.sprites.push(sprite);
      this.isFallback.push(fallback);
      this.lastStatus.push('none');
      this.facingAngles.push(0);
      this.playerColors.push(playerColor);

      // 冷却环：始终创建，按需绘制；放在角色 sprite 下方避免遮挡
      const ring = scene.add.graphics();
      ring.setDepth(sprite.depth - 1);
      this.cooldownRings.push(ring);
      this.trailFrameCounters.push(0);
      this.lastDashPhase.push('idle');

      // 涂刷指示格：每玩家创建 ROLLER_CELLS 组（默认隐藏），按格栅尺寸对齐
      // 取 skillsCfg.roller.width 作为格数，保持与逻辑层染色范围一致
      const rollerCellCount = skillsCfg.roller.width;
      const cells: Phaser.GameObjects.Rectangle[] = [];
      for (let c = 0; c < rollerCellCount; c++) {
        const outer = scene.add
          .rectangle(0, 0, tileSize, tileSize, 0x000000, 0)
          .setStrokeStyle(
            ROLLER_OUTER_STROKE_WIDTH,
            ROLLER_OUTER_STROKE_COLOR,
            ROLLER_OUTER_STROKE_ALPHA,
          )
          .setVisible(false);
        outer.setDepth(sprite.depth - 1);
        const inner = scene.add
          .rectangle(0, 0, tileSize, tileSize, 0x000000, 0)
          .setStrokeStyle(
            ROLLER_INNER_STROKE_WIDTH,
            ROLLER_INNER_STROKE_COLOR,
            ROLLER_INNER_STROKE_ALPHA,
          )
          .setVisible(false);
        inner.setDepth(sprite.depth - 1);
        cells.push(outer, inner);
      }
      this.rollerCells.push(cells);
      this.rollerBlinkEvents.push(null);
      this.rollerBlinkHigh.push(true);
      this.rollerLastCenter.push(null);
      this.lastRollerActive.push(false);
    }
  }

  /** 每帧同步：位置 + 朝向 + 踏敌减速描边 + 冲刺拖尾/冷却环 */
  sync(state: GameState, dt = 0): void {
    state.players.forEach((p, i) => {
      const sprite = this.sprites[i];

      // 位置
      sprite.x = p.pos.x * this.tileSize;
      sprite.y = p.pos.y * this.tileSize;

      // 朝向：直接读逻辑层 facing，保持 HUD 和画面一致
      // facing=(0,0) 视为无朝向（极端兜底），保持当前角度不变
      const fx = p.facing.x;
      const fy = p.facing.y;
      if (fx !== 0 || fy !== 0) {
        const targetAngle = Math.atan2(fy, fx);
        this.facingAngles[i] = lerpAngle(
          this.facingAngles[i],
          targetAngle,
          FACING_FOLLOW_SPEED * dt,
        );
      }
      sprite.rotation = this.facingAngles[i];

      // 状态描边（眩晕/减速/极速/普通）：仅 fallback 圆形分支生效
      if (this.isFallback[i]) {
        const status = statusOf(state, p);
        if (status !== this.lastStatus[i]) {
          const arc = sprite as Phaser.GameObjects.Arc;
          switch (status) {
            case 'stun':
              arc.setStrokeStyle(STROKE_WIDTH_STATUS, AssetRegistry.getColor('ui.buffStun'));
              break;
            case 'slow':
              arc.setStrokeStyle(STROKE_WIDTH_STATUS, AssetRegistry.getColor('ui.warning'));
              break;
            case 'speed':
              arc.setStrokeStyle(STROKE_WIDTH_STATUS, AssetRegistry.getColor('ui.buffSpeed'));
              break;
            case 'none':
            default:
              arc.setStrokeStyle(STROKE_WIDTH, 0x000000);
          }
          this.lastStatus[i] = status;
        }
      }

      // 冲刺拖尾 + 冷却环
      this.syncDashFeedback(p, i);
      this.lastDashPhase[i] = p.dashState.phase;

      // 涂刷指示框
      this.syncRollerIndicator(state, p, i);
    });
  }

  /**
   * 涂刷指示格同步（方案 D）：
   *   - active：显示 ROLLER_CELLS 个格栅对齐方块，位置 = 角色当前格的"前方一排 3 格"
   *   - inactive：全部隐藏，移除闪烁定时器
   *
   * 取格规则：
   *   - anchor = floor(p.pos)
   *   - 主方向轴：|facing.x| > |facing.y| ? X : Y；副方向轴 = 另一个
   *   - 中心格 = anchor + sign(主轴 facing 分量) ×  在主轴上 +1
   *   - 三格 = 中心格 + (副轴 -1, 0, +1)
   *   - facing=(0,0)：用 rollerLastCenter[i] 复用上一帧结果；首帧 fallback 为 anchor 自身（罕见）
   */
  private syncRollerIndicator(state: GameState, p: Player, i: number): void {
    const cells = this.rollerCells[i];
    const active = state.tick < p.rollerUntilTick;

    if (active !== this.lastRollerActive[i]) {
      cells.forEach((r) => r.setVisible(active));
      if (active) {
        this.startRollerBlink(i);
      } else {
        this.stopRollerBlink(i);
        this.rollerLastCenter[i] = null;
      }
      this.lastRollerActive[i] = active;
    }
    if (!active) return;

    // 取格中心
    const anchorX = Math.floor(p.pos.x);
    const anchorY = Math.floor(p.pos.y);
    let cx: number;
    let cy: number;
    const fx = p.facing.x;
    const fy = p.facing.y;
    if (fx === 0 && fy === 0) {
      // 无朝向输入，复用上一帧；若上一帧也没记录，退化为锚点格（极罕见）
      const last = this.rollerLastCenter[i];
      if (last) {
        cx = last.cx;
        cy = last.cy;
      } else {
        cx = anchorX;
        cy = anchorY;
      }
    } else if (Math.abs(fx) > Math.abs(fy)) {
      cx = anchorX + (fx > 0 ? 1 : -1);
      cy = anchorY;
    } else {
      cx = anchorX;
      cy = anchorY + (fy > 0 ? 1 : -1);
    }
    this.rollerLastCenter[i] = { cx, cy };

    // 主方向是否沿水平轴（X）：facing 非零时按 facing 的主轴判断；
    // facing=(0,0) 时（静止）按当前视觉朝向 facingAngles[i] 判断（cos 主导 → 水平）
    let horizontalMain: boolean;
    if (fx === 0 && fy === 0) {
      const a = this.facingAngles[i];
      horizontalMain = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a));
    } else {
      horizontalMain = Math.abs(fx) > Math.abs(fy);
    }

    // 摆 3 格：副方向偏移 -1 / 0 / +1
    // cells 数组结构：[outer0, inner0, outer1, inner1, outer2, inner2]
    const cellCount = cells.length / 2;
    for (let k = 0; k < cellCount; k++) {
      const off = k - Math.floor(cellCount / 2); // 例如 cellCount=3 → off ∈ {-1,0,1}
      const tileX = horizontalMain ? cx : cx + off;
      const tileY = horizontalMain ? cy + off : cy;
      const px = (tileX + 0.5) * this.tileSize;
      const py = (tileY + 0.5) * this.tileSize;
      cells[k * 2].setPosition(px, py);
      cells[k * 2 + 1].setPosition(px, py);
    }
  }

  /** 启动闪烁定时器：每 ROLLER_BLINK_MS 切换所有 cells 的 alpha */
  private startRollerBlink(i: number): void {
    if (this.rollerBlinkEvents[i]) {
      this.rollerBlinkEvents[i]!.remove(false);
    }
    this.rollerBlinkHigh[i] = true;
    this.rollerCells[i].forEach((r) => r.setAlpha(ROLLER_BLINK_ALPHA_HIGH));
    this.rollerBlinkEvents[i] = this.scene.time.addEvent({
      delay: ROLLER_BLINK_MS,
      loop: true,
      callback: () => {
        this.rollerBlinkHigh[i] = !this.rollerBlinkHigh[i];
        const a = this.rollerBlinkHigh[i] ? ROLLER_BLINK_ALPHA_HIGH : ROLLER_BLINK_ALPHA_LOW;
        this.rollerCells[i].forEach((r) => r.setAlpha(a));
      },
    });
  }

  /** 停止闪烁定时器 */
  private stopRollerBlink(i: number): void {
    const ev = this.rollerBlinkEvents[i];
    if (ev) {
      ev.remove(false);
      this.rollerBlinkEvents[i] = null;
    }
  }

  /**
   * 单玩家冲刺反馈处理：
   *   - dashing：节流生成拖尾，清空冷却环
   *   - cooldown：清拖尾计数，按剩余时间画弧
   *   - idle：清空冷却环
   */
  private syncDashFeedback(p: Player, i: number): void {
    const ring = this.cooldownRings[i];
    const sprite = this.sprites[i];

    if (p.dashState.phase === 'dashing') {
      ring.clear();

      this.trailFrameCounters[i] += 1;
      if (this.trailFrameCounters[i] % TRAIL_INTERVAL_FRAMES === 0) {
        this.spawnTrailDot(sprite.x, sprite.y, this.playerColors[i]);
      }
      return;
    }

    // 进入 cooldown/idle 时（刚从 dashing 切出）重置拖尾计数，避免跨 dash 累积
    if (this.lastDashPhase[i] === 'dashing') {
      this.trailFrameCounters[i] = 0;
    }

    if (p.dashState.phase === 'cooldown') {
      // timer 在 cooldown 期间含义是"剩余冷却秒"
      const remaining = Math.max(0, p.dashState.timer);
      const total = playerCfg.dashCooldownSec;
      const progress = total > 0 ? 1 - remaining / total : 1; // 0~1，1 = 即将就绪
      this.drawCooldownRing(ring, sprite.x, sprite.y, progress, this.playerColors[i]);
      return;
    }

    // idle
    ring.clear();
  }

  /** 在 (x, y) 生成一个半透明拖尾圆，自动渐隐销毁 */
  private spawnTrailDot(x: number, y: number, color: number): void {
    const dot = this.scene.add.circle(x, y, this.tileSize * TRAIL_RADIUS_RATIO, color, TRAIL_INIT_ALPHA);
    // 拖尾置于角色之下，避免遮挡
    dot.setDepth((this.sprites[0]?.depth ?? 0) - 2);
    this.scene.tweens.add({
      targets: dot,
      alpha: 0,
      duration: TRAIL_FADE_MS,
      ease: 'Cubic.Out',
      onComplete: () => dot.destroy(),
    });
  }

  /**
   * 在角色脚下绘制一段进度弧。
   * 起点 -π/2（正上方），顺时针扫过 progress×2π。
   */
  private drawCooldownRing(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    progress: number,
    color: number,
  ): void {
    g.clear();
    const radius = this.tileSize * COOLDOWN_RING_RADIUS_RATIO;
    // 背景虚弧（已消耗部分），淡灰
    g.lineStyle(COOLDOWN_RING_THICKNESS, 0x000000, 0.2);
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2, false);
    g.strokePath();

    if (progress <= 0) return;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * Math.min(1, progress);
    g.lineStyle(COOLDOWN_RING_THICKNESS, color, 0.95);
    g.beginPath();
    g.arc(cx, cy, radius, startAngle, endAngle, false);
    g.strokePath();
  }
}
