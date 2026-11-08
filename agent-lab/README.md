# Agent 实验室 · 静态独立版

> 线上地址：<https://wonanut.github.io/agent-lab/>

把 DSH Web UI 插件 [`agent-lab-plugin`](https://github.com/wonanut/dsh-plugins/tree/main/agent-lab-plugin) 搬到个人主页的独立网页版。同一份引擎代码，在浏览器里跑一个「迷你 Agent 解剖教室」：

- **体验**：左侧会话、中间模拟 TUI、右侧检查器（流转 / 上下文 / 记忆），输入一句话就能看到上下文组装、模型决策、工具调用、记忆写入与压缩的完整链路；
- **数据流**：把当前轮次拆成可回放的节点图；
- **源码**：构建时内嵌的 13 个客户端源文件 + Host 半侧，所见即所跑；
- **原理**：12 节中文长文，把最小 agent 循环讲清楚。

默认是**规则驱动的模拟模型**：离线、无需登录、回答可复现。真实 DeepSeek 模式需要安装在 DSH Web UI 中运行（依赖 Host 路由和账号），本站不提供该能力：`status` 会返回「未连接」，模式开关保持禁用。

## 上游与许可

- 上游插件：[`wonanut/dsh-plugins · agent-lab-plugin`](https://github.com/wonanut/dsh-plugins/tree/main/agent-lab-plugin)
- 上游提交：`7e79bc7af93e`
- 许可：MIT（见本目录 [`LICENSE`](./LICENSE)），版权归上游作者所有

本目录只做「静态运行适配」，不修改插件业务逻辑：

1. `src/` 与 `host-index.js` 是上游源码副本（`src/95-apply.js` 的 slot 注册在本站未使用）；
2. `build.mjs` 把源码拼成一个 IIFE，暴露 `window.AgentLab.Page`，替代上游的 `window.__ModuleLoader__` 注册方式；
3. `index.html` 提供页面外壳，并把 DSH 设计变量（`--dsw-alias-*`）映射成站点的深色主题；
4. `vendor/` 是本地化的 React 18.3.1 UMD（不再依赖 CDN）。

## 目录

```
agent-lab/
  index.html        # 页面外壳 + 主题 token + 启动脚本
  app.js            # 构建产物（提交到仓库，线上直接加载）
  build.mjs         # 构建脚本：src/ → app.js
  src/              # 上游 13 个客户端源文件
  host-index.js     # 上游 Host 半侧（只用于「源码」页展示）
  package.json      # 上游包元数据（版本、描述）
  vendor/           # React 18.3.1 UMD
  status            # GET /agent-lab/status 的静态响应（声明真实模式不可用）
  icon.svg          # 插件图标
  LICENSE           # 上游 MIT 许可证
```

## 构建

```sh
cd agent-lab
node build.mjs --check              # 只做语法校验
node build.mjs --commit <upstream-sha>   # 生成 app.js
```

## 从上游更新插件

```sh
# 1. 拉取最新上游
git clone --depth 1 git@github.com:wonanut/dsh-plugins.git /tmp/dsh-plugins
cd /tmp/dsh-plugins && git rev-parse --short=12 HEAD   # 记录提交号

# 2. 覆盖本目录源码
cp /tmp/dsh-plugins/agent-lab-plugin/src/*.js  <site>/agent-lab/src/
cp /tmp/dsh-plugins/agent-lab-plugin/index.js  <site>/agent-lab/host-index.js
cp /tmp/dsh-plugins/agent-lab-plugin/package.json <site>/agent-lab/package.json

# 3. 重新构建并发布
cd <site>/agent-lab && node build.mjs --commit <upstream-sha>
git add -A && git commit -m "lab: sync agent-lab-plugin @<sha>" && git push
```

## 说明

- 这是个人作品集里的交互式项目页，不是 DSH 的官方托管版本；真实模型、账号与工具执行仍以 DSH 环境为准。
- UI 依赖 DSH 的设计 token，本站在 `index.html` 里提供了深色映射；如果你在别处复用，需要按自己的设计系统映射 `--dsw-alias-*`。
