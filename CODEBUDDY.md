# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## 项目简介

**SplatBrawl** 单机版 Demo：4 人乱斗（玩家 + 3 AI）、60 秒一局、地图染色玩法。当前处于阶段 0 末尾（脚手架 + 资源层骨架完成），完整路线图见 `docs/plans/2026-05-08-splatbrawl-singleplayer-demo.md`。玩法规则见 `docs/玩法规则.md`。

**Stack:** Phaser 3.70+ / TypeScript 5（strict）/ Vite 5 / Vitest 1 / 纯 JSON 配置。

## 常用命令

```bash
npm run dev            # Vite dev server，浏览器看效果（阻塞型，不要在工具调用里直接跑）
npm run build          # tsc 完整编译 + vite 生产构建
npm test               # Vitest watch 模式
npm run test:run       # Vitest 单次运行（CI / 验证用）
npm run typecheck      # tsc --noEmit，仅类型检查
npm run check:purity   # 校验 src/core 与 src/ai 不引用 phaser
```

**单测过滤：** `npm test -- <文件名片段> --run`，例如 `npm test -- AssetRegistry --run`。

**强制 TDD 节奏：** 写实现前先写失败测试 → 跑出 RED → 再实现 → GREEN。`docs/plans/...` 里每个任务都给了具体测试用例，按用例先落到 `tests/` 下再写 `src/`。

**提交前自检：** `npm run typecheck && npm run check:purity && npm run test:run` 三连过才提交。

## 核心架构

### 四层分离 + Intent 模式

四层之间是单向依赖，形成清晰的边界：

```
┌────────────────┐     ┌────────────────┐
│  src/input/    │     │   src/ai/      │
│  键鼠采集      │     │  AI 决策（纯）  │
└────────┬───────┘     └────────┬───────┘
         │  PlayerIntent        │  PlayerIntent
         ▼                      ▼
   ┌──────────────────────────────────┐
   │   src/core/  逻辑层（纯 TS）      │  ← applyIntent(state, intent, dt)
   │   GameState / Tile / Player /    │
   │   Skills / Rules / EventBus      │
   └─────────────────┬────────────────┘
                     │ 事件单向广播
                     ▼
        ┌────────────────────────┐
        │  src/render/ + scenes/ │  Phaser 渲染（订阅事件）
        └────────────────────────┘
```

**关键约束（违反即破坏联机复用计划）：**

1. **逻辑层零 Phaser 依赖**：`src/core/` 与 `src/ai/` 下任何 `.ts` 不得 `import 'phaser'`。`scripts/check-core-purity.mjs` 在每次提交前会扫描，违反即 exit 1。
2. **纯函数风格 + 确定性**：状态变更走 `applyIntent(state, intent, dt)` 形态；固定步长 `dt = 1/60s`；不依赖 `Date.now()` / `setTimeout`，便于联机重放与单测。
3. **Intent 模式**：玩家与 AI 都产出 `PlayerIntent { moveDir, dash, useSkill }`，每 tick 投递。联机时把 Intent 通过网络转发即可，不改逻辑层。
4. **事件驱动渲染**：`core/` 通过 `EventBus` 广播事件（`tile-painted` / `player-spawned` / ...），渲染层订阅并播动效；**禁止反向调用** —— Scene 不直接修改 GameState。
5. **配置外置**：所有数值从 `src/config/*.json` 读取，禁止源码里写魔法数。

### 联机复用分级（决定文件该放在哪个目录）

| 复用等级 | 路径 | 说明 |
|----------|------|------|
| **A 完全复用** | `src/core/` `src/ai/` `src/config/*.json` | 联机时直接搬到 Node.js 服务端 |
| **B 客户端独有** | `src/scenes/` `src/render/` `src/input/` `src/config/assets/` `src/assets/images/` | 联机时仅客户端使用 |
| **C 单机专用** | `src/single/GameLoop.ts` | 联机时整体替换为网络同步循环 |

**新增文件前先问自己：会不会被服务端用？** 答"会"放 `core/ai/config`；答"否"放 `scenes/render/input`；答"只有单机会用"放 `single`。

### 资源外置 —— AssetRegistry（`src/render/AssetRegistry.ts`）

渲染层**唯一**的颜色和图片入口。所有视觉资源走 key 查询：

- `getColor(key)` —— 颜色必填，缺失返回 `0xffffff` + `console.warn`。
- `hasTexture(key)` —— 路径空字符串返回 false，渲染层据此 fallback 到 `circle / rectangle` 等几何图元。
- `getTexturePath(key)` —— 给 BootScene 做 `this.load.image(key, path)` 用。

**Key 命名规范（来自 `src/config/assets/*.json` 扁平化）：**

| 类别 | Key 格式 | 示例 |
|------|----------|------|
| 颜色 | `<scope>.<name>` | `tile.red`、`player.blue`、`ui.bg` |
| 格子图 | `tile.<color>` | `tile.red` |
| 角色图 | `character.<color>` | `character.red` |
| 技能图标 | `skill.<id>.icon` | `skill.rocket.icon` |
| 技能特效 | `skill.<id>.<effect>` | `skill.bomb.explosion` |
| UI | `ui.<element>` | `ui.button.start` |

**注意：** 颜色 key 与 图片 key 走两套独立扁平 map（同名 `tile.red` 一个返 number 一个返路径），不冲突。

**资源管线"边做边接"：** 新视觉元素先在 JSON 里加 `""` 空路径条目 → 渲染层用 `hasTexture` 分支走图元 fallback → 后续找到素材改 JSON 里路径即可换皮，**不动一行代码**。

## 路径与构建配置

- **TS 路径别名：** `@/*` → `src/*`（见 `tsconfig.json` + `vite.config.ts` 的 `resolve.alias`）。所有 `import` 用 `@/...` 形式，不要相对路径上跳两级。
- **JSON 直接 import：** 已开启 `resolveJsonModule`，配置文件直接 `import gameCfg from '@/config/game.json'`。
- **Vitest 环境：** `happy-dom`（仅当用到 DOM 时启用，纯逻辑测试也能跑），`globals: true` —— 不用从 `vitest` 显式 `import { describe, it, expect }` 也可以，但项目目前显式 import，保持一致。
- **`vite.config.ts` 顶部必须保留 `/// <reference types="vitest" />`**，否则 strict 模式下 `test` 字段类型报错。

## 计划驱动开发

`docs/plans/2026-05-08-splatbrawl-singleplayer-demo.md` 是单一权威路线图（共 12 个阶段，每阶段必须可运行 + 可手动测试 + 单测覆盖）。执行新任务时：

1. 先读对应阶段任务节，里面已经写好 Files / 测试用例 / 实现要点 / Commit 信息。
2. 严格遵守"先 RED 后 GREEN"。
3. 每完成一个任务就 `git commit`（commit 信息采用计划里给定的文案）。
4. 计划中给的代码片段如果与 strict TS / 当前依赖冲突，**优先调整使其编译通过**，但保留语义等价；改动写进任务报告。

## 已知坑位

- **PowerShell 不识别 `cd /d`**，用 `cd "<path>"; <cmd>` 形式。
- **`npm run dev` 是阻塞进程**，工具调用里跑会卡住；验证流程用 `typecheck` + `test:run` + `check:purity`，浏览器肉眼检查留给人。
- **`scripts/check-core-purity.mjs`** 走简单正则匹配 `from 'phaser'` / `require('phaser')`；若以后引入间接依赖（如 `phaser3-rex-plugins`）需要扩展正则。
- **`index.html`** 已用 flex + `padding-top: 8vh` 把 Phaser canvas 居中偏上显示；改画布尺寸时不会影响 CSS 布局。
