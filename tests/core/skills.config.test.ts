import { describe, it, expect } from 'vitest';
import skillsCfg from '@/config/skills.json';

/**
 * 任务 6.1：skills.json 数值配置完整性测试
 *
 * 8 个本版本技能 + 4 个 future（不注册到 registry，但配置条目仍保留）必须存在。
 */

describe('skills.json 数值配置', () => {
  const VERSION_8 = ['rocket', 'speed', 'shield', 'laser', 'roller', 'star', 'bomb', 'charge'];
  const FUTURE_4 = ['seed', 'ripple', 'mark', 'rewind'];

  it('包含本版本 8 个技能', () => {
    for (const id of VERSION_8) {
      expect(skillsCfg).toHaveProperty(id);
    }
  });

  it('保留 future 4 个条目（避免破坏配置结构）', () => {
    for (const id of FUTURE_4) {
      expect(skillsCfg).toHaveProperty(id);
    }
  });

  it('rocket 数值满足玩法规则', () => {
    expect(skillsCfg.rocket.speed).toBeGreaterThan(0);
    expect(skillsCfg.rocket.stunSec).toBeGreaterThan(0);
    expect(skillsCfg.rocket.directions).toBe(8);
  });

  it('speed 数值满足玩法规则', () => {
    expect(skillsCfg.speed.multiplier).toBeGreaterThan(1);
    expect(skillsCfg.speed.durationSec).toBeGreaterThan(0);
  });
});
