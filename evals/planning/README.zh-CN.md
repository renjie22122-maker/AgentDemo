# 真实 API 规划比较

[English](README.md) | [简体中文](README.zh-CN.md) · [文档目录](../../docs/README.zh-CN.md)

这是**只测规划**的真实 API 比较，不是端到端编码或工作者吞吐评测。15 个编写案例覆盖依赖、独立分支、共享文件顺序和只读范围；五例开发、十例评测。模型看到任务描述／ID，不看到预期边集。

仓库根目录、模型已配置时执行：

```powershell
node --import tsx evals/planning/run.ts --runs=3 --parallel=2 --output=.diagnostics/planning-run
```

产生付费调用：90 个提案，契约组每样本最多再接受一次宿主验证修复。不会执行提案工具。请用新输出目录，已有结果不覆盖，配置与原始结果留在私有存储。

仅从已保存样本聚合，不请求 API：

```powershell
node --import tsx evals/planning/run.ts --report-only --output=.diagnostics/planning-run
```

两组使用相同连接、输出 schema 和输入。基线使用最少规划指令，契约组加生产 TASK_PLANNING 与至多一次通用宿主验证反馈，不提供正确答案。重复间交换组顺序，显式边与契约派生边统一比较。

评分检查任务身份、范围、环和传递依赖可达性；不改变顺序的冗余边可接受，缺依赖和不必要串行失败。不测代码质量、验收文字真假、文件结果、专家质量或最优分配。包含故意错误计划的负对照。API 失败计失败，缺用量／单价保持未知，费用是估算而非账单。

不要针对留出失败调优后仍称重跑为未见过的留出；冻结版本并补充新案例。短合成提示满分说明需要更难基准，不说明调度已解决。[历史报告](../../docs/PLANNING-EVALUATION-20261001.zh-CN.md)。
