// 检查 src/core 与 src/ai 下不允许引入 phaser，确保逻辑层与 AI 层零渲染依赖。
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const ROOTS = ['src/core', 'src/ai'];
const PHASER_IMPORT = /from ['"]phaser['"]/;
const PHASER_REQUIRE = /require\(['"]phaser['"]\)/;

let violated = false;

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const stat = statSync(p);
    if (stat.isDirectory()) {
      walk(p);
    } else if (p.endsWith('.ts')) {
      const content = readFileSync(p, 'utf-8');
      if (PHASER_IMPORT.test(content) || PHASER_REQUIRE.test(content)) {
        console.error(`[ERROR] ${p} 引用了 phaser，违反 core/ai 纯度约束！`);
        violated = true;
      }
    }
  }
}

for (const root of ROOTS) walk(root);

if (violated) {
  process.exit(1);
}
console.log('core/ai 纯度检查通过');
