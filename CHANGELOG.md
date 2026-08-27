# dsh-dev-wrapped

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
