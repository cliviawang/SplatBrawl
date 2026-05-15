# SplatBrawl 单机版 Demo 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个可玩的单机版 4 人乱斗 Demo（玩家 + 3 个 AI），完整实现 60 秒一局玩法、**7 个技能**（火箭/极速/护盾/激光/涂刷/星星/炸弹）、3 级 AI 难度选择，并为后续联机版本预留可复用的架构边界。剩余 5 个技能（涟漪/种子/标记/回溯/霸体）因纯程序动画难以呈现或单机难以测试，暂列为 future（详见阶段 6 末尾）。

**Architecture:**
采用 **逻辑层 / 渲染层 / 输入层 / AI 层** 四层分离架构。逻辑层为纯 TypeScript（不依赖 Phaser），以 Tick 驱动、确定性更新（固定步长 60Hz），所有数值通过 JSON 配置加载——这一层将来直接复用于联机服务端。渲染层用 Phaser 3 订阅逻辑层事件，AI 层与玩家输入层都向逻辑层投递 `Intent`（移动方向、是否冲刺、是否释放技能），形成"输入抽象 → 单一权威逻辑层"模式，联机时只需把 Intent 通过网络转发即可复用。

**Tech Stack:** Phaser 3.70+、TypeScript 5、Vite、Vitest、JSON 配置文件

**核心架构原则（每个任务都需遵守）：**
1. **逻辑层零 Phaser 依赖** — `src/core/` 下所有文件 import 检查必须通过 `grep -r "phaser" src/core/` 返回空
2. **Intent 模式** — 所有"操作"（人/AI）都封装为 `PlayerIntent { dir, dash, useSkill }`，每 tick 投递一次
3. **事件驱动渲染** — 逻辑层发出 `EventBus` 事件，Phaser Scene 订阅并播放动效，绝不反向调用
4. **确定性更新** — 逻辑层用固定 dt（1/60 秒），不依赖系统时间。便于后续联机重放和单测
5. **配置外置** — 所有数值（速度、CD、技能参数、AI 配置）从 `src/config/*.json` 读取，禁止魔法数
6. **资源外置** — 所有视觉资源（颜色、图片）通过 `AssetRegistry` 按 key 查询，渲染层禁止硬编码颜色值或图片路径；缺资源时自动 fallback 到几何图元，不阻塞开发

---

## 阶段总览（每阶段都必须可运行 + 可手动测试 + 单测覆盖）

| 阶段 | 交付物 | 玩家可做什么 | 测试方式 |
|------|--------|--------------|----------|
| 0 | 项目脚手架 + 资源层骨架（AssetRegistry） | 看到一个空白 Phaser 场景 | `npm run dev` 打开浏览器 |
| 1 | 16×10 格子地图 + 1 个玩家（颜色走 AssetRegistry） | WASD 移动单个角色，走过格子变色 | 浏览器肉眼 + Vitest 单测染色逻辑 |
| 2 | 完整移动系统（碰撞/边界/覆盖减速） | 走到边界停下、覆盖敌色变慢 | 单测 + 控制台输出当前速度 |
| 3 | 冲刺机制 | 空格冲刺 3 格，CD 5 秒 | 肉眼 + 单测 |
| 4 | BootScene 资源预加载 + 4 角色同场 + 简单 AI | 玩家 vs 3 个随机 AI，可观战 | 完整一局可结束 |
| 5 | 60 秒倒计时 + 计分 + 结算 | 一局完整流程 | 完整可玩 |
| 6 | 技能系统框架 + 7 个技能（火箭/极速/护盾/激光/涂刷/星星/炸弹） | 拾取并释放这 7 个技能 | 单测 + 肉眼 |
| 7 | （已合并入阶段 6） — | — | — |
| 8 | 冲刺抢夺技能 + 碰撞 + 状态效果（眩晕） | 对抗博弈完整 | 单测 + 肉眼 |
| 9 | 中等 AI（评估决策） | 中等 AI 明显比简单 AI 强 | 100 局对抗胜率统计 |
| 10 | 困难 AI（效用打分 + 连招 + 局势感知） | 困难 AI 稳定胜过中等 AI | 同上 |
| 11 | 难度选择 UI + 主菜单 + 结算界面（UI 走 AssetRegistry） | 完整游戏循环 | 完整体验 |
| 12 | 数值与颜色调参面板（开发模式） | 实时调整任意数值/颜色并立即生效 | 开发体验 |

---

## 联机版本复用规划（重要）

构建时必须明确每个文件属于哪一类：

| 复用等级 | 路径 | 说明 |
|----------|------|------|
| **A: 完全复用** | `src/core/`（GameState/Tile/Player/Skills/Rules） | 联机时直接搬到 Node.js 服务端 |
| **A: 完全复用** | `src/config/*.json`（数值） | 服务端客户端共用同一份配置 |
| **A: 完全复用** | `src/ai/`（AI 决策） | 服务端跑 AI 时直接用 |
| **B: 客户端独有** | `src/scenes/`、`src/render/`（含 `AssetRegistry`） | 联机时仅客户端使用 |
| **B: 客户端独有** | `src/config/assets/*.json` + `src/assets/images/` | 资源仅客户端需要，服务端不加载 |
| **B: 客户端独有** | `src/input/` | 玩家输入采集，发送 Intent 给服务端 |
| **C: 单机专用、联机重写** | `src/single/GameLoop.ts` | 单机 Tick 循环，联机替换为网络同步循环 |

**强制约束：**
- `src/core/` 所有 `.ts` 文件 import 中**禁止**出现 `phaser`
- `src/core/` 所有公开 API 必须接受/返回纯数据对象（无类实例方法链 vs Phaser 对象）
- 状态修改通过 `applyIntent(state, intent, dt)` 这种纯函数风格，不在类内部依赖 setTimeout/系统时间
- 添加 git pre-commit hook 检查（任务 0.5）

---

## 配置文件结构

任务 0 完成后建立的配置目录：

```
src/config/
├── game.json          # 全局：地图尺寸、局时长、tick 频率
├── player.json        # 角色：移动速度、冲刺距离、踏敌减速 debuff（强度 + 持续 tick 数）
├── skills.json        # 技能数值（本版本注册 8 个，future 4 个保留条目不注册）
├── ai/
│   ├── easy.json
│   ├── medium.json
│   └── hard.json
├── pickups.json       # 技能道具刷新规则
└── assets/            # 资源清单（图片路径映射，缺则 fallback 到几何图元）
    ├── colors.json    # 调色板：地板/玩家/UI 色（必填，AssetRegistry 唯一不允许 fallback 缺失的项）
    ├── tiles.json     # 4 色 + 米色格子的图片（可选，留空用纯色）
    ├── characters.json # 4 个角色 sprite（可选，留空用 circle）
    ├── skills.json    # 12 个技能的 icon/特效图（可选，留空用图元）
    └── ui.json        # HUD/菜单/按钮图（可选，留空用文字）
```

实际图片资源放在 `src/assets/images/` 下，按 `characters/`、`skills/`、`tiles/`、`ui/` 子目录分类。

### 资源管线工作流（"边做边接"）

每做一个新视觉元素（角色/技能/UI 按钮），固定流程：

1. 在对应 `src/config/assets/*.json` 添加条目（路径字段先留空 `""`）
2. Renderer 通过 `AssetRegistry.hasTexture(key)` 判断分支：
   - 有图：用 `scene.add.image / sprite`
   - 无图：用 `circle / rectangle / triangle` 等图元 fallback
3. 提交，验证可玩
4. 后续任何时候找到素材：JSON 里把空字符串改成 `"images/xxx.png"`，刷新浏览器即换皮，不动一行代码

### Asset Key 命名规范

| 类别 | Key 格式 | 示例 |
|------|----------|------|
| 颜色 | `<scope>.<name>` | `tile.red`、`player.blue`、`ui.bg` |
| 格子图 | `tile.<color>` | `tile.neutral`、`tile.red` |
| 角色图 | `character.<color>` | `character.red` |
| 技能图标 | `skill.<id>.icon` | `skill.rocket.icon` |
| 技能特效 | `skill.<id>.<effect>` | `skill.rocket.projectile`、`skill.bomb.explosion` |
| UI | `ui.<element>` | `ui.button.start`、`ui.hud.scorebar` |

---

# 阶段 0：项目脚手架

**目标：** 跑起来一个空白 Phaser 场景，配好 TS + Vite + Vitest。

**交付验证：** `npm run dev` 浏览器看到背景；`npm test` 跑通示例测试。

### 任务 0.1：初始化 Vite + TS + Phaser 项目

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `.gitignore`

**Step 1: 创建 package.json**

```json
{
  "name": "splatbrawl",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "phaser": "^3.70.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vitest/globals", "node"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

**Step 3: vite.config.ts**

```ts
import { defineConfig } from 'vite';
import path from 'path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { globals: true, environment: 'happy-dom' }
});
```

**Step 4: index.html + src/main.ts**

```html
<!DOCTYPE html>
<html><head><title>SplatBrawl</title>
<style>body{margin:0;background:#222;}</style></head>
<body><div id="game"></div><script type="module" src="/src/main.ts"></script></body></html>
```

```ts
// src/main.ts
import Phaser from 'phaser';
new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: 800, height: 500,
  backgroundColor: '#f5e6c8',
  scene: { create() { this.add.text(20, 20, 'SplatBrawl', { color: '#000' }); } }
});
```

**Step 5: 验证**

Run: `npm install && npm run dev`
Expected: 浏览器打开，看到米色背景与 "SplatBrawl" 文字。

**Step 6: Commit**

```bash
git add . && git commit -m "chore: 初始化 Vite+TS+Phaser+Vitest 项目"
```

### 任务 0.2：建立目录结构 + 架构边界检查脚本

**Files:**
- Create: `src/core/.gitkeep`、`src/ai/.gitkeep`、`src/scenes/.gitkeep`、`src/render/.gitkeep`、`src/input/.gitkeep`、`src/single/.gitkeep`、`src/config/.gitkeep`
- Create: `tests/.gitkeep`
- Create: `scripts/check-core-purity.mjs`

**Step 1: 创建 scripts/check-core-purity.mjs**

```js
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) {
      const content = readFileSync(p, 'utf-8');
      if (/from ['"]phaser['"]/.test(content) || /import .* phaser/i.test(content)) {
        console.error(`[ERROR] ${p} 引用了 phaser，违反 core 纯度约束！`);
        process.exit(1);
      }
    }
  }
}
walk('src/core');
walk('src/ai');
console.log('core/ai 纯度检查通过');
```

在 package.json scripts 增加：`"check:purity": "node scripts/check-core-purity.mjs"`

**Step 2: 验证**

Run: `npm run check:purity`
Expected: "core/ai 纯度检查通过"

**Step 3: Commit**

```bash
git add . && git commit -m "chore: 建立分层目录与 core 纯度检查脚本"
```

### 任务 0.3：创建初始配置文件

**Files:**
- Create: `src/config/game.json`、`src/config/player.json`

```json
// game.json
{ "mapWidth": 16, "mapHeight": 10, "matchDurationSec": 60, "tickRate": 60 }
```

```json
// player.json
{
  "moveSpeed": 3,
  "dashDistance": 3,
  "dashCooldownSec": 5,
  "dashDurationSec": 0.2,
  "coverSlowFactor": 0.85,
  "collisionPushback": 0.2,
  "collisionInvulnSec": 0.1,
  "dashHitStunSec": 0.3,
  "dashMissStunSec": 0.3,
  "dashHitPushback": 2
}
```

**Commit:** `chore: 加入 game/player 初始配置`

### 任务 0.4：资源层骨架（AssetRegistry + 资源清单）

**目标：** 建立资源外置机制，渲染层后续都通过 `AssetRegistry` 查询颜色和图片，缺图片时 fallback 到几何图元。本任务只做骨架，所有图片字段先留空。

**Files:**
- Create: `src/config/assets/colors.json`
- Create: `src/config/assets/tiles.json`
- Create: `src/config/assets/characters.json`
- Create: `src/config/assets/skills.json`
- Create: `src/config/assets/ui.json`
- Create: `src/assets/images/.gitkeep`（4 个子目录 `characters/`、`skills/`、`tiles/`、`ui/` 各一个）
- Create: `src/render/AssetRegistry.ts`
- Create: `tests/render/AssetRegistry.test.ts`

**Step 1: 写资源清单（colors.json 必填，其他留空）**

```json
// src/config/assets/colors.json
{
  "tile": {
    "neutral": "#f5e6c8",
    "red":     "#e74c3c",
    "blue":    "#3498db",
    "yellow":  "#f1c40f",
    "green":   "#2ecc71"
  },
  "player": {
    "red":     "#c0392b",
    "blue":    "#2980b9",
    "yellow":  "#f39c12",
    "green":   "#27ae60"
  },
  "ui": {
    "bg":         "#222222",
    "text":       "#ffffff",
    "textShadow": "#000000"
  }
}
```

```json
// src/config/assets/tiles.json
{ "neutral": "", "red": "", "blue": "", "yellow": "", "green": "" }
```

```json
// src/config/assets/characters.json
{ "red": "", "blue": "", "yellow": "", "green": "" }
```

```json
// src/config/assets/skills.json
{
  "rocket": { "icon": "", "projectile": "" },
  "speed":  { "icon": "" },
  "star":   { "icon": "" },
  "shield": { "icon": "" },
  "laser":  { "icon": "" },
  "roller": { "icon": "" },
  "bomb":   { "icon": "", "explosion": "" },
  "seed":   { "icon": "" },
  "charge": { "icon": "" },
  "ripple": { "icon": "" },
  "mark":   { "icon": "" },
  "rewind": { "icon": "" }
}
```

```json
// src/config/assets/ui.json
{ "button": { "start": "" }, "hud": { "scorebar": "" } }
```

**Step 2: 写测试** (`tests/render/AssetRegistry.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { AssetRegistry } from '@/render/AssetRegistry';

describe('AssetRegistry', () => {
  it('getColor 应返回 colors.json 中配置的色值（hex 转 number）', () => {
    expect(AssetRegistry.getColor('tile.red')).toBe(0xe74c3c);
    expect(AssetRegistry.getColor('player.blue')).toBe(0x2980b9);
  });
  it('getColor 找不到 key 时返回默认色 0xffffff 并控制台警告', () => {
    expect(AssetRegistry.getColor('not.exist')).toBe(0xffffff);
  });
  it('hasTexture 在路径为空字符串时返回 false', () => {
    expect(AssetRegistry.hasTexture('character.red')).toBe(false);
    expect(AssetRegistry.hasTexture('skill.rocket.icon')).toBe(false);
  });
  it('getTexturePath 返回清单中的原始路径字符串（用于 BootScene 预加载）', () => {
    expect(AssetRegistry.getTexturePath('character.red')).toBe('');
  });
});
```

**Step 3: 实现 src/render/AssetRegistry.ts**

要点：
- 用静态类（或单例 export）暴露 `getColor / hasTexture / getTexturePath / listAllTextureKeys`
- 启动时静态 import 所有 `assets/*.json`，扁平化成 `Map<string, string>`（key 形如 `tile.red`、`skill.rocket.projectile`）
- `getColor`：从扁平 map 取 `tile.*` / `player.*` / `ui.*` 段，hex 字符串转 number
- `hasTexture`：路径非空字符串才返回 true
- `getTexturePath`：返回原始字符串，BootScene 用它做 `this.load.image(key, path)`
- `listAllTextureKeys()`：BootScene 启动时遍历加载用

**Step 4: 验证**

Run: `npm test -- AssetRegistry`
Expected: 4 tests PASS

Run: `npm run check:purity`
Expected: PASS（AssetRegistry 在 render/ 下，不参与 core 纯度检查）

**Step 5: Commit**

```bash
git add . && git commit -m "feat(render): AssetRegistry 资源层骨架（颜色 + 空图片清单）"
```

---

# 阶段 1：地图 + 单角色移动 + 染色

**目标：** 浏览器看到 16×10 米色格子地图，WASD 控制 1 个红色角色移动，走过的格子变红。

**为什么先做这步：** 地图、移动、染色是所有玩法的基石。先保证这三件事正确，后续才能层层叠加。每一步都肉眼可见。

### 任务 1.1：实现纯逻辑 GameState（无 Phaser）

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/GameState.ts`
- Create: `tests/core/GameState.test.ts`

**Step 1: 写测试** (`tests/core/GameState.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/core/GameState';
describe('GameState', () => {
  it('应初始化 16×10 米色格子', () => {
    const s = createInitialState();
    expect(s.tiles.length).toBe(10);
    expect(s.tiles[0].length).toBe(16);
    expect(s.tiles[0][0].color).toBe('neutral');
  });
  it('应在四边中点生成 4 个玩家并染色出生点', () => {
    const s = createInitialState();
    expect(s.players.length).toBe(4);
    const [p0,p1,p2,p3] = s.players;
    // 上中、下中、左中、右中
    expect(s.tiles[Math.floor(p0.pos.y)][Math.floor(p0.pos.x)].color).toBe(p0.color);
  });
});
```

**Step 2: 运行让其失败**
Run: `npm test -- GameState`
Expected: FAIL（文件不存在）

**Step 3: 实现 src/core/types.ts**

```ts
export type Color = 'neutral' | 'red' | 'blue' | 'yellow' | 'green';
export interface Vec2 { x: number; y: number; }
export interface Tile { color: Color; lastPaintedTick: number; }
export interface Player {
  id: number; color: Color; pos: Vec2; facing: Vec2;
  /** 踏敌减速 debuff 截止 tick（含），state.tick < slowUntilTick 时减速；初始 0 = 无 debuff */
  slowUntilTick: number;
  // 后续阶段扩展：dashCooldown, skillSlot, statusEffects 等
}
export interface GameState {
  tick: number;
  tiles: Tile[][]; // [row][col]
  players: Player[];
  matchTimeRemaining: number; // 秒
}
export interface PlayerIntent {
  playerId: number;
  moveDir: Vec2;     // 单位向量，或 (0,0) 表示不动
  dash: boolean;
  useSkill: boolean;
}
```

**Step 4: 实现 src/core/GameState.ts**

```ts
import gameCfg from '@/config/game.json';
import { Color, GameState, Tile, Player } from './types';

export function createInitialState(): GameState {
  const W = gameCfg.mapWidth, H = gameCfg.mapHeight;
  const tiles: Tile[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => ({ color: 'neutral' as Color, lastPaintedTick: -1 })));
  const colors: Color[] = ['red', 'blue', 'yellow', 'green'];
  // 上中、下中、左中、右中（坐标取格子中心，避免边界精度问题）
  const spawns = [
    { x: W/2, y: 0.5 }, { x: W/2, y: H - 0.5 },
    { x: 0.5, y: H/2 }, { x: W - 0.5, y: H/2 }
  ];
  const players: Player[] = colors.map((color, i) => ({
    id: i, color, pos: spawns[i], facing: { x: 0, y: 1 }
  }));
  // 出生点立即染色
  for (const p of players) {
    tiles[Math.floor(p.pos.y)][Math.floor(p.pos.x)].color = p.color;
  }
  return { tick: 0, tiles, players, matchTimeRemaining: gameCfg.matchDurationSec };
}
```

**Step 5: 运行验证通过**
Run: `npm test -- GameState`
Expected: PASS

**Commit:** `feat(core): 实现 GameState 初始化与类型定义`

### 任务 1.2：实现移动 + 染色纯函数

**Files:**
- Create: `src/core/movement.ts`
- Create: `tests/core/movement.test.ts`

**Step 1: 写测试**

```ts
// tests/core/movement.test.ts
import { describe, it, expect } from 'vitest';
import { applyMovement } from '@/core/movement';
import { createInitialState } from '@/core/GameState';

describe('applyMovement', () => {
  it('玩家向右移动应改变位置并染色新格子', () => {
    const s = createInitialState();
    const p = s.players[0]; const oldX = p.pos.x;
    applyMovement(s, { playerId: 0, moveDir: {x:1,y:0}, dash:false, useSkill:false }, 1/60);
    expect(p.pos.x).toBeGreaterThan(oldX);
  });
  it('进入新格子时染色为玩家颜色', () => {
    const s = createInitialState();
    const p = s.players[0];
    // 模拟连续移动直到跨过格子
    for (let i = 0; i < 60; i++)
      applyMovement(s, { playerId:0, moveDir:{x:1,y:0}, dash:false, useSkill:false }, 1/60);
    const cellX = Math.floor(p.pos.x);
    expect(s.tiles[Math.floor(p.pos.y)][cellX].color).toBe(p.color);
  });
  it('不能越过地图边界', () => {
    const s = createInitialState();
    const p = s.players[0];
    for (let i = 0; i < 1000; i++)
      applyMovement(s, { playerId:0, moveDir:{x:-1,y:0}, dash:false, useSkill:false }, 1/60);
    expect(p.pos.x).toBeGreaterThanOrEqual(0);
  });
  it('踏入敌色格子时获得减速 debuff（移动距离减少 15%）', () => {
    const s = createInitialState();
    const p = s.players[0];
    // 把目标格子染成敌方颜色
    s.tiles[Math.floor(p.pos.y)][Math.floor(p.pos.x)+1].color = 'blue';
    // 连续推进直到跨入敌色格
    for (let i = 0; i < 30; i++)
      applyMovement(s, { playerId:0, moveDir:{x:1,y:0}, dash:false, useSkill:false }, 1/60);
    // 已在敌色格内，下一 tick 应以减速速率前进
    const before = p.pos.x;
    applyMovement(s, { playerId:0, moveDir:{x:1,y:0}, dash:false, useSkill:false }, 1/60);
    expect(p.pos.x - before).toBeCloseTo(playerCfg.moveSpeed * playerCfg.coverSlowFactor / 60, 5);
  });
  it('debuff 带尾巴：离开敌色格后剩余时间内仍减速', () => {
    // 触发一次踏敌 debuff，再立即踏回己色，期间速度仍为减速值
    // 详见实现：state.tick < p.slowUntilTick 即减速
  });
  it('debuff 不叠加：连续踏入多个敌色格只刷新计时器到 0.5s，最长仍只持续 0.5s', () => {
    // 第二次踏敌后剩余时间 = coverSlowDurationTicks，不是累加
  });
  it('debuff 超时后恢复全速', () => {
    // 触发 debuff 后空走 0.5s 以上，应回到全速 moveSpeed/60
  });
});
```

**Step 2: 实现 src/core/movement.ts**

```ts
import { GameState, PlayerIntent } from './types';
import playerCfg from '@/config/player.json';
import gameCfg from '@/config/game.json';

export function applyMovement(state: GameState, intent: PlayerIntent, dt: number) {
  const p = state.players[intent.playerId];
  if (intent.moveDir.x === 0 && intent.moveDir.y === 0) return;

  // 归一化方向
  const mag = Math.hypot(intent.moveDir.x, intent.moveDir.y);
  const dx = intent.moveDir.x / mag, dy = intent.moveDir.y / mag;

  // 当前 debuff 状态（带尾巴语义：state.tick < slowUntilTick 即减速）
  const slowed = state.tick < p.slowUntilTick;
  const speed = playerCfg.moveSpeed * (slowed ? playerCfg.coverSlowFactor : 1);

  let nx = p.pos.x + dx * speed * dt;
  let ny = p.pos.y + dy * speed * dt;

  // 边界夹紧
  nx = Math.max(0, Math.min(gameCfg.mapWidth - 0.001, nx));
  ny = Math.max(0, Math.min(gameCfg.mapHeight - 0.001, ny));

  // 进入新格子触发染色 + 踏敌检查（刷新计时器至满，不叠加）
  const cx = Math.floor(p.pos.x), cy = Math.floor(p.pos.y);
  const newCx = Math.floor(nx), newCy = Math.floor(ny);
  if (newCx !== cx || newCy !== cy) {
    const t = state.tiles[newCy][newCx];
    if (t.color !== 'neutral' && t.color !== p.color) {
      // 踏入敌色：刷新 debuff 至满（不叠加 → 直接覆盖剩余）
      p.slowUntilTick = state.tick + playerCfg.coverSlowDurationTicks;
    }
    t.color = p.color;
    t.lastPaintedTick = state.tick;
  }

  p.pos.x = nx; p.pos.y = ny;
  p.facing = { x: dx, y: dy };
}
```

**Step 3: 运行验证**
Run: `npm test -- movement`
Expected: 全部测试 PASS

**Commit:** `feat(core): 实现 movement 纯函数（含边界、染色、踏敌减速 debuff）`

### 任务 1.3：实现 GameLoop + Phaser 渲染层

**Files:**
- Create: `src/core/EventBus.ts`
- Create: `src/single/GameLoop.ts`
- Create: `src/scenes/MatchScene.ts`
- Create: `src/render/MapRenderer.ts`
- Create: `src/render/PlayerRenderer.ts`
- Create: `src/input/KeyboardInput.ts`
- Modify: `src/main.ts`

**Step 1: src/core/EventBus.ts**（极简事件总线）

```ts
type Handler = (...args: any[]) => void;
export class EventBus {
  private map = new Map<string, Set<Handler>>();
  on(e: string, h: Handler) { (this.map.get(e) ?? this.map.set(e, new Set()).get(e)!).add(h); }
  emit(e: string, ...args: any[]) { this.map.get(e)?.forEach(h => h(...args)); }
}
```

**Step 2: src/single/GameLoop.ts**

```ts
import { GameState, PlayerIntent } from '@/core/types';
import { createInitialState } from '@/core/GameState';
import { applyMovement } from '@/core/movement';
import { EventBus } from '@/core/EventBus';
import gameCfg from '@/config/game.json';

export class GameLoop {
  state: GameState;
  bus = new EventBus();
  private intents = new Map<number, PlayerIntent>();
  private dt = 1 / gameCfg.tickRate;
  private accumulator = 0;

  constructor() { this.state = createInitialState(); }
  setIntent(intent: PlayerIntent) { this.intents.set(intent.playerId, intent); }

  update(realDt: number) {
    this.accumulator += realDt;
    while (this.accumulator >= this.dt) {
      this.tick();
      this.accumulator -= this.dt;
    }
  }
  private tick() {
    for (const [, intent] of this.intents) applyMovement(this.state, intent, this.dt);
    this.state.tick++;
    this.bus.emit('tick', this.state);
  }
}
```

**Step 3: src/render/MapRenderer.ts**

通过 `AssetRegistry` 查颜色，禁止硬编码色值。后续若 `tiles.json` 填了图片路径，可扩展为 sprite 渲染。

```ts
import Phaser from 'phaser';
import { GameState, Color } from '@/core/types';
import { AssetRegistry } from './AssetRegistry';

export class MapRenderer {
  private rects: Phaser.GameObjects.Rectangle[][] = [];
  constructor(scene: Phaser.Scene, state: GameState, public tileSize = 40) {
    for (let r = 0; r < state.tiles.length; r++) {
      this.rects[r] = [];
      for (let c = 0; c < state.tiles[0].length; c++) {
        const color = AssetRegistry.getColor(`tile.${state.tiles[r][c].color}`);
        const rect = scene.add.rectangle(
          c*tileSize + tileSize/2, r*tileSize + tileSize/2,
          tileSize-2, tileSize-2, color
        );
        this.rects[r][c] = rect;
      }
    }
  }
  sync(state: GameState) {
    for (let r = 0; r < state.tiles.length; r++)
      for (let c = 0; c < state.tiles[0].length; c++)
        this.rects[r][c].fillColor = AssetRegistry.getColor(`tile.${state.tiles[r][c].color}`);
  }
}
```

> **后续接入图片：** 当 `tiles.json` 中 `red` 字段填了路径，渲染层可在 `hasTexture('tile.red')` 时改用 `scene.add.image`。本阶段先不实现，仅预留判断点。

**Step 4: src/render/PlayerRenderer.ts**

同样走 `AssetRegistry`，并预留 sprite 分支：

```ts
import Phaser from 'phaser';
import { GameState } from '@/core/types';
import { AssetRegistry } from './AssetRegistry';

export class PlayerRenderer {
  private sprites: (Phaser.GameObjects.Arc | Phaser.GameObjects.Image)[] = [];
  constructor(scene: Phaser.Scene, state: GameState, public tileSize = 40) {
    for (const p of state.players) {
      const key = `character.${p.color}`;
      if (AssetRegistry.hasTexture(key)) {
        // 后期接入图片时走这条分支
        this.sprites.push(scene.add.image(0, 0, key).setDisplaySize(tileSize*0.8, tileSize*0.8));
      } else {
        const color = AssetRegistry.getColor(`player.${p.color}`);
        this.sprites.push(scene.add.circle(0, 0, tileSize*0.4, color).setStrokeStyle(2, 0x000));
      }
    }
  }
  sync(state: GameState) {
    state.players.forEach((p, i) => {
      this.sprites[i].x = p.pos.x * this.tileSize;
      this.sprites[i].y = p.pos.y * this.tileSize;
    });
  }
}
```

**Step 5: src/input/KeyboardInput.ts**

```ts
import Phaser from 'phaser';
import { PlayerIntent } from '@/core/types';
export class KeyboardInput {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  constructor(scene: Phaser.Scene, public playerId: number) {
    const kb = scene.input.keyboard!;
    this.keys = {
      W: kb.addKey('W'), A: kb.addKey('A'), S: kb.addKey('S'), D: kb.addKey('D'),
      SPACE: kb.addKey('SPACE'), J: kb.addKey('J')
    };
  }
  poll(): PlayerIntent {
    let dx = 0, dy = 0;
    if (this.keys.A.isDown) dx -= 1;
    if (this.keys.D.isDown) dx += 1;
    if (this.keys.W.isDown) dy -= 1;
    if (this.keys.S.isDown) dy += 1;
    return {
      playerId: this.playerId,
      moveDir: { x: dx, y: dy },
      dash: Phaser.Input.Keyboard.JustDown(this.keys.SPACE),
      useSkill: Phaser.Input.Keyboard.JustDown(this.keys.J)
    };
  }
}
```

**Step 6: src/scenes/MatchScene.ts**

```ts
import Phaser from 'phaser';
import { GameLoop } from '@/single/GameLoop';
import { MapRenderer } from '@/render/MapRenderer';
import { PlayerRenderer } from '@/render/PlayerRenderer';
import { KeyboardInput } from '@/input/KeyboardInput';

export class MatchScene extends Phaser.Scene {
  private loop!: GameLoop;
  private mapR!: MapRenderer;
  private playerR!: PlayerRenderer;
  private input1!: KeyboardInput;
  constructor() { super('Match'); }
  create() {
    this.loop = new GameLoop();
    this.mapR = new MapRenderer(this, this.loop.state);
    this.playerR = new PlayerRenderer(this, this.loop.state);
    this.input1 = new KeyboardInput(this, 0);
  }
  update(_t: number, deltaMs: number) {
    this.loop.setIntent(this.input1.poll());
    this.loop.update(deltaMs / 1000);
    this.mapR.sync(this.loop.state);
    this.playerR.sync(this.loop.state);
  }
}
```

**Step 7: 修改 src/main.ts** 引入 MatchScene

```ts
import Phaser from 'phaser';
import { MatchScene } from '@/scenes/MatchScene';
new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: 16*40, height: 10*40,
  backgroundColor: '#222', scene: [MatchScene]
});
```

**Step 8: 验证**

Run: `npm run dev`
Expected:
- 看到 16×10 米色格子地图
- 看到 4 个圆形角色（暂时只能控制红色那个，其他 3 个静止）
- WASD 控制红色角色移动
- 走过的格子变红
- 走到边界停下来

Run: `npm run check:purity`
Expected: PASS

**Commit:** `feat: 阶段1 完成——地图渲染 + 玩家移动 + 染色`

---

# 阶段 2：完整移动系统

**目标：** 多人碰撞、踏敌减速 debuff 可视化（数值已实现，需做手动检查）。

### 任务 2.1：玩家碰撞 + 无敌帧

**Files:**
- Create: `src/core/collision.ts`
- Create: `tests/core/collision.test.ts`
- Modify: `src/core/types.ts` (Player 增加 `collisionInvulnUntilTick`)
- Modify: `src/single/GameLoop.ts`（在 movement 之后调用 collision）

**Step 1: 测试** — 两个玩家面对面接触应互相后退 0.2 格

**Step 2: 实现 applyCollisions(state)**：遍历玩家两两组合，圆形碰撞（半径 0.4），后退 0.2 格沿连线相反方向，记录无敌帧。

**Step 3: 验证：** 单测 + 浏览器手动碰撞 4 角色

**Commit:** `feat(core): 玩家碰撞与无敌帧`

### 任务 2.2：踏敌减速 debuff 可视化

**Files:**
- Modify: `src/render/PlayerRenderer.ts`：当玩家处于减速 debuff 期间（`state.tick < p.slowUntilTick`）角色描边变红色

**验证：** 浏览器观察踏入敌色格时角色边框变红，离开敌色后红边持续约 0.5 秒再消退

**Commit:** `feat(render): 踏敌减速 debuff 可视化反馈`

---

# 阶段 3：冲刺系统

**目标：** 空格冲刺 3 格，CD 5 秒，途经不染色，仅终点染色。

### 任务 3.1：核心冲刺逻辑

**Files:**
- Create: `src/core/dash.ts`
- Create: `tests/core/dash.test.ts`
- Modify: `src/core/types.ts` (Player 增加 `dashState: { phase: 'idle'|'dashing'|'cooldown', timer: number }`)
- Modify: `src/single/GameLoop.ts`

**测试覆盖：**
- 按下空格进入 dashing，0.2 秒内移动 3 格
- 沿途格子不染色，仅终点染色
- CD 5 秒，期间再按无效
- dashing 期间不能转向、不能再按 dash
- dashing 不受 movement 系统影响（独立分支）

**Commit:** `feat(core): 冲刺系统（CD/位移/终点染色）`

### 任务 3.2：冲刺视觉反馈

**Files:**
- Modify: `src/render/PlayerRenderer.ts`：dashing 期间画拖尾；冷却期间在角色脚下画进度环

**验证：** 浏览器空格冲刺看到拖尾，再按观察 5 秒冷却环

**Commit:** `feat(render): 冲刺拖尾与冷却环`

---

# 阶段 4：4 角色同场 + 简单 AI

**目标：** 玩家 vs 3 个简单 AI（随机走 + 偶尔冲刺），可全程观战。

### 任务 4.0：BootScene 资源预加载

**目标：** 在 MatchScene 之前插入一个引导场景，统一遍历 `AssetRegistry` 的图片清单，把所有非空路径预加载。当前清单全为空字符串时秒过；后续接入图片不动业务代码。

**Files:**
- Create: `src/scenes/BootScene.ts`
- Modify: `src/main.ts`（场景列表改为 `[BootScene, MatchScene]`，启动 BootScene）

**Step 1: 实现 BootScene**

要点：
- `preload()` 阶段调用 `AssetRegistry.listAllTextureKeys()` 拿到所有 `(key, path)`，仅对路径非空的调用 `this.load.image(key, path)`
- `create()` 中 `this.scene.start('Match')`
- 路径非空但加载失败（404）时记录 warning，不阻塞流程（继续走 fallback）

**Step 2: 修改 src/main.ts**

```ts
import Phaser from 'phaser';
import { BootScene } from '@/scenes/BootScene';
import { MatchScene } from '@/scenes/MatchScene';
new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: 16*40, height: 10*40,
  backgroundColor: '#222', scene: [BootScene, MatchScene]
});
```

**Step 3: 验证**

Run: `npm run dev`
Expected:
- 浏览器打开后 BootScene 秒过（清单全空），直接进入 MatchScene
- 渲染效果与阶段 1~3 完全一致（仍是色块 + 圆形）
- 手动在 `src/config/assets/characters.json` 把 `"red"` 字段改成一个真实图片路径（放一张 PNG 到 `src/assets/images/characters/`），刷新浏览器后红色玩家变图片，其他三个仍是圆形。完成测试后改回 `""`。

**Commit:** `feat(scenes): BootScene 资源预加载入口`

---

### 任务 4.1：AI 模块骨架 + Easy 配置

**Files:**
- Create: `src/ai/AIController.ts`
- Create: `src/ai/AIContext.ts`
- Create: `src/config/ai/easy.json`
- Create: `tests/ai/AIController.test.ts`

**Easy 配置（仅本阶段需要的字段）：**

```json
{
  "decisionInterval": 800,
  "pathRandomness": 0.7,
  "dashChancePerSec": 0.2,
  "dashTargetPriority": "random"
}
```

**AIController 接口：**

```ts
export class AIController {
  constructor(public playerId: number, public config: AIConfig) {}
  decide(state: GameState, dt: number): PlayerIntent;
}
```

**简单 AI 行为：** 每 800ms 重新选一个方向（地图内随机点），中途朝该点移动；每 5 秒 CD 内有 20% 概率冲刺一次。

**测试：** 同样的 state，简单 AI 决策结果应有 70%+ 路径随机性（方差检测）。

**Step 4: 集成到 MatchScene** — 玩家 0 用键盘，玩家 1/2/3 用 AIController。

**验证：** 浏览器看 4 角色都在动，地图染色变化。**手动测试 5 分钟**，玩家挑战 3 个简单 AI 完整跑一局（不结算先）。

**Commit:** `feat(ai): Easy AI 与多角色同场`

---

# 阶段 5：60 秒倒计时 + 计分 + 结算

**目标：** 完整一局流程：开始 → 60 秒计时 → 结束 → 显示分数与排名。

### 任务 5.1：计时与状态机

**Files:**
- Modify: `src/core/types.ts` 增加 `matchPhase: 'playing' | 'ended'`
- Modify: `src/single/GameLoop.ts` — 每 tick 减少 `matchTimeRemaining`，归零切到 `ended`
- Create: `src/core/scoring.ts` 提供 `computeScores(state): { color, count, lastPaintedTick }[]`

**测试：** 3600 ticks 后 phase 变为 ended；computeScores 按 count 降序、count 相同时按 lastPaintedTick 倒序。

**Commit:** `feat(core): 计时、阶段状态机与计分`

### 任务 5.2：HUD + 结算面板

**Files:**
- Create: `src/render/HUD.ts`：顶部显示倒计时与 4 色实时分数
- Create: `src/render/ResultPanel.ts`：结算时遮罩 + 1~4 名

**验证：** 完整跑一局 60 秒，结束后看到排名面板。

**Commit:** `feat(render): HUD 与结算面板`

---

# 阶段 6：技能系统框架 + 7 个技能（本版本最终技能集）

**目标：** 实现拾取/持有/释放架构 + 7 个技能（火箭、极速、护盾、激光、涂刷、星星、炸弹）。

**为什么是这 7 个：** 本版本只用纯程序动画（Phaser 图元 + tween + 粒子），不依赖帧动画/精美贴图。这 7 个技能在纯程序动画下都能做到"可读、可识别、有反馈感"；剩余 5 个（涟漪、种子、标记、回溯、霸体）暂缓——见本阶段末尾的 **未来扩展** 小节。

**技能分两组分批实现，组内逐个 TDD：**

- **6.3 第一组（5 个无复杂状态副作用，先打通"加载-持有-释放-销毁"全流程）：** 火箭、极速、护盾、激光、涂刷
- **6.4 第二组（2 个需要区域效果扩展）：** 星星、炸弹

**7 技能博弈维度覆盖：**
- 控制：火箭（眩晕）
- 增益：极速（移速）、涂刷（染色宽度）
- 防守：护盾（不可覆盖）
- 进攻：激光（前向半行/半列染色）
- 干扰：星星（清最多色）、炸弹（区域清色）

### 任务 6.1：技能注册系统

**Files:**
- Create: `src/core/skills/types.ts` — `Skill` 接口（id, type, onCast(state, casterId)）
- Create: `src/core/skills/registry.ts` — `registerSkill / getSkill`
- Create: `src/core/skills/index.ts` — 导出注册入口
- Create: `src/config/skills.json` — 7 个本版本技能数值（其余 5 个仍保留条目以避免破坏配置结构，但不注册到 registry）
- Modify: `src/core/types.ts` Player 增加 `skillSlot: { id: SkillId, used: boolean } | null`

```json
// skills.json (示例片段)
{
  "rocket": { "speed": 8, "stunSec": 1, "directions": 8 },
  "speed":  { "multiplier": 2, "durationSec": 3 },
  "shield": { "radius": 1, "durationSec": 5 },
  "laser":  {},
  "roller": { "width": 3, "durationSec": 3 },
  "star":   { "tilesToClear": 5 },
  "bomb":   { "delaySec": 2, "radius": 2 }
  // future（不在本版本注册）：seed / ripple / mark / rewind / charge（霸体）
}
```

### 任务 6.2：道具刷新系统

**Files:**
- Create: `src/core/skills/pickups.ts`
- Create: `src/config/pickups.json`
- Create: `tests/core/pickups.test.ts`

**测试：** 第 10/20/30/40/50 秒各刷 2 个；区域类技能刷新限制（已有活跃区域时不刷）；不刷在玩家脚下；玩家踩到自动入槽；**踩到新道具时无论当前槽位为空/亮/灰，都直接替换为新技能（旧技能消失），新技能进入槽位状态为亮（used=false）**；**同一次刷新出来的 2 个道具不能撞 id（`pickSkillId` 接受 `excludeIds`，主循环维护 `usedIds` 集合；与区域类回退共存：先按 `excludeIds + areaAllowed` 过滤候选池再等概率取）**。

**池配置：** `pickups.json` 的可刷池仅包含本版本 8 个技能 ID，不含 future 4 个。

**Commit:** `feat(core): 技能注册与刷新系统`

### 任务 6.3：实现第一组 5 个技能（逐个 TDD）

每个技能一个子任务：先写测试，再实现，再加视觉。

> **资源外置约定（阶段 6 所有技能子任务通用）：**
> 1. 技能图标和特效图都通过 `AssetRegistry` 查询，**禁止在 Renderer 写死路径或颜色**
> 2. `src/config/assets/skills.json` 的对应条目已在任务 0.4 留好（路径为空），子任务里**只新增 effect 字段**（如有需要），不删条目
> 3. Renderer 渲染时统一模式：`hasTexture(key) ? scene.add.image(key) : 几何图元 fallback`
> 4. 颜色一律走 `AssetRegistry.getColor('player.<color>')`，不要写 hex
> 5. **本版本动画规则：** 仅使用 Phaser 图元（圆/矩形/线/文字）+ tween + 内置粒子 + camera shake，**不引入帧动画 / 精美贴图依赖**

#### 6.3.1 火箭
- 测试：8 方向各发射一颗，飞 8 格/秒，命中玩家眩晕 1 秒，飞出边界消失
- 增加 `state.projectiles[]`、`state.statusEffects[]`（眩晕字段）
- **资源登记：** `assets/skills.json` 的 `rocket` 已有 `icon` 和 `projectile` 字段，无需新增
- Renderer fallback：8 个小三角向外飞（颜色取 `getColor('player.<color>')`，朝向跟随方向旋转）；命中时目标圆闪红，头顶冒"💫"文字 1 秒

#### 6.3.2 极速
- 测试：玩家 statusEffect.speed 起效，3 秒后失效，期间 speed×2
- Modify movement.ts 读取 statusEffect
- **资源登记：** 在 `assets/skills.json` 的 `speed` 条目新增 `"trail": ""` 字段（拖尾特效图占位）
- Renderer fallback：每 2 帧克隆一个半透明圆放在上一帧位置，alpha tween 到 0 后销毁（残影效果）

#### 6.3.3 护盾
- 测试：3×3 自己格子标记 shielded，5 秒后失效；其他玩家踩上不染色
- 增加 `tile.shieldUntilTick`
- Modify movement.ts 染色前检查 shield
- **资源登记：** 在 `assets/skills.json` 的 `shield` 条目新增 `"bubble": ""`（气泡光罩图占位）
- Renderer fallback：3×3 半透明白色矩形覆盖层 + 边框描边 alpha 呼吸 tween（loop）

#### 6.3.4 激光
- 测试：根据 facing 量化为上/下/左/右，从脚下格沿朝向到边界的半行/半列染色（含脚下格、身后保留原色），跳过护盾格
- **资源登记：** 在 `assets/skills.json` 的 `laser` 条目新增 `"beam": ""`（光束图占位）
- Renderer fallback：从角色出发沿朝向画一条横/竖矩形（颜色 `getColor('player.<color>')`），scale 从 0 → 1 快速拉伸 + alpha 1 → 0 淡出（200ms）

#### 6.3.5 涂刷
- 测试：3 秒内 movement 触发染色时连同左右相邻格染色
- Modify movement.ts：检查 statusEffect.roller 时触发宽染色
- **资源登记：** 在 `assets/skills.json` 的 `roller` 条目新增 `"brush": ""`（滚筒图占位）
- Renderer fallback：角色前方画一个 3 格宽矩形指示框，跟随 facing 旋转，半透明色

**每个子任务都要：**
1. 单测覆盖核心逻辑
2. 在 `assets/skills.json` 完成资源条目登记（保持路径为 `""`）
3. Renderer 实现 `hasTexture` 判断分支（fallback 用图元 + `getColor`）
4. 浏览器手动测试：捡到 → 释放 → 看到效果（fallback 状态下也必须可识别）
5. Commit `feat(skill): xxx`

### 任务 6.4：实现第二组 2 个技能（逐个 TDD）

**关键依赖项预先实现：**

#### 任务 6.4.0：扩展 statusEffect 系统

支持本版本需要的状态：`stunned, speed, roller`。

> **future 状态（不在本版本实现）：** `rooted`（涟漪定身）、`marked`（标记）、`charge`（霸体）。结构层面 `statusEffect` 字段保留可扩展性即可，无需提前注册类型。

#### 任务 6.4.1：扩展 GameState 支持区域效果

```ts
interface AreaEffect {
  id: string;
  type: 'shield' | 'bomb';     // 本版本仅这两种；future: 'seed'
  ownerId: number;
  centerX: number; centerY: number;
  expireAtTick: number;
  // 各类型特有数据
}
state.areaEffects: AreaEffect[]
```

#### 6.4.2 星星
- 测试：统计全图最多色 → 随机选 5 格变米色（瞬发，无 statusEffect / areaEffect）
- **资源登记：** 在 `assets/skills.json` 的 `star` 条目新增 `"sparkle": ""`
- Renderer fallback：5 个被清除的格子先 flash 白色（scale 1 → 1.3 → 1 + 颜色叠加白）然后 tween 回米色（150ms 内完成）

#### 6.4.3 炸弹
- **定位（与玩法规则对齐）：** 干扰类技能 —— 区域清色（变米色），**不影响玩家移动（无眩晕）**
- 测试：放置位置生成一个 `bomb` AreaEffect，2 秒后引爆，引爆瞬间将 5×5（radius=2）范围内所有非米色格子清为米色（neutral，含自己/他人颜色一并清除，跳过护盾格），引爆后 AreaEffect 移除
- **资源登记：** `assets/skills.json` 的 `bomb` 已有 `explosion` 字段
- Renderer fallback：
  - 倒计时阶段：在中心格画一个 1 格大小的红圆，radius scale tween 在 0.8 ↔ 1.0 之间循环（脉冲），最后 0.5 秒频率加快
  - 引爆瞬间：白色圆 scale 0 → 5 + alpha 1 → 0（300ms）作为冲击波（程序动画 fallback，对应玩法规则中的"爆炸烟尘"）；同时 camera 微震 100ms

#### 6.4.4 霸体

> **已移至"未来扩展"，本版本不实现。** 原因：单机模式下无手动配置入口（技能依赖随机拾取），且其价值依赖"被冲刺/碰撞命中"的低频场景，肉眼测试和自动验证都难以稳定复现；联机多人模式下才有战术意义。详见本阶段末尾"未来扩展"表格。

**第二组每个子任务同样按 5 步走（测试 → 实现 → 资源登记 → 渲染分支 → 浏览器手测 → commit）。**

**阶段 6 验证：** 浏览器一局完整跑 60 秒，期间 7 种技能至少各释放一次，效果正确（即便所有图片字段为空，靠图元也能玩通）。

**Commit（阶段收尾）：** `feat(skill): 阶段 6 完成——7 技能完整可玩`

---

## 未来扩展：暂缓的 5 个技能（future）

以下 5 个技能因纯程序动画难以呈现核心观感、或单机模式下难以测试，**本版本不实现**，待后续接入帧动画/粒子/shader 资源、或进入联机版本后再单独安排阶段：

| 技能 | 暂缓原因 | 后续依赖 |
|------|----------|----------|
| **涟漪** | 程序只能做"圆环扩大"，缺水波质感，且和炸弹冲击波视觉撞车；同时它需要"释放者定身 + 可被冲刺打断"的复杂交互 | 水波/液体粒子或 shader；`statusEffect.rooted`；与 `dash.ts` 的中断回调 |
| **种子** | "蔓延生长"程序表现弱，BFS 周期蔓延逻辑复杂 | 藤蔓帧动画或粒子系统；`AreaEffect.type='seed'` 周期 tick |
| **标记** | 程序能做（沙漏文字 + tween），但游戏价值依赖"玩家看到标记后的反应"，去掉不影响核心循环 | `statusEffect.marked` + 跨帧目标追踪 + 引爆判定 |
| **回溯** | 程序+美术都最难，且需要为每个 tile 维护 `paintHistory[]` 滚动窗口，开发成本高 | 时间倒流粒子/shader；`tile.paintHistory[]` 数据结构 |
| **霸体** | 单机模式下无手动配置入口（技能依赖随机拾取），效果依赖"被冲刺/碰撞命中"的低频场景，肉眼和自动测试都难以稳定复现；联机多人模式下被密集攻击时才有战术价值 | `statusEffect.charge`；冲刺/碰撞反弹分支（已在阶段 8 任务里 future 标注）；联机多人对战环境 |

**预留约束（避免后续大改）：**
- `Skill.type` 联合类型保留 `'ripple' | 'seed' | 'mark' | 'rewind' | 'charge'`，仅 registry 不注册
- `assets/skills.json` 保留这 5 个条目（路径全空），任务 0.4 已留好
- `AreaEffect.type` 联合类型保留 `'seed'`，本版本运行时不会出现该值
- `statusEffect` 字段结构保留可扩展性（不为 `rooted/marked/charge` 写专门分支即可）

---



# 阶段 8：抢夺机制 + 完整对抗

**目标：** 冲刺命中：抢技能 + 击退 + 硬直。

> **future（暂缓 5 技能引入后再加）：** 涟漪打断 / 标记交互 / 霸体反弹。本阶段不实现。

### 任务 8.1：冲刺命中处理

**Files:**
- Modify: `src/core/dash.ts` 增加碰撞检测（dashing 期间每 tick 检测与其他玩家相交）
- 增加 `applyDashHit(state, dasherId, targetId)` 实现击退、硬直、技能转移

**测试：**
- 冲刺命中持有技能玩家 → 技能转移到冲刺者，状态置为 used=false
- **冲刺命中持有"灰技能（used=true）"的玩家 → 同样被抢走，且转移后重置为亮（used=false）**
- 双方同时冲刺 → 互相穿过，不抢夺

> **future 测试用例（霸体落地后再加）：** 冲刺命中霸体玩家 → 冲刺者被反弹击退 + 硬直，霸体方不丢技能。
> **future 测试用例（涟漪/标记落地后再加）：** 涟漪释放期间被冲刺命中 → 定身解除，涟漪取消，技能转移。

### 任务 8.2：碰撞与冲刺的优先级

冲刺优先级 > 普通碰撞，dashing 玩家不与其他人触发碰撞反弹（仅触发 dashHit）。

阶段 8 验证：玩家可主动冲刺抢 AI 技能；AI 偶尔抢玩家技能（简单 AI 是随机冲刺，撞上就抢）。

**Commit:** `feat(core): 完整抢夺与对抗交互`

---

# 阶段 9：中等 AI

**目标：** 中等 AI 在 100 局对抗简单 AI 中胜率 ≥ 70%。

### 任务 9.1：决策模块拆分

**Files:**
- Create: `src/ai/decisions/MovementDecision.ts`
- Create: `src/ai/decisions/DashDecision.ts`
- Create: `src/ai/decisions/SkillDecision.ts`
- Create: `src/config/ai/medium.json`

每个 Decision 是纯函数 `evaluate(ctx, config) -> action | null`，单测覆盖。

**Medium 关键参数：** `decisionInterval=400, pathRandomness=0.3, preferNeutralTiles=true, dashTargetPriority='nearest', skillPositionAware=true, awarenessRadius=8, trackScores=true`

### 任务 9.2：AI 对战测试框架

**Files:**
- Create: `tests/ai/battle.test.ts`
- Create: `src/sim/HeadlessRunner.ts`（无渲染跑完整 60 秒局）

**测试：**

```ts
it('中等 AI 应在 50 局中至少胜过简单 AI 35 局', () => {
  let wins = 0;
  for (let i = 0; i < 50; i++) {
    const result = runHeadless({ players: ['medium', 'easy', 'easy', 'easy'], seed: i });
    if (result.winner === 0) wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(35);
});
```

阶段 9 验证：单测通过 + 浏览器实际玩感觉中等 AI 明显比简单 AI 强。

**Commit:** `feat(ai): Medium AI（评估决策）`

---

# 阶段 10：困难 AI

**目标：** 困难 AI vs 中等 AI 胜率 ≥ 65%。

### 任务 10.1：效用打分系统

**Files:**
- Create: `src/ai/scoring/UtilityScorer.ts`
- Create: `src/config/ai/hard.json`

候选行为：移动到米色聚集区 / 移动到敌方密集区 / 拾取技能 / 等待 CD / 释放技能 / 冲刺。每帧打分，取最高分行为执行。

### 任务 10.2：连招判断

困难 AI 拿到涟漪时：检查附近 3 格内是否有大片敌方区域，若有则等冲刺 CD 好后先冲过去再释放（最大化 25 格收益）。

### 任务 10.3：领先者针对策略

实时跟踪 4 人分数，落后时主动入侵第一名区域，领先时巡逻自己区域。

### 任务 10.4：对战测试

```ts
it('困难 AI 应在 50 局中至少胜过中等 AI 32 局', () => {
  let wins = 0;
  for (let i = 0; i < 50; i++) {
    const r = runHeadless({ players: ['hard', 'medium', 'medium', 'medium'], seed: i });
    if (r.winner === 0) wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(32);
});
```

阶段 10 验证：自动化测试通过 + 玩家手动玩"困难"难度感觉到明显挑战。

**Commit:** `feat(ai): Hard AI（效用 + 连招 + 局势）`

---

# 阶段 11：UI 与游戏循环

> **资源外置约定：** 本阶段所有 UI 元素的颜色走 `AssetRegistry.getColor('ui.*')`，按钮/HUD 背景图走 `hasTexture('ui.*')` 判断分支。fallback 用 Phaser 的 `text` + `rectangle`，保证缺图也能跑。

> **详细线框图与状态机参见 `docs/阶段11-UI草稿.md`，本节只列任务清单与关键约束。**

### 任务 11.1：主菜单

**Files:**
- Create: `src/scenes/MenuScene.ts`：标题 + 难度按钮（简单/中等/困难）+ 开始
- Create: `src/render/UIButton.ts`：通用按钮工具（Rectangle + Text，纯几何图元）

**资源使用：**
- 标题文字颜色：`getColor('ui.text')`
- 按钮背景：`hasTexture('ui.button.start') ? image : rectangle(getColor('ui.bg'))`
- 在 `assets/ui.json` 的 `button` 下补齐 `easy/medium/hard` 字段（路径留空）

**关键约束：**
- 难度类型直接复用 `Difficulty = 'easy' | 'medium' | 'hard'`，配置走 `src/config/ai/{easy,medium,hard}.json`，**不新建 `difficulty.json`**
- 控制器映射沿用 `HeadlessRunner.makeController` 的现有规则

### 任务 11.2：场景流转 + 结算按钮

`MenuScene` → `MatchScene(difficulty)` → 内嵌 `ResultPanel`（保留方案 A，不独立 ResultScene）→ 再来一局 / 返回菜单

**Files:**
- Modify: `src/render/ResultPanel.ts`：构造函数新增 `onRestart` / `onBackToMenu` 两个回调，加两个 UIButton
- Modify: `src/scenes/MatchScene.ts`：从 `init(data)` 接 `difficulty`，按映射规则实例化 AI；给 `ResultPanel` 注入回调（restart 用同 difficulty，back 切到 Menu）
- Modify: `src/main.ts`：注册 `MenuScene` 并设为初始场景

### 任务 11.3：GameHUD 重做（顶部 HUD + 底部 HUD）

> 替代现有 28px 单条 HUD。地图绘制起始 Y 从现状改为 80。

**Files:**
- Modify: `src/render/HUD.ts` → 重写为 `TopHUD`（倒计时 + 四方比分降序）
- Create: `src/render/BottomHUD.ts` → 容器，组合下面两个组件
- Create: `src/render/DashIndicator.ts` → 冲刺 CD 环
- Create: `src/render/PlayerSkillSlot.ts` → 玩家自身技能槽（区别于头顶 `SkillSlotRenderer`）
- Modify: `src/scenes/MatchScene.ts`：Tilemap 起始 Y 改为 80，挂载 `BottomHUD`

**关键约束 —— 技能槽视觉是三态 + 一个眩晕叠加层：**

| `displayPhase` | 数据条件 | 视觉 |
|----------------|----------|------|
| `empty` | `skillSlot === null` | 半透明灰框 alpha 0.3，无图标 |
| `active` | `{ used: false }` 且未眩晕 | 玩家色边框 + 亮图标 + 按键提示 + 缓 pulse |
| `disabled` | `{ used: false }` 且 `state.tick < player.stunUntilTick` | 在 active 上叠红色蒙版 + 斜线 |
| `spent` | `{ used: true }`（无论是否眩晕） | 灰 tint + 边框深灰 + alpha 0.5 + 无 pulse + 隐藏按键提示 |

**铁律：**
- `spent` 态**不会自动 fade 到 empty**，必须等数据真的变 `null`（被抢走 / 被覆盖 / 局末重置）
- `spent` 时**不**叠加 `disabled` 蒙版（本来就不可用，叠了反而引起认知噪声）
- 状态切换走 tween：`empty→active` pop-in、`active→spent` desaturate、`active↔disabled` 蒙版 fade、`spent/active→empty` fade-out

**测试要点（先 RED 后 GREEN）：**
- `tests/render/HUD.test.ts`：倒计时 60 → "1:00"；剩余 ≤10s 颜色切红；比分按降序排列
- `tests/render/DashIndicator.test.ts`：`idle` 满圆；`cooldown` 按 progress 渲染扇形；`dashing` 进入高亮分支
- `tests/render/PlayerSkillSlot.test.ts`：四个 displayPhase 的推导（含 `spent` 不叠 disabled 的负向断言）；按键提示在 `spent`/`empty` 态隐藏

阶段 11 验证：完整玩 5 局不重启浏览器，难度切换生效；所有 UI 颜色/资源都来自 `AssetRegistry`，代码内不出现 hex 字面量；技能槽四种 displayPhase 在手测中均可触发并视觉无歧义。

**Commit:** `feat: 完整游戏循环（菜单 → 对局 → 结算 + HUD 重做）`

---

# 阶段 12：开发者调参面板（仅开发模式）

**目标：** 通过 URL 参数 `?dev=1` 显示调参面板，实时改 `player.json`/`skills.json` 数值与 `assets/colors.json` 颜色并立即生效。

**Files:**
- Create: `src/dev/DevPanel.ts`：基于 dat.gui 或裸 DOM
- Modify: `src/main.ts`：根据 query 参数加载

**实现要点：**
- 配置都是 JSON，运行时改动 → 触发 `EventBus.emit('configChanged')` 或 `EventBus.emit('assetsChanged')`
- 各模块在用配置时通过 `getConfig()` 函数读取，不要在 import 时缓存
- `AssetRegistry` 内部颜色表也支持运行时刷新（重新读 JSON），渲染层订阅 `assetsChanged` 事件后重新 sync 颜色
- 面板分两栏：**数值**（speed/cooldown/skill 参数）+ **颜色**（4 玩家色 + 5 格子色 + UI 色）；颜色用 color picker

**Commit:** `feat(dev): 数值与颜色实时调参面板`

---

## 联机迁移路径（备忘）

完成本计划后，联机版只需：

1. **服务端（Node.js）：** 直接 import `src/core/` + `src/ai/` + `src/config/`，写一个新的 `src/server/GameLoop.ts`（替换单机版的 GameLoop）。
2. **客户端：** `KeyboardInput` 不再投递到本地 GameLoop，而是发送到服务端；服务端按 tick 广播 `GameState` 快照。
3. **预测/插值：** 客户端可基于 Intent 做本地预测（移动），收到权威快照后修正。
4. **AI：** 服务端跑 AI 即可（人机房）；难度配置共用 `src/config/ai/*.json`。

**当前计划交付物已经满足这些前提：** core 纯函数化、配置外置、Intent 模式、事件驱动渲染。

---

## 阶段间联调与回归测试

每个阶段结束都要执行：

1. `npm run check:purity` — core 纯度
2. `npm test:run` — 全量单测
3. **浏览器手动玩 1 局完整对局** — 主观体验回归（看到任何怪现象立即记录到 issue）
4. Commit 后 push（如有远端）

---

## 已知风险

| 风险 | 缓解 |
|------|------|
| Phaser update 频率不稳定 → 决定性破坏 | 用 accumulator 固定步长 tick |
| 7 个技能（含碰撞抢夺）交互复杂导致 bug 难定位 | 每技能独立 TDD + 阶段 6 每加一个完整跑局 |
| AI 难度调不出明显梯度 | 阶段 9/10 用 100 局对战胜率统计强制达标 |
| 联机迁移时发现 core 偷偷依赖了 Phaser | check-core-purity.mjs 在每次 commit 提示 |
| 数值调整需要改代码 | 阶段 12 提供调参面板 + 配置全部 JSON 化 |
| 美术资源后期接入要改一堆渲染代码 | 任务 0.4 引入 AssetRegistry，渲染层强制走 key 查询 + 图元 fallback；接入素材只改 `assets/*.json` |

---

> **执行说明：** 本计划共 12 个阶段（阶段 7 已合并入阶段 6，作为占位保留编号连续性）、约 55 个子任务。每个子任务遵循 **写测试 → 跑失败 → 实现 → 跑通过 → 提交** 的 TDD 节奏。每阶段结束都必须能在浏览器跑起来玩，绝不出现"连续几个阶段做中间件不可玩"的情况。
