# 技能 Icon AI 生成提示词手册

> 用途：本文档列出 SplatBrawl 12 个技能 icon 的统一规格、视觉设计要点，以及可直接投喂给 AI 绘图工具（Midjourney / DALL·E / Stable Diffusion 等）的中英文 Prompt。
>
> 接入路径：生成后将图片放入 `public/images/skills/`，并在 `src/config/assets/skills.json` 对应技能的 `icon` 字段填入路径，无需改任何代码。

---

## 一、统一规格

| 项目 | 规格 |
|------|------|
| 输出尺寸 | 256×256 px（正方形） |
| 文件格式 | PNG，背景透明（拾取道具会叠在白底圆上，技能槽会叠在 HUD 卡片上，透明底通用性最佳） |
| 视觉风格 | 卡通扁平 + 厚描边，类似 Splatoon / Among Us / Brawl Stars 的 UI 图标 |
| 主体占比 | 主体居中，占画布 60~70%，四周留 15% 安全边 |
| 描边 | 黑色或深色厚描边，2~4 px，确保缩到 32×32 仍能看清轮廓 |
| 高光/阴影 | 单一方向高光（左上）+ 简单阴影，不要写实贴图 |
| 颜色基调 | 高饱和、清晰可读，避免与角色四色（红/蓝/黄/绿）冲突的整体色调；图标本身使用"语义色"（如火箭=橙红、护盾=青蓝） |
| 禁止元素 | 写实质感、长文字、复杂粒子、写实人物、写真摄影 |

**Negative Prompt 通用部分（所有 icon 通用）：**

> realistic, photorealistic, photo, 3d render, blender, complex background, text, letters, watermark, signature, low contrast, blurry, gradient mesh, noisy, gritty, horror, dark theme, multiple objects, cluttered

---

## 二、风格统一锚点（每个 Prompt 复用）

为保证 12 个 icon 风格一致，下列描述作为**通用前缀（Style Anchor）**，每条 Prompt 实际使用时都拼在前面：

**英文 Style Anchor：**
> flat cartoon game icon, thick black outline, bold shapes, vibrant saturated colors, soft cel shading, top-left highlight, centered composition, transparent background, mobile game UI style, splatoon-inspired, clean and readable at small size

**中文 Style Anchor：**
> 扁平卡通游戏图标，粗黑描边，色块鲜明，高饱和度，简单赛璐璐着色，左上方高光，居中构图，透明背景，移动游戏 UI 风格，Splatoon 风格，缩小后仍清晰可辨

---

## 三、12 个技能 Icon 设计表

| # | 技能 ID | 中文名 | 核心玩法 | 设计意象 | 主色调 |
|---|---------|--------|----------|----------|--------|
| 1 | rocket | 火箭 | 8 方向飞弹眩晕 | 火箭弹头 + 尾焰 | 橙红 + 银白 |
| 2 | speed | 极速 | 自身移速 ×2 | 闪电 / 速度线靴子 | 亮黄 + 白 |
| 3 | star | 星星 | 全图清最多色 5 格 | 五角星闪光 | 白银 + 浅蓝光 |
| 4 | shield | 护盾 | 3×3 自家格防覆盖 | 圆形气泡盾牌 | 青蓝 + 白高光 |
| 5 | laser | 激光 | 朝向射穿一行/列 | 横向光束 + 准星 | 紫红 + 白光 |
| 6 | roller | 涂刷 | 3 格宽染色 3 秒 | 油漆滚筒 | 多彩颜料 + 木柄 |
| 7 | bomb | 炸弹 | 延迟 2 秒清 5×5 | 引线圆炸弹 | 黑灰 + 红引线 |
| 8 | seed | 种子 | 5 秒蔓延 5 格 | 发芽种子/藤蔓 | 嫩绿 + 棕 |
| 9 | charge | 霸体 | 4 秒撞飞对手 | 公牛角/金色冲撞光环 | 金黄 + 红 |
| 10 | ripple | 涟漪 | 3 圈扩散染色 | 同心水波纹 | 浅蓝 + 白 |
| 11 | mark | 标记 | 锁定敌人沙漏延迟 | 沙漏 + 准星十字 | 紫 + 金 |
| 12 | rewind | 回溯 | 恢复 5 秒前自家格 | 逆时针时钟箭头 | 青绿 + 银 |

---

## 四、逐个 Icon Prompt

> 使用方式：将 **Style Anchor + 下面对应条目的"主体描述"+ Negative Prompt** 三段拼接后投喂 AI。
>
> 中英文各给一份，Midjourney / SD 推荐英文，国产豆包 / 文心一格 / 即梦推荐中文。

---

### 1. 火箭（rocket）

**中文：**
> 一枚卡通风格的红橙色火箭弹头，弹身白色条纹，尾部喷射黄色与橙色的卡通火焰，火箭略微倾斜（约 30 度），周围有 4 道辐射状速度线表示发射感，整体呈现冲击力。

**English:**
> A cute cartoon rocket missile in red and orange, white stripe on the body, cartoon yellow-orange flame trail at the tail, tilted about 30 degrees, surrounded by four short radial speed lines, energetic feeling, icon centered.

---

### 2. 极速（speed）

**中文：**
> 一只卡通风格的运动鞋，鞋身亮黄色，鞋底带有一道闪电符号，鞋后方拖出三条白色速度线，整体上扬呈奔跑姿态；或者也可以是一道纯粹的闪电符号配上速度线，二选一表达"加速"。

**English:**
> A cartoon yellow sneaker with a lightning bolt on the side, three white motion lines trailing behind, lifted in a running pose, expressing super speed; alternative: a single bold lightning bolt symbol with motion lines, pick whichever reads better.

---

### 3. 星星（star）

**中文：**
> 一颗五角星，星身白色到浅蓝色渐变，边缘描金，星体上有 4 个十字闪光点表示闪耀，背景透明、不要太空背景。要可爱、有"清空、净化"的感觉，不要邪恶感。

**English:**
> A five-pointed star, white-to-light-blue gradient body, gold thick outline, four small cross-shaped sparkle points on the surface giving a shimmering twinkle, transparent background, expressing a sense of cleansing or purifying, cute and friendly, not edgy.

---

### 4. 护盾（shield）

**中文：**
> 一面圆形卡通盾牌，主色青蓝色，盾面有一道白色弧形高光像气泡反光，盾牌中央有一颗小水滴或六边形装饰图案，给人"防御 + 半透明气泡感"，描边粗黑。

**English:**
> A round cartoon shield in cyan-blue, glossy bubble-like highlight arc on the surface, a small water-drop or hexagon emblem in the center, giving a translucent bubble-shield feel, thick dark outline, defensive and friendly.

---

### 5. 激光（laser）

**中文：**
> 一道横向射出的紫红色激光束，左侧有一个发射点（白色光球+十字准星），光束向右延伸并在末端散开成尖锐光锥，光束周围有 3 道白色细高光线增强速度感，整体表达"瞄准并射穿"。

**English:**
> A horizontal magenta laser beam shooting from left to right, the left end shows a glowing white emitter with a crosshair, the beam extends right and bursts into a sharp cone at the tip, three thin white highlight lines along the beam, expressing "aim and pierce".

---

### 6. 涂刷（roller）

**中文：**
> 一个卡通油漆滚筒刷，木质手柄棕色斜置 45 度，滚筒头部为多彩颜料（红蓝黄绿四色拼接，对应游戏四色），下方拖出一条厚厚的彩色颜料痕迹表示刚刷过，滚筒表面有一点白色高光。

**English:**
> A cartoon paint roller, wooden brown handle tilted 45 degrees, roller head shows a colorful split of red, blue, yellow, green paint (matching the four player colors), a thick wavy paint stroke trailing below, small white highlight on the roller, playful and bright.

---

### 7. 炸弹（bomb）

**中文：**
> 一个经典圆形卡通炸弹，黑色球体带有一点白色高光，顶部一根弯曲的引线，引线末端有一颗橙红色火星正在燃烧，旁边有一个黄色小爆炸星形以暗示"即将爆炸"，整体可爱不血腥。

**English:**
> A classic round cartoon bomb, black sphere with a small white highlight, curved fuse on top with a glowing orange-red spark at the tip, a small yellow comic-style explosion star next to it suggesting imminent blast, cute, not gory.

---

### 8. 种子（seed）

**中文：**
> 一颗棕色的圆形种子静静坐在底部，顶部刚刚冒出两片嫩绿色心形小芽，芽尖向两侧弯曲，种子下方有一小撮棕色泥土或一道短弧线表示土地，整体表达"破土而出、即将蔓延"。

**English:**
> A round brown seed sitting at the bottom, two fresh green heart-shaped sprouts emerging from the top curling outward, a small patch of brown soil or a short curved ground line beneath, expressing germination and growth about to spread.

---

### 9. 霸体（charge）

**中文：**
> 一对卡通公牛角图案（金黄色），牛角中间是一个红色冲撞箭头，背景有金色辐射光芒环绕（4~6 道粗短光线）整体给人"无敌冲撞"的力量感；或换为一个紧握的金色拳头加上金色光环，二选一。

**English:**
> A pair of cartoon golden bull horns with a red forward-charge arrow between them, surrounded by 4–6 short thick golden radial light rays, expressing unstoppable power; alternative: a clenched golden fist with golden aura ring, pick whichever feels more iconic.

---

### 10. 涟漪（ripple）

**中文：**
> 三个同心圆水波纹，由内向外颜色从深青蓝渐变到浅蓝再到几乎透明，每一圈水波边缘有轻微起伏波浪感，中心有一个小水滴落下激起的小高光点，整体平静但有"扩散"暗示。

**English:**
> Three concentric circular water ripples, color graduating outward from deep teal to light blue to near-transparent, each ring with subtle wavy edges, a small water droplet highlight at the center, calm yet expressing outward diffusion, top-down view.

---

### 11. 标记（mark）

**中文：**
> 一个紫色卡通沙漏，金色框架，沙漏内上半部分还有少量金色沙粒，下半部分已经堆了一些；沙漏前方叠加一个红色十字准星圆环，圆环略大于沙漏。整体表达"锁定 + 倒计时"。

**English:**
> A purple cartoon hourglass with a golden frame, golden sand particles falling inside (some still in the top, more accumulated at the bottom), overlaid with a red crosshair targeting reticle ring slightly larger than the hourglass, expressing "locked-on with a countdown".

---

### 12. 回溯（rewind）

**中文：**
> 一个圆形时钟表盘，盘面浅青绿色，有一支粗大的银色箭头沿逆时针方向旋转（箭头占据 3/4 圆周），表盘 12 点位置有一个小标记，整体散发淡淡的青绿色光晕，表达"时间倒流"。

**English:**
> A round clock face in pale teal-green, a thick silver arrow curving counter-clockwise around the rim (covering about three quarters of the circle), a small marker at the 12 o'clock position, soft teal-green glow around the clock, expressing time-rewind, magical and clean.

---

## 五、生成与接入流程

1. **生成：** 把"通用 Style Anchor + 单条主体描述 + 通用 Negative Prompt"喂给 AI 工具，每条 Prompt 出 4 张候选，挑 1 张。
2. **后处理：** 若背景非透明，用 PS / removebg / `rembg` 去底；统一裁剪 256×256 居中。
3. **命名：** 按 `<skill-id>-icon.png` 命名，例如 `rocket-icon.png`、`bomb-icon.png`，全部丢进 `public/images/skills/`。
4. **接入：** 编辑 `src/config/assets/skills.json`，把对应条目的 `"icon": ""` 改成 `"icon": "images/skills/rocket-icon.png"` 即可。
5. **验证：** `npm run dev` 打开游戏，看拾取道具与玩家头顶技能槽是否正确显示新图。若仍显示首字母 fallback，说明路径或 key 写错。

---

## 六、风格自检清单（出图后逐张过一遍）

- [ ] 缩小到 32×32 仍能一眼认出是什么技能？
- [ ] 是否避开了角色四色（红/蓝/黄/绿）作为主色？（避免与角色身上同色技能槽糊在一起）
- [ ] 描边粗细与其他 11 张是否一致？
- [ ] 主体占比是否在 60~70%、四周有安全边？
- [ ] 透明背景是否干净、没有残留色块？
- [ ] 12 张并排放在一起，是否像同一套图标，而不是 12 个画师的拼盘？

---

## 七、技能特效贴图（非 Icon，用于游戏内渲染）

> 这部分图与上面的 UI Icon **不同**：它们是游戏内由渲染层动态创建的"世界贴图"，会被旋转、缩放、附加 tween 动画。规格和构图要求与 256×256 方形 UI 图标不一样。
>
> 接入路径：图片放入 `public/images/skills/`，在 `src/config/assets/skills.json` 对应技能条目里填入路径（key 形如 `skill.rocket.projectile`、`skill.shield.bubble`）。
>
> **说明：** `bomb.explosion` 是动态多帧/粒子效果，建议用 Phaser 粒子系统直接实现，不在本节给图片提示词。

---

### A. 火箭弹造型（rocket.projectile）

**用途：** 火箭技能发射后，作为飞行中的弹体贴图。渲染层会让它沿 8 方向之一平移，并按方向旋转。

**规格：**

| 项目 | 规格 |
|------|------|
| 输出尺寸 | 128×64 px（横向矩形，长宽比 2:1） |
| 朝向 | **弹头朝右**（渲染层以"朝右"为 0°基准做旋转） |
| 文件格式 | PNG，背景透明 |
| 主体占比 | 火箭占画布 85% 以上，几乎贴满，留 5~10% 安全边 |
| 视觉风格 | 与 icon 同一套：扁平卡通 + 厚黑描边，但**不要尾焰扩散到画布外**，尾焰收在画布内 |

**中文：**
> 一枚侧视的卡通火箭弹，弹头朝向画面右侧，弹体红橙色配白色环形条纹，弹头是金属银色圆锥，弹尾喷出黄橙色卡通火焰（火焰长度约占整体 1/3，向左收尾，不要散出画布），弹身有两片小三角稳定翼。整体简洁，粗黑描边，透明背景。

**English:**
> A side-view cartoon rocket missile, nose pointing to the right side of the canvas, red-orange body with white ring stripe, silver metallic conical nose tip, yellow-orange cartoon flame trailing to the left (flame length about 1/3 of total, contained inside the canvas), two small triangular fins on the body, thick black outline, flat cartoon style, transparent background, horizontal composition.

**Negative Prompt（追加）：**
> vertical composition, multiple rockets, flame extending outside canvas, square frame, realistic metal texture

---

### B. 护盾气泡（shield.bubble）

**用途：** 护盾技能触发后，覆盖在 3×3 自家格区域上方的半透明气泡贴图。渲染层会按格子区域缩放、做 alpha 呼吸或 scale pulse 动画。

**规格：**

| 项目 | 规格 |
|------|------|
| 输出尺寸 | 256×256 px（正方形） |
| 文件格式 | PNG，背景透明 |
| 主体占比 | 气泡占画布 90% 以上，居中圆形，**几乎填满**画布（缩放后才贴合 3 格区域） |
| 透明度 | 气泡本身就要带半透明感（中心更透、边缘略实），不是纯实心圆 |
| 视觉风格 | 半透明肥皂泡 / 玻璃球感，**不要厚黑描边**（这点与 UI icon 不同；厚描边盖在格子上会显脏） |

**中文：**
> 一个圆形半透明护盾气泡，整体青蓝色调，中心区域接近完全透明只有一点点淡蓝，边缘逐渐加深为青蓝色细环（边缘最深处仍保持约 60% 不透明度），气泡左上方有一道弧形白色高光（占圆周约 1/4），右下方有一小块圆形白色反光点，呈现肥皂泡/玻璃球质感。**不要黑色粗描边**，只用边缘光晕勾勒形状。透明背景。

**English:**
> A round translucent shield bubble, overall cyan-blue tint, center is nearly fully transparent with only a faint blue tint, edges gradually deepen into a cyan-blue thin ring (edge max around 60% opacity), a curved white glossy highlight arc on the upper-left covering about 1/4 of the circumference, a small round white reflection dot on the lower-right, soap-bubble / glass-orb quality. **No thick black outline**, shape is defined by the edge glow only. Transparent background, centered composition filling the canvas.

**Negative Prompt（追加）：**
> thick black outline, opaque solid sphere, metal shield, decorative emblem, cross or hexagon symbol inside, realistic glass refraction, character behind the bubble

---

### 接入说明

生成完成后：

1. 命名：`rocket-projectile.png`、`shield-bubble.png`，丢进 `public/images/skills/`。
2. 编辑 `src/config/assets/skills.json`，把对应技能条目下的特效字段填上：
   - rocket → `"projectile": "images/skills/rocket-projectile.png"`
   - shield → `"bubble": "images/skills/shield-bubble.png"`
3. 渲染层通过 `AssetRegistry.hasTexture('skill.rocket.projectile')` 自动切到贴图分支，没填路径时仍 fallback 到几何图元，不报错。
