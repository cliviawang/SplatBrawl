import { describe, it, expect } from 'vitest';
import { HardAIController } from '@/ai/HardAIController';
import { createInitialState } from '@/core/GameState';
import hardCfg from '@/config/ai/hard.json';
import type { AIConfig } from '@/ai/AIContext';

const config = hardCfg as AIConfig;
const dt = 1 / 60;

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('HardAIController', () => {
  it('decide 返回 Intent，playerId 与构造一致', () => {
    const ai = new HardAIController(0, config);
    const state = createInitialState();
    const intent = ai.decide(state, dt);
    expect(intent.playerId).toBe(0);
  });

  it('首次 decide 即选定目标格', () => {
    const ai = new HardAIController(0, config);
    const state = createInitialState();
    ai.decide(state, dt);
    expect(ai.getContext().currentTargetCell).not.toBeNull();
  });

  it('moveDir 默认指向当前目标格中心方向（无 dash/skill 时）', () => {
    const ai = new HardAIController(0, config, () => 0.99); // 关闭随机 dash
    const state = createInitialState();
    const intent = ai.decide(state, dt);
    expect(intent.dash).toBe(false);
    expect(intent.useSkill).toBe(false);
    const target = ai.getContext().currentTargetCell!;
    const player = state.players[0];
    const expectedX = target.col + 0.5 - player.pos.x;
    const expectedY = target.row + 0.5 - player.pos.y;
    expect(intent.moveDir.x).toBeCloseTo(expectedX, 5);
    expect(intent.moveDir.y).toBeCloseTo(expectedY, 5);
  });

  it('持有 speed 时立即 useSkill=true', () => {
    const ai = new HardAIController(0, config, () => 0.99);
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'speed', used: false };
    const intent = ai.decide(state, dt);
    expect(intent.useSkill).toBe(true);
  });

  it('持有 rocket 但敌人远时不立刻放，而是 dash 凑位', () => {
    const ai = new HardAIController(0, config, () => 0.99);
    const state = createInitialState();
    // 拉远所有敌人
    state.players[1].pos = { x: 0.5, y: 9.5 };
    state.players[2].pos = { x: 0.5, y: 0.5 };
    state.players[3].pos = { x: 15.5, y: 9.5 };
    state.players[0].skillSlot = { id: 'rocket', used: false };
    const intent = ai.decide(state, dt);
    expect(intent.useSkill).toBe(false);
    expect(intent.dash).toBe(true);
  });

  it('持有 laser 在中央时不立刻放，而是 dash 凑位', () => {
    const ai = new HardAIController(0, config, () => 0.99);
    const state = createInitialState();
    state.players[0].pos = { x: 8, y: 5 };
    state.players[0].skillSlot = { id: 'laser', used: false };
    const intent = ai.decide(state, dt);
    expect(intent.useSkill).toBe(false);
    expect(intent.dash).toBe(true);
  });

  it('未持有技能时 useSkill 恒为 false', () => {
    const ai = new HardAIController(0, config, () => 0.99);
    const state = createInitialState();
    for (let i = 0; i < 60; i++) {
      const intent = ai.decide(state, dt);
      expect(intent.useSkill).toBe(false);
    }
  });

  it('playerId 越界返回零输入，不抛错', () => {
    const ai = new HardAIController(99, config);
    const state = createInitialState();
    const intent = ai.decide(state, dt);
    expect(intent.playerId).toBe(99);
    expect(intent.moveDir).toEqual({ x: 0, y: 0 });
    expect(intent.dash).toBe(false);
    expect(intent.useSkill).toBe(false);
  });

  it('注入种子 RNG 时行为可重放（同种子两次跑得到相同 Intent 序列）', () => {
    const ai1 = new HardAIController(0, config, mulberry32(42));
    const ai2 = new HardAIController(0, config, mulberry32(42));
    const s1 = createInitialState();
    const s2 = createInitialState();
    for (let i = 0; i < 200; i++) {
      const a = ai1.decide(s1, dt);
      const b = ai2.decide(s2, dt);
      expect(a).toEqual(b);
    }
  });

  it('反站立保险：连续多 tick 输出零 moveDir 后必然产生新非零方向', () => {
    // 构造极端场景：玩家被敌人色围困，但周围 4 邻没有非自家色 → 容易卡住
    // 这里用 rand=0.99 关掉 dash，纯靠 movement 验证
    const ai = new HardAIController(0, config, () => 0.99);
    const state = createInitialState();
    const me = state.players[0];
    // 强制玩家位置在格中心（消除浮点误差）
    me.pos = { x: 8.5, y: 5.5 };
    // 把 awarenessRadius 内全部染成自家色，制造"无候选目标"场景
    // 注意：scoreBestMoveTarget 在全图无候选时会返回 null，
    // 此时 currentTargetCell 仍可能是旧值或 null → moveDir 容易归零
    const W = state.tiles[0].length;
    const H = state.tiles.length;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        state.tiles[r][c].color = me.color;
      }
    }
    // 在视野外（距离 > 16）放个非自家格子也碰不到，干脆全图自家色
    // 跑 60 tick，前面会有连续静止 → 静态守卫触发后必然出现非零 moveDir
    let sawNonZero = false;
    for (let i = 0; i < 60; i++) {
      const intent = ai.decide(state, dt);
      const mag = Math.hypot(intent.moveDir.x, intent.moveDir.y);
      if (mag > 0.01) {
        sawNonZero = true;
        break;
      }
    }
    expect(sawNonZero).toBe(true);
  });

  it('地盘偏置：4 只 AI 在地图中心同位置时 moveDir 应分散到不同象限', () => {
    // 构造极端聚集场景：4 个 AI 全挤在中心，且周围全是落后场景
    // 期望：每只 AI 的 moveDir 被自己的 homeDir 牵引到不同象限，不会全指向同一格
    const state = createInitialState();
    // 把全图涂成 yellow（topColor），确保 4 只 AI 都进入"落后追第一"模式
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[r].length; c++) {
        state.tiles[r][c].color = 'yellow';
      }
    }
    // 把所有玩家挪到中心 (8.5, 5.5)
    for (const p of state.players) {
      p.pos = { x: 8.5, y: 5.5 };
    }
    // 给每只 AI 一个独立的 controller（rand=0.99 关掉 dash，纯看 moveDir）
    const ais = [
      new HardAIController(0, config, () => 0.99),
      new HardAIController(1, config, () => 0.99),
      new HardAIController(2, config, () => 0.99),
      new HardAIController(3, config, () => 0.99),
    ];
    const dirs = ais.map((ai) => {
      const intent = ai.decide(state, dt);
      return intent.moveDir;
    });
    // 验证：4 个方向至少占据 2 个不同象限（不全聚到同一象限）
    const quadrant = (d: { x: number; y: number }): number => {
      if (d.x >= 0 && d.y < 0) return 1; // 右上
      if (d.x < 0 && d.y < 0) return 2; // 左上
      if (d.x < 0 && d.y >= 0) return 3; // 左下
      return 4; // 右下
    };
    const set = new Set(dirs.map(quadrant));
    expect(set.size).toBeGreaterThanOrEqual(2);
  });

  it('已抵达脚下格时下一 tick 立即重选并产生非零 moveDir（不站满 250ms）', () => {
    const ai = new HardAIController(0, config, () => 0.99);
    const state = createInitialState();
    const me = state.players[0];
    // 玩家位于 (8.5, 5.5)，且脚下格是中性
    me.pos = { x: 8.5, y: 5.5 };
    state.tiles[5][8].color = 'neutral';
    // 远处（视野内）放一个明确的中性目标
    state.tiles[5][12].color = 'neutral';
    // 预热一帧让 currentTargetCell 选出来
    ai.decide(state, dt);
    // 强制把目标设到玩家脚下，模拟"刚刚抵达"
    (ai.getContext() as { currentTargetCell: { col: number; row: number } | null })
      .currentTargetCell = { col: 8, row: 5 };
    // 下一帧应该立即重选，且 moveDir 非零
    const intent = ai.decide(state, dt);
    const mag = Math.hypot(intent.moveDir.x, intent.moveDir.y);
    expect(mag).toBeGreaterThan(0.01);
    // 重选后的目标格不能是脚下格本身
    const t = ai.getContext().currentTargetCell;
    expect(t).not.toBeNull();
    if (t) {
      expect(t.col === 8 && t.row === 5).toBe(false);
    }
  });
});
