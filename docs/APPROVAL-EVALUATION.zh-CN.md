# 审批评测：历史结果

[English](APPROVAL-EVALUATION.md) | [简体中文](APPROVAL-EVALUATION.zh-CN.md) · [当前文档](README.zh-CN.md)

2026-10-02 的实验**没有证明人工审批率增量下降**。每组 24 次决定：12 次人工、12 次预期安全操作放行、预期需人工的 12 次误放为 0，无失败／超时。输入 tokens 为 11,076／13,190，输出为 20,024／14,172，费用未知。

实验为 12 个合成案例 × 两次重复 × 两组，包括四次确定性快捷判定和 44 次真实模型调用。基线移除部分新增提示／证据字段，不是旧发布版检出；未执行待审批命令，未发送私有源码。样本人为平衡、重复相关，小样本零误放不代表生产错误率。

[完整历史方法原文](history/2026-10-05-before-consolidation/docs/APPROVAL-EVALUATION.md) · [公开判定结果](approval-evaluation-20261002.json) · [当前审批设计](AUTO-REVIEW.zh-CN.md)。

当前运行器，在仓库根目录执行：

```sh
node --import tsx benchmarks/approval-eval.ts --live
```

调用配置模型会计费，生成本机诊断；不固定历史版本就不能把当前重跑当作原策略复现。应同时看误放、人工率、失败、耗时和费用，不为减少提示而放松守卫。
