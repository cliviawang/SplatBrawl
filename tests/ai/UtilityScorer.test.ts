import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/core/GameState';
import {
  computeColorCentroid,
  scoreBestMoveTarget,
  scoreSkillCast,
  scoreDashTarget,
  type ScoringContext,
} from '@/ai/scoring/UtilityScorer';
import hardCfg from '@/config/ai/hard.json';
import type { AIConfig } from '@/ai/AIContext';
import type { Color } from '@/core/types';

const config = hardCfg as AIConfig;
const dt = 1 / 60;

function makeCtx(playerId: number): ScoringContext {
  const state = createInitialState();
  return {
    state,
    playerId,
    config,
    selfRank: 0,
    topColor: null,
    topColorCentroid: null,
  };
}

describe('UtilityScorer / computeColorCentroid', () => {
  it('全图无该颜色 → null', () => {
    const state = createInitialState();
    expect(computeColorCentroid(state, 'red')).not.toBeNull();
    // 把所有 red 出生格抹掉
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[r].length; c++) {
        if (state.tiles[r][c].color === 'red') state.tiles[r][c].color = 'neutral';
      }
    }
    expect(computeColorCentroid(state, 'red')).toBeNull();
  });

  it('单格染色 → 返回该格坐标', () => {
    const state = createInitialState();
    // 把所有 red 抹掉，再单独画一格
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[r].length; c++) {
        if (state.tiles[r][c].color === 'red') state.tiles[r][c].color = 'neutral';
      }
    }
    state.tiles[3][5].color = 'red';
    expect(computeColorCentroid(state, 'red')).toEqual({ col: 5, row: 3 });
  });
});

describe('UtilityScorer / scoreBestMoveTarget', () => {
  it('正常情况返回非空目标格，且不是自家格', () => {
    const ctx = makeCtx(0);
    const res = scoreBestMoveTarget(ctx);
    expect(res).not.toBeNull();
    if (res) {
      const tile = ctx.state.tiles[res.row][res.col];
      const me = ctx.state.players[0];
      expect(tile.color).not.toBe(me.color);
    }
  });

  it('playerId 越界 → null', () => {
    const ctx = makeCtx(99);
    expect(scoreBestMoveTarget(ctx)).toBeNull();
  });

  it('玩家所在格不会被选为目标（即使是高分中性格）', () => {
    const state = createInitialState();
    // 把玩家所在格周围一圈染成自家色，让脚下格成为唯一"非自家"高分格
    const me = state.players[0];
    const myCol = Math.floor(me.pos.x);
    const myRow = Math.floor(me.pos.y);
    // 玩家踩在自家出生格上，先把脚下改成 neutral 模拟"踩到中性格"
    state.tiles[myRow][myCol].color = 'neutral';
    // 远处再放一个 neutral 格子作为合法目标候选
    const farCol = (myCol + 5) % state.tiles[0].length;
    const farRow = (myRow + 3) % state.tiles.length;
    state.tiles[farRow][farCol].color = 'neutral';

    const ctx: ScoringContext = {
      state,
      playerId: 0,
      config,
      selfRank: 0,
      topColor: null,
      topColorCentroid: null,
    };
    const res = scoreBestMoveTarget(ctx);
    expect(res).not.toBeNull();
    if (res) {
      // 不能选脚下格
      expect(res.col === myCol && res.row === myRow).toBe(false);
    }
  });

  it('地盘偏置：落后时同距离同色候选格中，homeDir 方向上的格子胜出', () => {
    const state = createInitialState();
    // 全图涂自家色
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[r].length; c++) {
        state.tiles[r][c].color = 'red';
      }
    }
    const me = state.players[0];
    // 玩家放在地图中心 (8.5, 5.5) 便于构造对称等距候选
    me.pos = { x: 8.5, y: 5.5 };
    // 左右两个等距 yellow 候选格：左 (3,5)、右 (13,5)，距离玩家都是 5 格
    state.tiles[5][3].color = 'yellow';
    state.tiles[5][13].color = 'yellow';

    // homeDir 朝右（地盘在右侧）→ 右侧 yellow 应胜出
    const ctx: ScoringContext = {
      state,
      playerId: 0,
      config,
      selfRank: 2,
      topColor: 'yellow' as Color,
      topColorCentroid: null,
      homeDir: { x: 1, y: 0 },
      homeBiasStrength: 0.3,
      homeBiasRadius: 6,
    };
    const winner = scoreBestMoveTarget(ctx);
    expect(winner).not.toBeNull();
    if (winner) {
      expect(winner.col).toBe(13);
    }

    // 反向：homeDir 朝左 → 左侧胜出
    const ctxLeft: ScoringContext = { ...ctx, homeDir: { x: -1, y: 0 } };
    const winnerLeft = scoreBestMoveTarget(ctxLeft);
    expect(winnerLeft).not.toBeNull();
    if (winnerLeft) {
      expect(winnerLeft.col).toBe(3);
    }
  });

  it('地盘偏置：超出 homeBiasRadius 的候选格不享受偏置加成', () => {
    const state = createInitialState();
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[r].length; c++) {
        state.tiles[r][c].color = 'red';
      }
    }
    const me = state.players[0];
    me.pos = { x: 8.5, y: 5.5 };
    // 候选 A：homeDir 方向但远（dist=8，超过 radius=6）→ 偏置应失效
    state.tiles[5][0].color = 'yellow'; // 左侧远，dist≈8.5
    // 候选 B：反 homeDir 方向但近（dist=3）→ 距离优势压过偏置惩罚
    state.tiles[5][12].color = 'yellow'; // 右侧近，dist≈3.5

    // homeDir 朝左：A 在 homeDir 但超出 radius；B 反方向但近
    // 没偏置时 B 因近胜出；有偏置且 A 超出 radius 时 B 仍应胜出
    const ctx: ScoringContext = {
      state,
      playerId: 0,
      config,
      selfRank: 2,
      topColor: 'yellow' as Color,
      topColorCentroid: null,
      homeDir: { x: -1, y: 0 },
      homeBiasStrength: 0.3,
      homeBiasRadius: 6,
    };
    const winner = scoreBestMoveTarget(ctx);
    expect(winner).not.toBeNull();
    if (winner) {
      // A 超出 radius → 偏置失效 → B 仍胜
      expect(winner.col).toBe(12);
    }
  });

  it('地盘偏置：领先时偏置强度自动衰减（selfRank=0 时不死守）', () => {
    // 验证 "selfRank=0 时 homeBiasStrength 被衰减到 0.3 倍" 的纯数值不变量。
    // 把对照组定义为：selfRank=2 + strength=0.09（手算的 0.3×0.3）。
    // 期望：selfRank=0 + strength=0.3 与 对照组得分一致 ——
    // 这样能避开 leadFactor 边界加权 / lagFactor topColor 加权的干扰，
    // 直接证明实现里"strength 在领先时被乘以 0.3"。
    const state = createInitialState();
    // 全图涂 yellow（非自家色）—— 避免 isLeading 分支预扫 borderTargets 干扰
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[r].length; c++) {
        state.tiles[r][c].color = 'yellow';
      }
    }
    const me = state.players[0];
    me.pos = { x: 8.5, y: 5.5 };

    const baseCtx: ScoringContext = {
      state,
      playerId: 0,
      config,
      selfRank: 2,
      topColor: null, // 关掉 lagFactor 加权
      topColorCentroid: null,
      homeDir: { x: 0, y: -1 },
      homeBiasStrength: 0.3,
      homeBiasRadius: 6,
    };
    // 落后 + 满偏置
    const winnerLag = scoreBestMoveTarget(baseCtx);
    // 领先 + 满偏置（实际生效 strength = 0.3 × 0.3 = 0.09）
    const winnerLead = scoreBestMoveTarget({ ...baseCtx, selfRank: 0 });
    // 落后 + 0.09 偏置（手算的衰减后）—— 与领先时应得分相同
    const winnerLagWeak = scoreBestMoveTarget({ ...baseCtx, homeBiasStrength: 0.09 });

    expect(winnerLag).not.toBeNull();
    expect(winnerLead).not.toBeNull();
    expect(winnerLagWeak).not.toBeNull();
    if (winnerLag && winnerLead && winnerLagWeak) {
      // 关键不变量：领先时的得分应与"落后时 strength 缩 0.3 倍"一致
      // —— 直接证明 selfRank=0 路径里 strength 被乘以 0.3
      expect(winnerLead.score).toBeCloseTo(winnerLagWeak.score, 5);
      // 且领先时得分严格小于落后时（strength 被压缩了）
      expect(winnerLead.score).toBeLessThan(winnerLag.score);
    }
  });

  it('落后时第一名颜色的格子权重提升（同距离下优先选 topColor）', () => {
    const state = createInitialState();
    // 把整张图都涂成 red（自家色），让候选只剩两个手动设置的等距格子
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[r].length; c++) {
        state.tiles[r][c].color = 'red';
      }
    }
    // 玩家 0 (red) 默认出生 row=1 col=8 → pos=(8.5, 1.5)
    const me = state.players[0];
    const px = me.pos.x;
    const py = me.pos.y;
    // 选两个真正"等距"的位置（dx 镜像、dy 相同）
    // 左侧 yellow：col=6 row=3 → 中心 (6.5, 3.5)，dx=-2 dy=2 d2=8
    // 右侧 blue ：col=10 row=3 → 中心 (10.5, 3.5)，dx=2 dy=2 d2=8
    state.tiles[3][6].color = 'yellow';
    state.tiles[3][10].color = 'blue';
    const dyL = (6 + 0.5 - px) ** 2 + (3 + 0.5 - py) ** 2;
    const dyR = (10 + 0.5 - px) ** 2 + (3 + 0.5 - py) ** 2;
    expect(dyL).toBeCloseTo(dyR, 9);

    // 落后场景：topColor=blue → blue 应胜出
    const ctxLag: ScoringContext = {
      state,
      playerId: 0,
      config,
      selfRank: 2,
      topColor: 'blue' as Color,
      topColorCentroid: { col: 10, row: 3 },
    };
    const winnerLag = scoreBestMoveTarget(ctxLag);
    expect(winnerLag).not.toBeNull();
    if (winnerLag) {
      expect(state.tiles[winnerLag.row][winnerLag.col].color).toBe('blue');
    }

    // 落后场景：topColor=yellow → yellow 应胜出
    const ctxLag2: ScoringContext = {
      state,
      playerId: 0,
      config,
      selfRank: 2,
      topColor: 'yellow' as Color,
      topColorCentroid: { col: 6, row: 3 },
    };
    const winnerLag2 = scoreBestMoveTarget(ctxLag2);
    expect(winnerLag2).not.toBeNull();
    if (winnerLag2) {
      expect(state.tiles[winnerLag2.row][winnerLag2.col].color).toBe('yellow');
    }
  });
});

describe('UtilityScorer / scoreSkillCast', () => {
  it('未持有技能 → cast=false', () => {
    const ctx = makeCtx(0);
    expect(scoreSkillCast(ctx).cast).toBe(false);
  });

  it('持有 speed → 立即释放', () => {
    const ctx = makeCtx(0);
    ctx.state.players[0].skillSlot = { id: 'speed', used: false };
    expect(scoreSkillCast(ctx).cast).toBe(true);
  });

  it('持有 rocket 且最近敌人 ≤ 3 格 → 立即释放', () => {
    const ctx = makeCtx(0);
    ctx.state.players[0].skillSlot = { id: 'rocket', used: false };
    // 把玩家 1 挪到玩家 0 旁边
    ctx.state.players[1].pos = {
      x: ctx.state.players[0].pos.x + 2,
      y: ctx.state.players[0].pos.y,
    };
    expect(scoreSkillCast(ctx).cast).toBe(true);
  });

  it('持有 rocket 但敌人远 + dash 就绪 → cast=false 且返回 comboDashDir', () => {
    const ctx = makeCtx(0);
    ctx.state.players[0].skillSlot = { id: 'rocket', used: false };
    // 拉远所有敌人到 8 格外
    ctx.state.players[1].pos = { x: 0.5, y: 9.5 };
    ctx.state.players[2].pos = { x: 0.5, y: 0.5 };
    ctx.state.players[3].pos = { x: 15.5, y: 9.5 };
    const res = scoreSkillCast(ctx);
    expect(res.cast).toBe(false);
    expect(res.comboDashDir).toBeDefined();
    if (res.comboDashDir) {
      const mag = Math.hypot(res.comboDashDir.x, res.comboDashDir.y);
      expect(mag).toBeCloseTo(1, 5);
    }
  });

  it('持有 laser 且贴近边缘（< 2 格）→ 立即释放', () => {
    const ctx = makeCtx(0);
    ctx.state.players[0].skillSlot = { id: 'laser', used: false };
    ctx.state.players[0].pos = { x: 0.5, y: 5 }; // 贴左边
    expect(scoreSkillCast(ctx).cast).toBe(true);
  });

  it('持有 laser 在地图中央 + dash 就绪 → cast=false 且 comboDashDir 指向最近边缘', () => {
    const ctx = makeCtx(0);
    ctx.state.players[0].skillSlot = { id: 'laser', used: false };
    ctx.state.players[0].pos = { x: 8, y: 5 }; // 中央
    const res = scoreSkillCast(ctx);
    expect(res.cast).toBe(false);
    expect(res.comboDashDir).toBeDefined();
  });

  it('眩晕中 → cast=false', () => {
    const ctx = makeCtx(0);
    ctx.state.players[0].skillSlot = { id: 'speed', used: false };
    ctx.state.players[0].stunUntilTick = ctx.state.tick + 60;
    expect(scoreSkillCast(ctx).cast).toBe(false);
  });
});

describe('UtilityScorer / scoreDashTarget', () => {
  it('rand >= dashChancePerSec*dt 时返回 null', () => {
    const ctx = makeCtx(0);
    const rand = () => 0.99; // 远大于 0.8/60 ≈ 0.013
    expect(scoreDashTarget(ctx, dt, rand, null)).toBeNull();
  });

  it('rand 触发时返回带方向的结果（单位向量）', () => {
    const ctx = makeCtx(0);
    const rand = () => 0; // 必触发
    const res = scoreDashTarget(ctx, dt, rand, null);
    expect(res).not.toBeNull();
    if (res) {
      const mag = Math.hypot(res.dir.x, res.dir.y);
      expect(mag).toBeCloseTo(1, 3);
    }
  });

  it('dash 冷却中返回 null', () => {
    const ctx = makeCtx(0);
    ctx.state.players[0].dashState = { phase: 'cooldown', timer: 0.5, dashDir: { x: 0, y: 0 } };
    expect(scoreDashTarget(ctx, dt, () => 0, null)).toBeNull();
  });

  it('眩晕中返回 null', () => {
    const ctx = makeCtx(0);
    ctx.state.players[0].stunUntilTick = ctx.state.tick + 60;
    expect(scoreDashTarget(ctx, dt, () => 0, null)).toBeNull();
  });
});
