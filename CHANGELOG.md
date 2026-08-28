# dsh-dev-wrapped

## 1.3.0

### Minor Changes

- 徽章等级系统：可量化徽章新增铜🥉/银🥈/金🥇三级（如高产选手 1000/3000/6000 次调用），徽章墙显示等级角标
- 隐藏彩蛋徽章：「996 警告」（连续 ≥7 天活跃且日均调用 ≥50）与「4AM 俱乐部」（凌晨 3-5 点仍在调用）；不计入解锁总数分母，未达成时不渲染
- 逐月回放：story 模式按月分屏回顾，每月展示工具调用总数与活跃会话数（仅渲染有活动的月份）
- AI 总结 prompt：每次运行输出 `*-prompt.txt` 结构化 prompt，复制贴回自己的 DSH / Claude Code 会话即可生成本地个性化年度总结（零 API 成本，中英随 `--lang` 切换）

## 1.2.2

### Patch Changes

- story 报告尾屏新增「📊 查看完整数据总结」按钮：同一次运行自动附带一份 compact 总结页（`*-compact.html`），点击直达完整数据单页
- 终端输出同步提示总结页路径；`--compact` / `--json` 模式行为不变

## 1.2.1

### Patch Changes

- 交互式数据源选择菜单：不传 `--adapter` 且为交互终端时，启动后弹出选择菜单（DSH / Claude Code / 合并扫描）；空回车默认 DSH，60 秒无输入自动按默认处理
- 兼容性：脚本化调用 / 管道 / CI 等非 TTY 环境自动跳过菜单；DSH 插件内 `dev.wrapped` 命令注入默认数据源避免卡在菜单（显式传 `--adapter` 不受影响）

## 1.2.0

### Minor Changes

- 跨数据源合并报告：`--adapter all` 同时扫描 DSH 与 Claude Code 会话，事件流合并统一聚合；新增数据源分布统计（`adapterSources`，story 数据源分布屏 + compact 小节）；任一来源缺失自动跳过不报错
- 开发者人格画像：作息（夜 20-5 / 日 6-12 / 傍晚 13-19）× 风格（轮均工具调用 ≥ 8 为重型）组合出 6 种人格（午夜建筑师 / 月下对话者 / 晨光指挥官 / 上午茶谈客 / 高效推进器 / 稳健工匠），story 人格大屏 + compact 人格小节 + JSON `personality` 字段

## 1.1.0

### Minor Changes

- 成就徽章系统：11 枚游戏化徽章（深夜代码手 / 夜猫子 / 晨间开发者 / 工具收藏家 / 多面手 / 周末战士 / 持之以恒 / 话痨 / 高产选手 / 马拉松选手 / 稳如磐石），基于报告统计自动解锁；story 徽章墙 + compact 徽章小节 + JSON `badges` 数组，中英文案同步
- 年度对比模式：`--compare`（配合 `--year`，缺省当前年份）对比该年与上一年（会话 / 轮次 / 工具调用 / 活跃天数 / Token），涨跌百分比与"全新起步"标注；上一年无数据时自动跳过
- 新增产品需求文档 `docs/PRD.md`（含竞品调研结论与迭代路线）

## 1.0.0

### Major Changes

- 首 个 正 式 版 本 v1.0.0
  
  - 新增 Claude Code 数据源适配器（`--adapter claude-code`，扫描 `~/.claude/projects`）
  - 新增逐屏滚动叙事报告（默认 story 模式，`--compact` 切换紧凑单页）
  - 新增多语言报告（`--lang zh|en`）
  - 新增年度回顾模式（`--year YYYY`）与成本估算（`--estimate-cost`，基于真实 token，标注估算）
  - 统计深化：工具错误率排行、深夜（0-6 点）编码占比、工作日/周末分布、模型分布、DSH agentPreset 分布
  - 工程加固：GitHub Actions CI（Node 18/20/22 矩阵）、changesets 版本管理、fuzz 容错测试（损坏 zstd / 截断文件 / 垃圾 JSONL 行）
  - Cordis 插件入口（`dev.wrapped` 命令）
