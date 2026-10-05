# 测试与证据

[English](VERIFICATION.md) | [简体中文](VERIFICATION.zh-CN.md) · [文档目录](README.zh-CN.md)

当前说明核对日期：2026-10-05；代码基线: `d663030`.

## 当前验证基线

2026-10-05 的 Amadeus 改名提交 d663030：333 项测试通过，2 项环境依赖测试明确跳过，类型检查与生产构建通过。本轮文档整理不构成新增付费模型或 OS 隔离实测；构建仍提示较大分块。

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

使用 pnpm 11.19.0、Node.js 24+。CI 在 Ubuntu 与 Windows 执行这些检查，本机通过不等于之后的远端 CI 已通过。

可选宿主集成测试：

```powershell
$env:AGENTDEMO_BROWSER_TEST = '1'
node --import tsx --test tests/browser-tabs.test.ts
$env:AGENTDEMO_DESKTOP_TEST = '1'
node --import tsx --test tests/window-capture.test.ts
```

桌面夹具创建自己的窗口，测试遮挡截图及最小化拒绝，不是广泛应用基准；跳过不算通过。

## 证据的含义

工具回执证明在所记录产物上发生了观察，不证明语义正确。文件覆盖来自真实匹配读取，命令退出码 0 不代表检查了全部声明文件。验证任务 done 前需通过的观察；作者自检与另一个运行的检查分开记录，但不同运行不必然意味着推理独立。

快照覆盖声明产物／读取路径、包和配置清单，以及可识别的相对 JS/TS 导入。边界为 512 项、单文件 4 MB、合计 16 MB；输入不完整拒绝绑定。动态导入、外部解析和未声明依赖不完全覆盖。前后哈希能发现很多陈旧情况，不是抗恶意 TOCTOU 证明。

测试包括负对照、崩溃窗口、未知副作用、启动状态组合、权限、来源范围和防重放，不穷尽所有状态序列，也不认证隔离安全。

## 基准

- [编码试点](../evals/coding/README.zh-CN.md)：生产运行时执行小型合成任务，两组 10/10，但未触发复用／压缩。
- [规划](../evals/planning/README.zh-CN.md)：提案协议与图检查，不测代码交付或工作者吞吐。
- [上下文／控制](../evals/context-control/README.zh-CN.md)：配对合成探针，没有证明实现收益。
- [审批历史](APPROVAL-EVALUATION.zh-CN.md)：小型平衡样本上人工率增量下降为 0 个百分点。

API 用量缺失、价格未配置保持未知。缓存 tokens 属于输入子集，不能额外相加。[历史目录](history/README.zh-CN.md)按日期保留结果，不据此给能力打分。
