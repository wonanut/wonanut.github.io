# 写作规范（Course Style Guide）

> 这是给所有写手看的**唯一契约**。目标：21 个 fragment 拼在一起，读起来像一个人写的。

课程最终产物：仓库根目录 **`course.html`**（单文件、离线可读、带侧边栏导航）。
你的产出：`course-src/fragments/<file>.html` 里的**一个 `<section>` 片段**。

---

## 1. 课程定位

- 读者画像：会 Python、用过 ChatGPT/Claude，**没写过 agent**，但愿意读源码。
- **混合难度**：主干通俗（打比方、讲动机、讲取舍），源码细节/边界情况放进可折叠的 `🔬 深入` 区块。
- 语气：第二人称、口语化、有判断（"这个设计的关键不在 X，而在 Y"），不要教科书腔，不要营销腔。
- 每一讲只回答三个问题：**为什么需要它 → 它怎么工作 → 为什么这样设计**。
- 不要照抄 `sXX_*/README.zh.md`。原文是参考资料，你是**重写**：补类比、补动机、补实验、补自测、补误区。
- 禁止使用外部图片/字体/CDN。图示一律用 `.flow` 组件或文字图。

---

## 2. Fragment 总骨架（照抄结构，替换内容）

```html
<section id="ch02" class="chapter">
  <p class="chapter-kicker">第 2 讲 · 阶段一 · 让 Agent 动起来</p>
  <h2 class="chapter-title">Agent Loop：一个 while 循环，就是 Agent 的全部秘密
    <small>对应 s01_agent_loop：约 150 行 Python，一个工具，一个循环</small>
  </h2>
  <p class="chapter-lede">一句话说清这一讲要解决的矛盾：模型能"说"要做的事，却不会"做"。</p>
  <p class="source-line">
    <span>源码 <code>s01_agent_loop/code.py</code></span>
    <span>原章 <a href="s01_agent_loop/README.zh.md">README.zh.md</a></span>
  </p>
  <ul class="objectives">
    <li class="obj-title">学完这一讲，你会</li>
    <li>用 30 行代码写出一个能自己连续行动的循环</li>
    <li>说清"模型负责决策、harness 负责执行"到底怎么分工</li>
  </ul>
  <div class="chapter-body">
    <h3><span class="h3num">01</span>从一个真实的麻烦说起</h3>
    <p>……</p>
    <div class="analogy">
      <span class="analogy-title">像给厨师配一个传菜口</span>
      <p>……</p>
    </div>
    <!-- 其余小节 -->
  </div>
  <div class="takeaway">
    <span class="tk-label">这一讲带走</span>
    <p>一句话总结本章机制。</p>
    <p class="next"><b>下一讲：</b>一句话预告，制造一点好奇。</p>
  </div>
</section>
```

**必检结构**（`build.py --check` 会校验）：1 个 `<section class="chapter">`、1 个 `.chapter-title`、1 个 `.chapter-lede`、1 个 `.objectives`、≥1 个 `.analogy`、≥1 个 `.deep`、≥3 个 `.quiz`、≥2 个 `<pre>` 代码块、1 个 `.takeaway`。
不要自己写 `.chapter-nav`（构建脚本自动加）。

**推荐章节顺序**：
1. 一个真实麻烦（场景 + 痛点）
2. 直觉：只加一个机制（方案 + `.flow` 示意图 + 关键决策点）
3. 代码精读（2–6 个代码块，逐块解释"这行在防什么"）
4. 🔬 深入（折 1–2 个：边界情况 / 为什么不用另一种设计 / 生产环境差异）
5. 动手实验（2 个，写清楚改哪里、跑什么、该看到什么）
6. 常见误区（2–3 条）
7. 自测（3–5 题）
8. `.takeaway` + 下一讲预告

---

## 3. 组件库（只能用这些 class，不许内联 style）

### 代码块（重点！必须转义）
```html
<pre data-lang="python"><code>def agent_loop(messages: list):
    while True:
        response = client.messages.create(...)
        if not tool_calls:
            return
</code></pre>
```
- `data-lang` 取值：`python` `bash` `text` `json` `yaml` `sql`。
- 代码里 `<` → `&lt;`，`>` → `&gt;`，`&` → `&amp;`。**未转义会导致构建失败 / 页面错乱。**
- 代码必须来自对应 `code.py` 的真实片段，可删减，但删减处要留 `# ...` 或 `# （略）` 注释；不要"凭感觉写伪代码"。
- 单个代码块建议 ≤ 22 行，只保留理解机制必需的行；完整实现用行号/函数名指路。

### 行内代码
`<code class="inline-code">messages[]</code>` → `messages[]`

### 生活类比（每章至少 1 个）
```html
<div class="analogy">
  <span class="analogy-title">像给厨师配一个传菜口</span>
  <p>模型是厨师，能炒菜但走不出厨房；tool_use 是订单，harness 是传菜口……</p>
  <p><b>类比到哪为止：</b>真实厨房不会把订单原样退回，而循环会把 tool_result 塞回 messages。</p>
</div>
```

### 提示框（4 种，按语义选）
```html
<div class="callout insight"><span class="callout-title">设计要点</span><p>……</p></div>
<div class="callout tip"><span class="callout-title">小技巧</span><p>……</p></div>
<div class="callout warn"><span class="callout-title">注意</span><p>……</p></div>
<div class="callout key"><span class="callout-title">关键结论</span><p>……</p></div>
```

### 流程 / 结构图
```html
<div class="flow">
  <div class="flow-node"><b>User</b>提问</div>
  <div class="flow-arrow">→</div>
  <div class="flow-node"><b>LLM</b>返回 tool_use</div>
  <div class="flow-arrow">→</div>
  <div class="flow-node accent"><b>Harness</b>执行工具</div>
  <div class="flow-arrow">→</div>
  <div class="flow-node"><b>messages[]</b>追加结果</div>
</div>
```
竖向用 `<div class="flow down">`。节点内可放 `<code>`。

### 步骤
```html
<ol class="steps">
  <li><b>先改这里</b>：把 run_bash 换成查表，观察……</li>
  <li><b>再跑</b>：<code class="inline-code">python s02_tool_use/code.py</code>，输入……</li>
</ol>
```

### 折叠：深入
```html
<details class="deep">
  <summary>🔬 深入：多工具并发时，谁在保证顺序？</summary>
  <div class="deep-body">
    <p>……</p>
    <details class="deep deep-2">
      <summary>再深一层：Anthropic API 对并行 tool_use 的约束</summary>
      <div class="deep-body"><p>……</p></div>
    </details>
  </div>
</details>
```

### 折叠：自测（每章 3–5 题）
```html
<details class="quiz">
  <summary>如果把 tools 参数传成空列表，循环还会继续吗？</summary>
  <div class="answer"><p>不会。循环是否继续只看响应里有没有 tool_use block……</p></div>
</details>
```

### 表格
```html
<div class="table-wrap">
  <table>
    <thead><tr><th>信号</th><th>含义</th><th>循环动作</th></tr></thead>
    <tbody>
      <tr><td>有 tool_use</td><td>模型要调工具</td><td>执行并回填</td></tr>
    </tbody>
  </table>
</div>
```

### 对比卡片 / 数据
```html
<div class="card-grid">
  <div class="card"><h4>方案 A</h4><p>……</p></div>
  <div class="card"><h4>方案 B</h4><p>……</p></div>
</div>
```
`<div class="stats"><div class="stat"><b>30</b><span>行</span></div></div>`、`<span class="pill">标签</span>`、`<span class="pill accent">重点</span>` 均可用。

### 结论卡（每章末尾，必有）
```html
<div class="takeaway">
  <span class="tk-label">这一讲带走</span>
  <p>……</p>
  <p class="next"><b>下一讲：</b>……</p>
</div>
```

---

## 4. 写作质量要求

- 正文中文 **≥ 3000 字**（含代码解释、实验说明；不算代码本身），整文件建议 350–550 行。
- 每个技术点都要回答"**为什么**"，不能只罗列 API。
- 类比要具体（厨房、快递分拣、图书馆借书、公司审批流……），并点明类比失效的地方。
- 代码精读要贴"真实实现"：指出函数名、关键变量、防御性分支（例如为什么 `tool_result` 必须带 `tool_use_id`）。
- 实验必须可执行：给出命令/提示词、观察点、预期现象；没有 API Key 的读者也能通过"读代码 + 改代码"完成。
- 常见误区用"很多人以为……其实……"的句式，要真能纠错。
- 自测题至少 1 题考"误解"，答案要给出推理过程，不只有结论。
- 术语统一（中英混排用空格）：

| 统一写法 | 不要写 |
|---|---|
| Agent 循环 / 循环 | 智能体回路 |
| `messages[]` | 消息列表（首次出现可注） |
| `tool_use` block / `tool_result` | 工具调用块 |
| harness（运行框架） | 脚手架 / 框架 |
| 子代理（subagent） | 子智能体 |
| 队友（teammate） | 队员 / 成员（可注） |
| 上下文压缩（compact） | 压缩上下文 |
| 权限（permission） / 钩子（hook） | 许可 / 挂钩 |
| 工作树（worktree） | 工作区（worktree 是 git 概念，别混） |

- 链接：仓库内文件用相对路径（`s08_context_compact/code.py`），外链用完整 URL。只链接真实存在的文件/章节。
- HTML 只用本文件列出的 class；需要局部强调用 `<b>` `<code class="inline-code">` `<mark>`，禁止 style 属性。

---

## 5. 自我验收（提交前必须做）

```sh
cd /Users/doran/Documents/code/learn-claude-code
python3 course-src/build.py --check
```
- 你自己的 fragment 必须显示通过；其他未完成的 fragment 显示"缺少"属于正常。
- 若报"代码块内有未转义"，把 `<` 写成 `&lt;`。
- 若报组件数量不足，补齐 `.analogy` / `.deep` / `.quiz` / 代码块。
- 最后再自问：**一个完全没接触过 agent 的朋友，读你的主干能懂吗？一个老手，翻你的折叠区能有收获吗？**

---

## 6. 文件命名与边界

只改**分配给你的 fragment 文件**，不要改 `template.html`、`manifest.json`、`build.py`、别人的 fragment，也不要动仓库里 `sXX_*/` 的源码。
需要改公共样式或发现构建脚本问题：在完成消息里告诉 Lead，不要自行修改。
