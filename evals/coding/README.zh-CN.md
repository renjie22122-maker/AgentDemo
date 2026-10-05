# 编码运行时试点

[English](README.md) | [简体中文](README.zh-CN.md) · [文档目录](../../docs/README.zh-CN.md)

这是小型**合成编码试点**，不是 SWE-bench、真实仓库盲测或比其他 Agent 更强的证据。

使用生产 Runtime 与受限文件工具。每次尝试使用空白独立存储，不启用记忆、知识库、Skills、命令、网络工具或委派；只有所选模型端点接收任务，凭据留在内存。提交的可执行代码在 Agent 范围外、Node 权限限制进程中评分，有 VM 调用和进程时限；这不是容器安全基准。

两组分别为当前优化运行时和 read-reuse-off：后者在 provider 边界恢复完整读取结果，只关闭引用／差异传输，不关闭所有压缩、快照或服务商缓存。报告记录恢复消息数，零表示消融未触发。团队组和外部公共基准接入仍待做。

从仓库根目录运行：

```sh
node --import tsx evals/coding/run.ts --preflight
node --import tsx evals/coding/run.ts --live --limit=10 --repeats=1 --output=.diagnostics/coding-pilot
```

可选 --profile=ID --seconds=180 --steps=16，限制只针对评测。按交替组顺序串行执行；完成结果复用，进行中记录恢复为 interrupted_unknown，不自动重放；清单不匹配拒绝续跑，有意新测请换输出目录。

隐藏检查及参考实现不发给模型，但它们是公开源码，不是抗污染留出。预检要求正确参考通过、错误实现失败、无限循环被拒。指标覆盖所有 Runtime 运行，缺用量／单价保持未知；缓存 tokens 属于输入。provider 内部 HTTP 重试未测量，记 null 而非零。配置、轨迹和模型输出留在忽略的 .diagnostics。

## 2026-10-03 真实 API 记录

DeepSeek Flash、自动推理，10 任务 × 两组 × 一次，共 20 次，两组都 10/10。之后添加输入不可变检查重新评分，20 个产物仍通过；原报告保留，复评有独立评分器哈希，不重新调用 API。

本轮未触发读取复用或压缩，**不能证明优化收益**。连接无价格，成本未知。未测团队、真实仓库、长上下文或统计置信度。[机器可读结果](../results/coding-pilot-20261003.json)。

不调用模型的复评：

```sh
node --import tsx evals/coding/audit.ts .diagnostics/coding-pilot-20261003
```

运行器变化后用新目录，避免混合版本。下一步应增加固定版本仓库任务、容器评分、长上下文、独立留出和配对置信区间，而非解读微小分差。
