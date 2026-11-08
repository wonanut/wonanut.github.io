# Claude Code 内功课

> 从 17 个机制看懂 Agent Harness —— 一份写给开发者的中文工程课。

这是一门**非官方**的学习课程：沿着开源仓库 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 的 s01–s17 源码，把 Claude Code 这类 coding agent 的运行框架拆到零件级别讲清楚。主干通俗（场景、类比、流程图），难点折叠（源码细节、边界条件、设计取舍），每章配动手实验与自测。

## 开始阅读

打开 [`index.html`](./index.html)（本站地址：<https://wonanut.github.io/course/>）。

课程特性：

- **21 章**、约 12.9 万中文字，按「循环 → 工具 → 权限 → 计划 → 上下文 → 记忆 → 任务 → 团队 → 编排」递进；
- **139 个代码块**全部摘自对应章节的真实 `code.py`，删减处用 `# ...` 标注；
- **64 组深入折叠区**讲边界与失败模式，**102 道自测题**带解析；
- 单文件、离线可用：侧边栏导航、章节搜索、阅读进度、深浅色主题、一键打印导出 PDF；
- 源码引用均指向上游仓库，随源码更新保持有效。

## 适合谁

会 Python、用过 LLM，但没亲手搭过 Agent；或者天天用 Claude Code / Cursor，想弄清「它为什么这样设计」。不需要 API Key 也能读完并完成大部分实验。

## 构建与维护

课程是构建产物，源文件在 [`course-src/`](./course-src/)：

```sh
cd course
python3 course-src/build.py --check   # 校验 21 个 fragment
python3 course-src/build.py           # 生成 index.html
python3 course-src/build.py --stats   # 每章字数/代码块/自测统计
```

章节内容在 `course-src/fragments/`，页面外壳在 `course-src/template.html`，课程地图在 `course-src/manifest.json`，写作规范见 `course-src/STYLEGUIDE.md`。

## 署名与许可

- 课程文字、页面设计：© 2026 Doran，以 [MIT License](./LICENSE) 发布。
- 引用的源码片段与概念来自 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code)（MIT License，Copyright © 2024 shareAI Lab），完整许可见 [NOTICE.md](./NOTICE.md)。
- Claude Code 是 Anthropic 的产品；本课程与 Anthropic 无隶属关系，也不代表其官方观点。
- 如发现内容与上游源码不一致，以上游源码为准；欢迎到 [GitHub](https://github.com/wonanut) 交流指正。
