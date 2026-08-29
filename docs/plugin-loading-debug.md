# DSH 插件加载调试归档（2026-08-28 ~ 2026-08-29）

> 本文档归档 `/wrapped` 斜杠命令从"不显示"到"加载成功"的完整调试过程。
> 涉及版本：v1.3.1 → v1.3.5（commit `626de4f`），最终在 web profile 实测通过。

## 一、问题主线

DSH 插件加载是一条**五环链条**，缺一环报一种错：

```
profile bundles 清单 → dsh.bundle 声明 → cordis.patch.yml 入 files
    → dist 产物入库 → inject 依赖声明
```

| # | 关卡 | 报错/症状 | 修复版本 |
|---|---|---|---|
| 0 | pnpm 构建脚本拦截 | git 安装后 dist/ 不存在 | v1.3.3 |
| 1 | profile bundles 清单 | `/wrapped` 静默不显示，零日志 | 手动配置 |
| 2 | dsh.bundle 声明 | `declares no dsh.bundle` | v1.3.4 |
| 3 | files 白名单 | `ENOENT ... cordis.patch.yml` | `521712d` |
| 4 | inject 依赖声明 | `cannot get property "commands" without inject` | v1.3.5 |

## 二、逐关详解

### 错误 0（前置）：pnpm 构建脚本拦截

- **机制**：pnpm 出于供应链安全默认拦截 git 依赖的 `prepare` 构建脚本；放行 key 内嵌 commit SHA，每次发版所有用户都需重新放行，分发策略不可行。
- **修复**（v1.3.3）：删除 `prepare`，`dist/` 构建产物直接提交入库，实现零构建脚本安装。代价是仓库多几百 KB 产物，换来安装可靠性。

### 错误 1：命令静默不显示（最难排查）

- **机制**：DSH 插件加载是点名制——必须在 profile 的 `package.json` 的 `dsh.profile.bundles` 数组里写明插件名。没进名单 = 完全不存在，且不产生任何日志。
- **修复**：手动在 `~/.dsh/profiles/web/package.json` 的 bundles 数组加入 `"dsh-dev-wrapped"`。
- **教训**：静默失败比报错失败排查成本高得多。无报错时先验证"是否被加载"，再看"加载得对不对"。

### 错误 2：`declares no dsh.bundle`

- **机制**：进 bundles 名单的插件必须在 package.json 声明 `dsh.bundle` 字段，指定插入 Cordis 栈的方式。
- **定位**：无公开文档，逆向同 profile 正常工作的 `dsh-context` 插件，照抄其 `cordis.patch.yml` 模式。
- **修复**（v1.3.4）：新增 `cordis.patch.yml`（声明 main 入口作为 host 半插入 Cordis 栈）+ package.json 声明：

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

### 错误 3：`ENOENT ... cordis.patch.yml`（最隐蔽）

- **机制**：pnpm 安装 git 依赖时打 tarball 并按 package.json 的 `files` 白名单**过滤文件**。v1.3.4 的 `files` 只有 `["dist", "bin", "README.md", "LICENSE"]`，`cordis.patch.yml` 有声明、无文件。
- **定位**：本地文件存在且已提交（`git ls-files` 确认），但安装包里没有 → 矛盾指向打包过滤环节。
- **修复**（`521712d`）：`files` 数组补 `"cordis.patch.yml"`，用 `pnpm pack` + `tar -tf` 验证产物内容（pnpm 不支持 `pack --dry-run`）。
- **教训**：**`dsh.bundle.patch` 指向的文件必须同时进 `files` 白名单**。本地开发永远发现不了——只有真实 git 安装才暴露。

### 错误 4：`cannot get property "commands" without inject`

- **机制**：Cordis 用属性代理包装 ctx，访问 `ctx.commands` 等服务属性前必须导出 `export const inject = ['commands']`，否则 getter 直接抛错，连 `if (c.commands)` 防御性探测都过不去。
- **定位**：报错栈精确到 `dist/index.js:27`；在 DSH 自带的 cordis 源码找到抛错点；再参考同 profile `dsh-mbti-jury` 的 `inject = ['llm', 'commands', 'agentDefaultModel']` 确认官方写法。
- **修复**（v1.3.5）：[src/index.ts](../src/index.ts) 补充：

```ts
export const inject = ['commands']
```

## 三、贯穿全程的工程问题：安装慢

`dsh plugin add` 耗时 44s，三段叠加：供应链策略校验（固定数十秒）+ GitHub tarball 下载（实测 8 KiB/s）+ pnpm 重整 node_modules（410MB / 185 包，受 Defender 实时扫描拖慢）。

对策：
- Defender 排除 `.dsh` 与 Node 目录（管理员 PowerShell）：
  `Add-MpPreference -ExclusionPath "C:\Users\<user>\.dsh"` 等
- 日常更新走 profile 目录 `pnpm update dsh-dev-wrapped`，跳过供应链校验。

## 四、方法论沉淀

1. **看栈定位关卡**：五类报错的栈层次完全不同——`loadOverlayPatches`（读 overlay）→ `Entry._init`（loader 初始化）→ `Fiber.execute` → 插件代码行号。栈走到哪层，就缺哪环。
2. **无文档生态的捷径**：同 profile 里能跑的第三方插件就是事实标准（bundle 声明、inject 写法均来自逆向 `dsh-context` / `dsh-mbti-jury`）。
3. **本地通过 ≠ 分发成功**：涉及 `files` / 构建脚本 / 打包过滤的问题，必须 `pnpm pack` 模拟产物或真装一遍验证。
4. **声明与文件成对出现**：package.json 里任何指向文件的声明字段，对应文件必须进 `files` 白名单。

## 五、版本清单

| 版本 | commit | 内容 |
|---|---|---|
| v1.3.2 | `66aa511` | 补 prepare 脚本（方向错误，被 v1.3.3 替代） |
| v1.3.3 | `65a3a6f` | dist 产物入库，删 prepare，零配置安装 |
| v1.3.4 | `da44e1f` | 补 dsh.bundle.patch + cordis.patch.yml |
| — | `521712d` | files 白名单补 cordis.patch.yml |
| v1.3.5 | `626de4f` | 补 inject 声明，最终加载成功 ✅ |
