/**
 * 统一事件模型与适配器接口
 *
 * 解析层与统计层解耦：统计层只消费 NormalizedEvent，
 * 不感知数据来自哪个 CLI。v2 接入 Claude Code / Codex 时
 * 只需新增 SessionAdapter 实现，统计与报告层零改动。
 */
export {};
