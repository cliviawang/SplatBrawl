/**
 * 核心类型定义。逻辑层共享，不依赖 Phaser。
 *
 * 后续阶段会在此处扩展：
 *   - 阶段 5：GameState 增加 matchPhase ✓
 *   - 阶段 6.1：Player 增加 skillSlot ✓
 *   - 阶段 6.3+：GameState 增加 projectiles / statusEffects / areaEffects（按需就近补字段）
 */

import type { SkillId } from './skills/types';

export type Color = 'neutral' | 'red' | 'blue' | 'yellow' | 'green';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Tile {
  color: Color;
  /** 最近一次被染色的 tick；初始 -1 表示未染色 */
  lastPaintedTick: number;
  /**
   * 护盾保护截止 tick（阶段 6.3.3）。
   * state.tick < shieldUntilTick 时，该格不会被任何染色操作改写。
   * 初始 0 = 无护盾。
   */
  shieldUntilTick: number;
}

export interface Player {
  id: number;
  color: Color;
  pos: Vec2;
  /** 朝向（单位向量），默认朝下 (0,1) */
  facing: Vec2;
  /**
   * 碰撞无敌帧截止 tick（含此 tick 之前 active）。
   * state.tick < collisionInvulnUntilTick 时，applyCollisions 跳过该玩家配对。
   * 防止重叠状态下每 tick 反复推开导致抖动。初始 0 表示无无敌。
   */
  collisionInvulnUntilTick: number;
  /**
   * 踏敌减速 debuff 截止 tick（含此 tick 之前生效）。
   * state.tick < slowUntilTick 时，applyMovement 用 coverSlowFactor 减速。
   * 跨入敌色格时刷新为 state.tick + coverSlowDurationTicks（不叠加，直接覆盖）；
   * 离开敌色后剩余时间继续生效（"尾巴"），最长仍只持续 coverSlowDurationTicks。
   * 初始 0 = 无 debuff。
   */
  slowUntilTick: number;
  /**
   * 冲刺状态机（阶段 3）：
   *   - phase='idle'    : 可触发冲刺；timer=0
   *   - phase='dashing' : 正在冲刺；timer 累积已经冲了多少秒，到达 dashDurationSec 即结束
   *   - phase='cooldown': 冷却中；timer 为剩余冷却秒，归零回 idle
   * 冲刺方向 dashDir 仅在 dashing 期间有意义，按下 dash 那一帧锁定。
   */
  dashState: {
    phase: 'idle' | 'dashing' | 'cooldown';
    timer: number;
    dashDir: Vec2;
  };
  /**
   * 技能槽（阶段 6.1）：玩家身上当前持有的技能。
   *   - null            未持有（捡到道具时填入）
   *   - { id, used }    已捡到；释放时把 used 置 true，下一 tick 由调用方清空回 null
   *
   * 同一时间只能持有一个，再捡到新的会覆盖旧的（玩法规则 7.6.4）。
   */
  skillSlot: { id: SkillId; used: boolean } | null;
  /**
   * 眩晕截止 tick（阶段 6.3.1，火箭命中触发）。
   * state.tick < stunUntilTick 时，applyMovement / dash 触发都被跳过。
   * 6.4.0 规整 statusEffect 时再统一迁移。
   */
  stunUntilTick: number;
  /**
   * 极速 buff 截止 tick（阶段 6.3.2）。
   * state.tick < speedBoostUntilTick 时移动速度乘以 skills.json/speed.multiplier。
   */
  speedBoostUntilTick: number;
  /**
   * 涂刷 buff 截止 tick（阶段 6.3.5）。
   * state.tick < rollerUntilTick 时，applyMovement 跨入新格子后，
   * 除染脚下格外，还会沿 facing 主轴的垂直方向扩 ±1 共 2 个邻格染色（width=3）。
   * 扩展染色同样遵守护盾跳过 / 越界跳过；不检查格上是否有其他角色。
   */
  rollerUntilTick: number;
}

/**
 * 对局阶段：
 *   - 'playing' : 正常推进（dash/movement/collision/计时全部启用）
 *   - 'ended'   : matchTimeRemaining 归零后切入；GameLoop.tick 跳过所有玩法子系统，
 *                 仅自增 tick 并 emit 事件，便于结算面板订阅。
 */
export type MatchPhase = 'playing' | 'ended';

/**
 * 地图道具（阶段 6.2）：每 10 秒刷新，玩家踩到自动入槽。
 *   - col / row 为格索引（整数）
 *   - id 唯一，方便渲染层做"出现/消失"动画
 */
export interface Pickup {
  id: string;
  skillId: SkillId;
  col: number;
  row: number;
}

/**
 * 区域效果（阶段 6.4.1）。本版本仅支持 'shield' / 'bomb'，future: 'seed'。
 *   - centerX / centerY 为整数格中心（与 Pickup 不同，AreaEffect 一般以技能释放时玩家所在格为中心）
 *   - expireAtTick 到期 tick；炸弹引爆瞬间也用此触发
 */
export interface AreaEffect {
  id: string;
  type: 'shield' | 'bomb';
  ownerId: number;
  centerX: number;
  centerY: number;
  expireAtTick: number;
}

/**
 * 投射物（阶段 6.3.1，火箭专用；后续可扩展）。
 *   - pos / velocity 为浮点（格坐标 / 格每秒）
 *   - ownerColor 在命中时给格子染色用
 */
export interface Projectile {
  id: string;
  ownerId: number;
  type: 'rocket';
  pos: Vec2;
  velocity: Vec2;
  ownerColor: Color;
  spawnTick: number;
}

/**
 * 星星视觉记录（阶段 6.3.x 视觉补丁）。
 * 星星逻辑是瞬发的（onCast 立刻清色），但渲染层需要先播 0.2~0.3s 闪烁再"看到"格子变 neutral。
 * 故释放时往 state.starFlashes 推一条短生命周期记录，渲染层 diff 出新增项即可触发闪烁动画；
 * expireAtTick 到期由 cleanupStarFlashes 统一清除。
 *
 * 字段全部为可序列化基础类型，联机服务端可原样下发给客户端做特效。
 *   - tiles: 本次被清除的格子坐标列表（整数格坐标，row=y，col=x）
 *   - clearedColor: 被清除的颜色（仅给渲染层挑选闪烁色用，可选）
 */
export interface StarFlash {
  id: string;
  ownerId: number;
  tiles: Vec2[];
  clearedColor: Exclude<Color, 'neutral'>;
  spawnedAtTick: number;
  expireAtTick: number;
}

/**
 * 炸弹爆炸视觉记录（阶段 6.4.3）。
 * 炸弹引爆瞬间逻辑层立刻完成清色（干扰类技能：范围内格子统一清为米色），
 * 但渲染层需要播一段冲击波动画（白圆扩散 + camera shake）。
 * 故引爆时往 state.bombExplosions 推一条短生命周期记录，渲染层 diff 出新增项即可触发动画；
 * expireAtTick 到期由 cleanupBombExplosions 统一清除。
 *
 * 字段全部为可序列化基础类型，联机服务端可原样下发给客户端做特效。
 *   - centerX/centerY: 引爆中心整数格坐标
 *   - paintedTiles: 实际被清为米色（已跳过护盾 / 越界）的格子列表，渲染层据此可逐格闪烁
 */
export interface BombExplosion {
  id: string;
  ownerId: number;
  centerX: number;
  centerY: number;
  paintedTiles: Vec2[];
  spawnedAtTick: number;
  expireAtTick: number;
}

/**
 * 激光视觉记录（阶段 6.3.4）。
 * 激光逻辑是瞬发的（onCast 立刻染色），但渲染层需要播一段光束动画。
 * 故释放时往 state.laserBeams 推一条短生命周期记录，渲染层 diff 出新增项即可触发动画；
 * expireAtTick 到期由 cleanupLaserBeams 统一清除。
 *
 * 字段全部为可序列化基础类型，联机服务端可原样下发给客户端做特效。
 *   - origin: 释放时玩家所在格（整数格坐标）
 *   - direction: 量化后的四方向，渲染层可据此画横/竖矩形
 *   - ownerColor: 渲染光束颜色（避免渲染层再去查 player）
 */
export interface LaserBeam {
  id: string;
  ownerId: number;
  ownerColor: Color;
  origin: Vec2;
  direction: 'up' | 'down' | 'left' | 'right';
  spawnedAtTick: number;
  expireAtTick: number;
}

export interface GameState {
  tick: number;
  /** 二维数组 [row][col]，row=y，col=x */
  tiles: Tile[][];
  players: Player[];
  /** 剩余时间（秒），归零夹到 0 不再继续递减 */
  matchTimeRemaining: number;
  /** 当前对局阶段 */
  matchPhase: MatchPhase;
  /** 地图上当前可拾取的技能道具（阶段 6.2） */
  pickups: Pickup[];
  /** 活跃区域效果（阶段 6.4.1） */
  areaEffects: AreaEffect[];
  /** 飞行中的投射物（阶段 6.3.1） */
  projectiles: Projectile[];
  /** 激光视觉记录（阶段 6.3.4，渲染动画用，到期自动清理） */
  laserBeams: LaserBeam[];
  /** 星星清色视觉记录（阶段 6.3.x，渲染闪烁动画用，到期自动清理） */
  starFlashes: StarFlash[];
  /** 炸弹爆炸视觉记录（阶段 6.4.3，渲染冲击波动画用，到期自动清理） */
  bombExplosions: BombExplosion[];
  /** 最近一次刷新发生在哪一秒（用于"同一秒只刷一次"的去抖） */
  lastRefreshSec: number;
}

/**
 * 玩家/AI 投递给逻辑层的指令。每 tick 一份。
 * 联机时通过网络转发同一结构。
 */
export interface PlayerIntent {
  playerId: number;
  /** 移动方向（任意非零向量，由 movement 内部归一化）；(0,0) 表示不动 */
  moveDir: Vec2;
  dash: boolean;
  useSkill: boolean;
}
