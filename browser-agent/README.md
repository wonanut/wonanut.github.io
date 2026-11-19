# ECHO · 网页密室 Agent

一个完全跑在浏览器里的迷你 AI agent：没有后端、没有 API key，模型推理和浏览器操作都在当前标签页完成。

- 线上：https://wonanut.github.io/browser-agent/
- 页面本身是一个单文件 `index.html`；密室网站通过 iframe `srcdoc` 内联生成。

## 玩法

沙盒是一个叫「回声档案室」的网页密室：

- 大厅说明目标，通往画廊、书房、天台、保险箱四个房间；
- 每个房间有一段被藏起来的「回声」，需要点击才能显现；
- 三段回声按房间顺序组成三位密码；
- 保险箱输入正确密码后会打开，露出镜子和一句结尾。

**每次重置都会重新生成密码**，所以 Demo 不是背固定脚本：agent 必须真的去读页面、点开线索、把三段数字按顺序拼起来。

## 它有多小

整个 agent 只有：

1. 一个 while 循环；
2. 6 个工具：`read_page`、`click`、`type`、`scroll`、`navigate`、`done`；
3. 一段 JSON-only 的系统提示词；
4. 一个同源 iframe 密室。

没有文件系统、shell、MCP、子 agent、长期记忆或向量库。它只被允许操作浏览器沙盒。

## 工具协议

```json
{"tool":"read_page","args":{}}
{"tool":"click","args":{"id":"e7"}}
{"tool":"type","args":{"id":"e8","text":"635"}}
{"tool":"scroll","args":{"dy":300}}
{"tool":"navigate","args":{"page":"vault"}}
{"tool":"done","args":{"answer":"..."}}
```

每次 `read_page` 会重新给可见可交互元素编号；`click` / `type` 只接受最新 observation 里的 id。

## 本地模型

通过 [WebLLM](https://github.com/mlc-ai/web-llm) 在 WebGPU 上推理，首次加载会下载权重并缓存到浏览器。

页面提供三档：

- **极速**：SmolLM2 135M，下载最小；
- **平衡**：Qwen2.5 0.5B，规划能力更好；
- **质量**：Llama 3.2 1B，JSON 动作更稳。

默认勾选 **hf-mirror** 国内镜像；如果镜像不通，取消勾选后重试直连。如果只想体验 agent 行动，直接点「演示大脑」，零下载。

## 设计边界

- 这是教学/演示用 agent，不是生产级浏览器自动化；
- 模型可能输出无效 JSON 或错误 id，因此有解析失败日志和最大步数；
- 沙盒是同源 iframe，不能操作真实站点；
- 没有处理登录、支付、隐私或权限的机制。

## 为什么不做成 Pi 那样

Pi 的循环、会话、压缩、扩展是为「终端里的长期工作」设计的。这个迷你版只想回答一个问题：

> 如果 agent 只能看见一个页面、并且只能点它，它最小需要哪些零件？

答案就是：一个循环、一组浏览器工具、一个观察格式，和一个能输出动作的模型。
