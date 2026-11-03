# 国际象棋战术训练（Chess Tactics Trainer）

纯前端静态 Web 应用：每日战术题训练，进度保存在浏览器 `localStorage`，部署于 GitHub Pages。

**在线地址：** https://grot666.github.io/chess-tactics-trainer/

## Phase 1（MVP）功能

- 棋盘走子（拖拽 / 点击），`chess.js` 合法性校验
- 静态题库约 400 题（Lichess 公开谜题，CC0）
- 每日训练 10 题，刷新后可续做当天进度
- 多步战术：用户走对后自动播放对手应着
- 对错反馈；错误时展示 SAN 正解；可重做 / 下一题
- 今日总结（正确数、正确率、连续天数）
- 界面：简体中文

## 打谱（`#/pgn`）

- 粘贴或打开 `.pgn` 文件导入；多局 PGN 可下拉选择其中一局
- 显示对局信息（白方 / 黑方 / 赛事 / 日期 / 结果）
- 逐步回放：⏮ ◀ ▶ ⏭ 按钮、键盘 ← → / Home End，点击着法列表直接跳转；`F` 翻转棋盘
- 支持变着（嵌套括号）、注释 `{}`、NAG（`!` `?` `$n`）
- 在任意局面直接走子：自动生成新的变着；可「设为主线」「删除此步及之后」、给着法加注释
- 编辑对局信息后导出 PGN（复制 / 下载 `.pgn`），自定义起始局面自动带 `[SetUp "1"]` `[FEN "…"]`
- 当前局面 FEN 复制、Lichess 分析链接、跳到摆棋编辑
- 当前对局自动保存在本机（`chess-study-v1`，不影响训练进度）

## 摆棋（`#/editor`）

- 从棋子面板拖到棋盘，或点选棋子后点格子放置；棋盘上拖动移动，拖出棋盘删除；擦除工具
- 初始局面 / 清空 / 翻转；选择谁先走、易位权（王车不在原位时自动禁用）、吃过路兵格
- 实时 FEN（可复制），也可粘贴 FEN 载入
- 合法性校验（中文提示）：王的数量、兵在底线、兵/子数量、王相邻、不走棋的一方被将军、吃过路兵格不符等
- 「从这里开始下 / 打谱」：带着该局面进入打谱模式；Lichess 分析链接

## 测试

```bash
npm test   # vitest：FEN 校验、PGN 解析与导出
```

## 技术栈

- Vite + React + TypeScript
- [react-chessboard](https://github.com/Clariity/react-chessboard) + [chess.js](https://github.com/jhlywa/chess.js)
- Zustand（进度持久化）
- GitHub Pages + GitHub Actions

## 本地开发

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
npm run preview
```

注意：`vite.config.ts` 中 `base` 为 `/chess-tactics-trainer/`，预览时请用该路径前缀访问。

## 部署

推送到 `main` 后，`.github/workflows/deploy.yml` 会：

1. `npm ci && npm run build`
2. 将 `dist/` 发布到 GitHub Pages（Actions）

仓库 Settings → Pages → Source 需为 **GitHub Actions**。

## 题库如何生成

数据来源：[Lichess Puzzle Database](https://database.lichess.org/#puzzles)（CC0）。

筛选条件（见 `scripts/build-puzzles.mjs`）：

- 评级 800–1600
- Popularity ≥ 90，NbPlays ≥ 2000
- 偏好主题：fork / pin / skewer / mateIn1–3 / hangingPiece / sacrifice 等
- 目标约 400 题，主题尽量均衡
- UCI → SAN（chess.js）；正确处理 Lichess「首步为对手造题着法」约定

重新生成：

```bash
# 需安装 zstd
curl -L https://database.lichess.org/lichess_db_puzzle.csv.zst \
  | zstd -d \
  | node scripts/build-puzzles.mjs
```

输出：`src/data/puzzles.json`（当前约 186 KB）。

## 目录结构

```
src/
  components/   # 棋盘、主题标签
  pages/        # 首页 / 训练 / 总结
  store/        # Zustand 进度
  data/         # puzzles.json
  lib/          # 类型、主题中文、棋步工具
scripts/        # build-puzzles.mjs
.github/workflows/deploy.yml
```

## 后续（Phase 2 设想）

- 按主题专项训练、难度筛选
- 错题本复盘
- PWA / 更多题库体量
