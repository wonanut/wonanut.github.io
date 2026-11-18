# MIST · 浏览器迷你 Agent

一个完全跑在浏览器里的迷你 AI agent：没有后端、没有 API key，模型推理和浏览器操作都在当前标签页完成。

- 线上：https://wonanut.github.io/browser-agent/
- 页面本身是一个单文件 `index.html`；沙盒网站通过 iframe `srcdoc` 内联生成。

## 它有多小

整个 agent 只有：

1. 一个 while 循环；
2. 6 个工具：`read_page`、`click`、`type`、`scroll`、`navigate`、`done`；
3. 一段 JSON-only 的系统提示词；
4. 一个同源沙盒网站（山岚咖啡）。

没有文件系统、shell、MCP、子 agent、长期记忆或向量库。它只被允许操作浏览器里的沙盒页面。

## 本地模型

模型通过 [WebLLM](https://github.com/mlc-ai/web-llm) 在 WebGPU 上推理，首次加载会从公开模型列表下载权重并缓存到浏览器；之后可以离线复用。

页面提供三档：

- **极速**：SmolLM2 135M，下载最小，适合先跑通动作循环；
- **平衡**：Qwen2.5 0.5B，规划能力更好，体积更大；
- **质量**：Llama 3.2 1B，JSON 动作更稳，但下载和推理都更慢。

如果只想体验 agent 动作，直接点「演示大脑」即可，零下载。首次加载可以取消并重试；加载完成后模型会进入浏览器缓存。

模型输出被约束为单个 JSON 动作；工具执行后把最新页面观察喂回模型，最多 8 步。

## 沙盒

`山岚咖啡` 是一个完全前端的咖啡店站点：

- 首页 / 菜单 / 购物车 / 结算 / 关于；
- 加购、表单提交、订单状态都只存在于 iframe 内；
- Agent 只能通过点击、输入、滚动和页面导航来操作它；
- 对真实浏览器、真实网站没有任何访问权限。

## 工具协议

```json
{"tool":"read_page","args":{}}
{"tool":"click","args":{"id":"e7"}}
{"tool":"type","args":{"id":"e8","text":"Doran"}}
{"tool":"scroll","args":{"dy":300}}
{"tool":"navigate","args":{"page":"checkout"}}
{"tool":"done","args":{"answer":"..."}}
```

每次 `read_page` 会重新给可见可交互元素编号；`click` / `type` 只接受最新 observation 里的 id。

## 设计边界

- 这是教学/演示用 agent，不是生产级浏览器自动化；
- 模型可能输出无效 JSON 或错误 id，因此有解析失败日志和最大步数；
- 沙盒是同源 iframe，不能用来操作真实站点；
- 没有处理支付、登录、隐私或权限的机制。

## 为什么不做成 Pi 那样

Pi 的循环、会话、压缩、扩展是为「终端里的长期工作」设计的。这个迷你版只回答一个问题：

> 如果 agent 只能看见一个页面、并且只能点它，它最小需要哪些零件？

答案就是：一个循环、一组浏览器工具、一个观察格式，和一个能输出动作的模型。
