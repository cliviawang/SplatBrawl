/**
 * UtilityScorer（阶段 10 - Hard AI）：效用打分模块。
 *
 * 职责：把"候选行为"打分，调用方取最高分执行。模块本身不维护状态、不投递 Intent，
 * 仅提供三个纯函数评估器：
 *
 *   1. scoreMovementTargets  → 给若干候选格打分，返回最高分目标格
 *   2. scoreSkillCast        → 给"现在释放当前持有技能"打分
 *   3. scoreDashTarget       → 给"现在朝某方向冲刺"打分（含为放技能凑位的 combo dash）
 *
 * 局势感知（任务 10.3）：所有打分函数均接受 self-rank 及第一名颜色作为参数，
 * 调用方在外层算一次 computeScores 复用，避免每个评分器重复扫地图。
 *
 * 不变量：
 *   - 不依赖 phaser
 *   - 对 GameState 只读
 *   - 不使用 Date.now / Math.random（rand 由调用方注入）
 */
import gameCfg from '@/config/game.json';
import skillsCfg from '@/config/skills.json';
import type { Color, GameState, Vec2 } from '@/core/types';
import type { SkillId } from '@/core/skills/types';
import type { AIConfig } from '../AIContext';

export interface ScoringContext {
  state: GameState;
  playerId: number;
  config: AIConfig;
  /** self 在所有非 neutral 颜色中的排名：0=领先 / 1~3=落后；computeScores 排序后求得 */
  selfRank: number;
  /** 第一名颜色（neutral 滤掉后），用于"追第一"瞄准；若全图未染 → null */
  topColor: Color | null;
  /** 第一名颜色的几何中心格（int 格坐标），落后时作为"入侵焦点" */
  topColorCentroid: { col: number; row: number } | null;
  /**
   * 地盘方向单位向量。AI 在此方向上的候选格享受得分加成，反方向上的候选格受惩罚。
   * 用于打散 4 只 AI 集中在同一区域内绕圈的几何吸引子。
   * 由 HardAIController 根据 spawn 位置算出（spawn-mapCenter 单位化）。
   * 缺省 / 零向量 → 不施加偏置（向后兼容老调用方）。
   */
  homeDir?: Vec2;
  /**
   * 地盘偏置强度，0~1。配合 homeDir 使用。
   * 落后时（selfRank ≥ 1）按此值施加，领先时（selfRank=0）自动衰减到 ×0.3。
   * 缺省 → 0（无偏置）。
   */
  homeBiasStrength?: number;
  /**
   * 地盘偏置作用半径（格）。超过此距离的候选格不享受偏置加成 / 不受惩罚。
   * 防止 AI 死守自家区，远处的高价值机会仍能被抓到。
   * 缺省 → 6 格。
   */
  homeBiasRadius?: number;
}

export interface ScoredCell {
  col: number;
  row: number;
  score: number;
}

export interface SkillCastDecision {
  /** 是否立即释放 */
  cast: boolean;
  /** 若 cast=false 但建议先 dash 凑位（combo），返回推荐 dash 方向（单位向量） */
  comboDashDir?: Vec2;
}

const W_NEUTRAL_BASE = 1.0; // 中性格基础权重
const W_ENEMY_BASE = 0.7; // 敌色格基础权重（抢回）
const W_OWN_PENALTY = 0.05; // 自家格基础权重（基本不去）
const NEAR_DECAY = 0.5; // 距离衰减常数：weight = base / (d2 + NEAR_DECAY)

/**
 * 计算指定颜色的几何中心（整数格坐标）。无该颜色格 → null。
 * 给 selfRank/topColor 使用，O(W*H)，调用方应一帧只算一次。
 */
export function computeColorCentroid(
  state: GameState,
  color: Color,
): { col: number; row: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let r = 0; r < state.tiles.length; r++) {
    for (let c = 0; c < state.tiles[r].length; c++) {
      if (state.tiles[r][c].color === color) {
        sx += c;
        sy += r;
        n++;
      }
    }
  }
  if (n === 0) return null;
  return { col: Math.round(sx / n), row: Math.round(sy / n) };
}

/**
 * 给所有"非自色"格子打分，返回最高分。
 *
 * 评分原则（任务 10.1 + 10.3）：
 *   - 中性格基础分 W_NEUTRAL_BASE / (d2 + NEAR_DECAY) —— 越近越值
 *   - 敌色格基础分 W_ENEMY_BASE / (d2 + NEAR_DECAY)   —— 抢回略低于免费染色
 *   - 落后时（selfRank ≥ 1）：第一名颜色的格子额外乘 laggingAggressionFactor
 *   - 领先时（selfRank == 0）：自家边界邻格（任意自家格的 4 邻里有 neutral/敌色）权重乘 leadingDefenseFactor
 *   - awarenessRadius 外的格子直接跳过（性能 + 行为聚焦）
 *
 * 自家格、护盾保护中的格、超出感知半径的格都不进入候选。
 */
export function scoreBestMoveTarget(ctx: ScoringContext): ScoredCell | null {
  const { state, playerId, config } = ctx;
  const player = state.players[playerId];
  if (!player) return null;

  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;
  const r = config.awarenessRadius ?? Math.max(W, H);
  const r2 = r * r;
  const myColor = player.color;
  const px = player.pos.x;
  const py = player.pos.y;

  const lagFactor = config.laggingAggressionFactor ?? 1.5;
  const leadFactor = config.leadingDefenseFactor ?? 1.8;
  const isLagging = ctx.selfRank >= 1;
  const isLeading = ctx.selfRank === 0;
  const topColor = ctx.topColor;
  // 玩家所在整数格：用于排除"脚下格"作为候选 —— 避免 d2≈0 的零向量目标导致 AI 站立
  const myCol = Math.floor(px);
  const myRow = Math.floor(py);

  // 地盘偏置参数：homeDir + 强度 + 半径
  // 领先时（selfRank=0）自动把强度衰减到 0.3 倍，避免领先方死守自家区不出来劫掠
  const homeDir = ctx.homeDir;
  const rawBiasStrength = ctx.homeBiasStrength ?? 0;
  const homeBiasStrength = isLeading ? rawBiasStrength * 0.3 : rawBiasStrength;
  const homeBiasRadius = ctx.homeBiasRadius ?? 6;
  const homeDirMag = homeDir ? Math.hypot(homeDir.x, homeDir.y) : 0;
  const useBias = homeDir !== undefined && homeDirMag > 1e-6 && homeBiasStrength > 1e-6;
  const homeDirX = useBias && homeDir ? homeDir.x / homeDirMag : 0;
  const homeDirY = useBias && homeDir ? homeDir.y / homeDirMag : 0;

  // 领先时：先做一遍预扫描，标记"自家边界邻格"（自家格的 4 邻里有 neutral/敌色就标边界，
  // 标记的目标格是那个 neutral/敌色邻格本身，不是自家格）。
  // 用稀疏 set 而非二维数组，规避 16×10 = 160 个 boolean 的常量分配（无大碍但 set 表达更清晰）。
  const borderTargets = new Set<number>();
  if (isLeading) {
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        if (state.tiles[row][col].color !== myColor) continue;
        // 检查 4 邻
        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          const nc2 = state.tiles[nr][nc].color;
          if (nc2 !== myColor) borderTargets.add(nr * W + nc);
        }
      }
    }
  }

  let bestCol = -1;
  let bestRow = -1;
  let bestScore = -Infinity;

  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const tile = state.tiles[row][col];
      const c = tile.color;
      if (c === myColor) continue;
      // 排除脚下格：即使脚下是中性/敌色，d2≈0 会让权重爆炸成"满分目标"，
      // 但 dist<0.1 时 HardAIController 会输出零向量 → 站立不动。直接跳过。
      if (col === myCol && row === myRow) continue;
      // 护盾格暂时无法染色，但路过时可以触发，仍允许进入候选但权重折半
      const shielded = tile.shieldUntilTick > state.tick;

      const dx = col + 0.5 - px;
      const dy = row + 0.5 - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;

      let weight: number;
      if (c === 'neutral') {
        weight = W_NEUTRAL_BASE / (d2 + NEAR_DECAY);
      } else {
        weight = W_ENEMY_BASE / (d2 + NEAR_DECAY);
        // 落后时：第一名颜色的格子加权
        if (isLagging && topColor && c === topColor) {
          weight *= lagFactor;
        }
      }

      // 领先时：自家边界邻格加权（守边界）
      if (isLeading && borderTargets.has(row * W + col)) {
        weight *= leadFactor;
      }

      if (shielded) weight *= 0.5;

      // 地盘偏置：在 homeDir 方向上的格子加权，反方向减权，超出半径不施加
      // 公式：bias_factor = 1 + strength * dot(homeDir, vec_to_cell_norm) * proximity_decay
      // proximity_decay = max(0, 1 - dist/radius) → 边界处线性衰减到 0
      // 物理意义：把"群体散开 -> 各占一方"的设计意图编码进 utility，从根上消除 4 AI 聚集。
      if (useBias) {
        const dist = Math.sqrt(d2);
        if (dist < homeBiasRadius && dist > 1e-6) {
          const proximityDecay = 1 - dist / homeBiasRadius;
          const dot = (dx * homeDirX + dy * homeDirY) / dist;
          const biasFactor = 1 + homeBiasStrength * dot * proximityDecay;
          weight *= biasFactor;
        }
      }

      if (weight > bestScore) {
        bestScore = weight;
        bestCol = col;
        bestRow = row;
      }
    }
  }

  // 极端兜底：若全图无候选（理论上 W*H>1 时几乎不可能，仅 self 一色满图时触发）
  if (bestCol < 0) {
    // 退化为自家任意格（其实就是当前位置附近）
    return null;
  }
  // 给自家格一个极低的兜底分（实际不会被选中，因为前面 continue 了）
  // 这里再贴一个安全壳：返回的目标若与玩家所在格几乎重合（< 0.6 格），当作 null 让调用方重选
  void W_OWN_PENALTY;
  return { col: bestCol, row: bestRow, score: bestScore };
}

/**
 * 给"现在释放当前持有技能"打分，并决定是否要先 combo dash 凑位。
 *
 * 决策规则（任务 10.2）：
 *   - 未持有 / 已用 / 眩晕中 → cast=false 且无 comboDashDir
 *   - speed: 立即释放（buff 越早越好）
 *   - shield: 周围 3x3 内有敌色或敌人时释放（与 Medium 类似但更敏感）
 *   - rocket: 朝向"敌人最密集的方向"先 dash 一段再放收益最大；
 *             若已经在密集区中央（半径 3 内 ≥1 敌人）→ 立即释放；
 *             否则若可 dash → 推荐朝最近敌人的 dash 方向
 *   - laser: 朝向边缘释放可染整行/列；若玩家不在地图正中（距边界 > 2 格）→
 *           可立即释放（面向 facing 已被移动方向更新）；
 *           若靠近正中且可 dash → 推荐 dash 到最近边缘
 *
 * 返回 cast=true 时调用方应给 useSkill=true；
 * 返回 cast=false 但有 comboDashDir 时，调用方该 tick 优先 dash（暂不放技能，等下一帧再评估）。
 */
export function scoreSkillCast(ctx: ScoringContext): SkillCastDecision {
  const { state, playerId, config } = ctx;
  const player = state.players[playerId];
  if (!player) return { cast: false };
  if (!player.skillSlot || player.skillSlot.used) return { cast: false };
  if (state.tick < player.stunUntilTick) return { cast: false };

  const skillId = player.skillSlot.id;
  const combo = config.comboSkillCast === true;

  if (skillId === 'speed') return { cast: true };

  if (skillId === 'shield') {
    // 周围 3x3 + 敌人邻近半径任一满足
    const cx = Math.floor(player.pos.x);
    const cy = Math.floor(player.pos.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const row = cy + dy;
        const col = cx + dx;
        if (row < 0 || row >= state.tiles.length) continue;
        if (col < 0 || col >= state.tiles[0].length) continue;
        const c = state.tiles[row][col].color;
        if (c !== 'neutral' && c !== player.color) return { cast: true };
      }
    }
    // 附近 3 格内有敌人也释放（避免被火箭团灭）
    for (const o of state.players) {
      if (o.id === playerId) continue;
      const dx = o.pos.x - player.pos.x;
      const dy = o.pos.y - player.pos.y;
      if (dx * dx + dy * dy <= 9) return { cast: true };
    }
    return { cast: false };
  }

  if (skillId === 'rocket') {
    // 找最近敌人
    let bestDx = 0;
    let bestDy = 0;
    let bestD2 = Infinity;
    for (const o of state.players) {
      if (o.id === playerId) continue;
      const dx = o.pos.x - player.pos.x;
      const dy = o.pos.y - player.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestDx = dx;
        bestDy = dy;
      }
    }
    // 在密集区中央（最近敌人 ≤ 3 格）：立即放
    if (bestD2 <= 9) return { cast: true };
    // 远离敌人时：若可 combo 且 dash 就绪 → 朝最近敌人 dash 凑位
    if (combo && player.dashState.phase === 'idle' && state.tick >= player.stunUntilTick) {
      const mag = Math.hypot(bestDx, bestDy);
      if (mag > 0) {
        return { cast: false, comboDashDir: { x: bestDx / mag, y: bestDy / mag } };
      }
    }
    // 兜底：直接放（持有就是浪费）
    return { cast: true };
  }

  if (skillId === 'laser') {
    // facing 决定方向；当前距离边界
    const W = gameCfg.mapWidth;
    const H = gameCfg.mapHeight;
    const px = player.pos.x;
    const py = player.pos.y;
    const distToEdge = Math.min(px, W - px, py, H - py);
    // 已经贴近边界（< 2 格）：立即放，染整行/列
    if (distToEdge < 2) return { cast: true };
    // combo：朝最近边缘 dash
    if (combo && player.dashState.phase === 'idle' && state.tick >= player.stunUntilTick) {
      let dirX = 0;
      let dirY = 0;
      const d = [px, W - px, py, H - py];
      const minIdx = d.indexOf(Math.min(...d));
      if (minIdx === 0) dirX = -1;
      else if (minIdx === 1) dirX = 1;
      else if (minIdx === 2) dirY = -1;
      else dirY = 1;
      return { cast: false, comboDashDir: { x: dirX, y: dirY } };
    }
    // 兜底
    return { cast: true };
  }

  // 其他（star/roller/bomb/...）：立即释放
  void skillsCfg; // 保留 import，未来按 skill 拓展时按字段读
  void (skillId as SkillId);
  return { cast: true };
}

/**
 * 给当前 dash 决策打分。返回 null = 不冲刺。
 *
 * 评分（最高者执行）：
 *   - 朝最近敌人方向：分数 = 100 / (d + 1)，距离敌人越近越倾向冲撞
 *   - 朝最高分目标格方向：分数 = bestMoveScore × 50（与移动评分挂钩）
 *   - 朝随机方向：基础分 5（保留探索）
 *
 * 触发门：dash 不在冷却 / 玩家未眩晕 / rand() < dashChancePerSec * dt 才进入打分；
 * combo dash（外层 scoreSkillCast 已返回 dir）优先级最高，由 HardAIController
 * 在外层处理（不在本函数）。
 */
export interface DashScoreResult {
  dir: Vec2;
  /** 调试用：哪种来源胜出 */
  source: 'enemy' | 'target' | 'random';
  score: number;
}

export function scoreDashTarget(
  ctx: ScoringContext,
  dt: number,
  rand: () => number,
  bestMove: ScoredCell | null,
): DashScoreResult | null {
  const { state, playerId, config } = ctx;
  const player = state.players[playerId];
  if (!player) return null;
  if (player.dashState.phase !== 'idle') return null;
  if (state.tick < player.stunUntilTick) return null;
  if (rand() >= config.dashChancePerSec * dt) return null;

  // 候选 1：最近敌人
  let enemyDx = 0;
  let enemyDy = 0;
  let enemyD2 = Infinity;
  for (const o of state.players) {
    if (o.id === playerId) continue;
    const dx = o.pos.x - player.pos.x;
    const dy = o.pos.y - player.pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < enemyD2) {
      enemyD2 = d2;
      enemyDx = dx;
      enemyDy = dy;
    }
  }

  const candidates: DashScoreResult[] = [];
  if (enemyD2 < Infinity) {
    const d = Math.sqrt(enemyD2);
    if (d > 0) {
      candidates.push({
        dir: { x: enemyDx / d, y: enemyDy / d },
        source: 'enemy',
        score: 100 / (d + 1),
      });
    }
  }

  // 候选 2：bestMove
  if (bestMove) {
    const dx = bestMove.col + 0.5 - player.pos.x;
    const dy = bestMove.row + 0.5 - player.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.1) {
      candidates.push({
        dir: { x: dx / d, y: dy / d },
        source: 'target',
        score: bestMove.score * 50,
      });
    }
  }

  // 候选 3：随机方向（保底）
  const angle = rand() * Math.PI * 2;
  candidates.push({
    dir: { x: Math.cos(angle), y: Math.sin(angle) },
    source: 'random',
    score: 5,
  });

  // 取最高分
  let best = candidates[0];
  for (const c of candidates) if (c.score > best.score) best = c;
  return best;
}
