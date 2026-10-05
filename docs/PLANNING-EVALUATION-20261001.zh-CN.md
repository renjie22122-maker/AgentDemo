# 规划评测：2026-10-01

[English](PLANNING-EVALUATION-20261001.md) | [简体中文](PLANNING-EVALUATION-20261001.zh-CN.md) · [当前文档](README.zh-CN.md)

这是只测规划的历史实验，当前实现见[规划与调度](PLANNING-AND-ROUTING.zh-CN.md)。每次比较采用 15 个编写任务 × 三次重复 × 两组，共 90 个提案。

| 比较         | 基线  | 契约提示＋宿主反馈 |
| ------------ | ----- | ------------------ |
| 初始协议     | 41/45 | 45/45              |
| 已有输入回归 | 42/45 | 45/45              |

第一轮错误涉及任务已提供输入未声明，之后加入通用 externalInputs。第二轮基线有两次声明失败和一次格式错误。测量对象是协议遵循，不是代码执行、工作者吞吐或语义推理优越性。第二次复用案例已不再是盲测留出。

第二次合计请求时间约 255／286 秒，输出 tokens 47,618／55,650。一个基线响应无用量，单价未配置，因此不能声称节省。聚合错误从已保存样本修复，没有重放调用。当时回归数量为 147，不是当前测试数。

[完整历史原文](history/2026-10-05-before-consolidation/docs/PLANNING-EVALUATION-20261001.md) · [v1 数据](../evals/results/planning-v1.json) · [v2 数据](../evals/results/planning-v2.json) · [运行及评分](../evals/planning/README.zh-CN.md)。

端到端调度收益仍需新的留出任务、同资源条件、真实质量、耗时与总费用比较。
