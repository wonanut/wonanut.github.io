# WebGL Shader 课程写作规范

目标：10 个 fragment 拼成一份风格统一的单页 shader 课。输出是 `shader-course/index.html`，源文件在 `shader-course/course-src/`。

## 定位

- 读者：会 JavaScript，见过 canvas/前端，但没有系统写过 GPU shader。
- 混合难度：主干用类比与 Demo 讲直觉，语法和性能细节放进 `<details class="deep">`。
- 语气：第二人称、口语化、有判断；不写 API 手册式复述。
- 每章回答：它解决什么画面问题 → shader 怎么写 → 为什么这样设计。

## 章节骨架

```html
<section id="chNN" class="chapter">
  <p class="chapter-kicker">第 N 讲 · 阶段</p>
  <h2 class="chapter-title">标题<small>一句补充</small></h2>
  <p class="chapter-lede">一句话讲清本章要解决的问题。</p>
  <p class="source-line"><span>Demo N · 名称</span><span>关键词 <code>...</code></span></p>
  <ul class="objectives"><li class="obj-title">学完这一讲，你会</li><li>……</li></ul>
  <div class="chapter-body">
    <h3><span class="h3num">01</span>小节标题</h3>
    <p>……</p>
    <div class="demo" data-demo="gradient" data-label="DEMO 01 · gradient" data-cap="一句操作提示"></div>
    <div class="analogy"><span class="analogy-title">……</span><p>……</p></div>
    <pre data-lang="glsl"><code>…</code></pre>
    <details class="deep"><summary>🔬 深入：……</summary><div class="deep-body"><p>……</p></div></details>
    <details class="quiz"><summary>问题？</summary><div class="answer"><p>答案与推理过程。</p></div></details>
    <div class="takeaway"><span class="tk-label">这一讲带走</span><p>……</p></div>
  </div>
</section>
```

构建强制：1 个 `.chapter`、`.chapter-title`、`.chapter-lede`、`.objectives`、≥1 `.analogy`、≥1 `.deep`、≥3 `.quiz`、≥2 `<pre>`、1 `.takeaway`。

## 组件

- Demo：`<div class="demo" data-demo="…" data-label="…" data-cap="…"></div>`；`data-demo` 必须在 template 的 `DEMOS` 中存在。
- 代码：`<pre data-lang="glsl|js|html|text"><code>…</code></pre>`；`<` 写 `&lt;`，`&` 写 `&amp;`。
- 行内代码：`<code class="inline-code">…</code>`。
- 提示框：`<div class="callout insight|tip|warn|key"><span class="callout-title">…</span><p>…</p></div>`。
- 流程图：`<div class="flow"><div class="flow-node">…</div><div class="flow-arrow">→</div>…</div>`。
- 禁止：在 fragment 里写 `<script>`、`<style>`、外部图片/字体。

## 质量要求

- 每章正文中文 ≥ 650 字；有 Demo 的章节优先把篇幅留给「为什么」和「改一行会怎样」。
- 代码必须能运行；展示时只保留解释当前概念所需的部分，省略用 `// ...`。
- 自测至少 1 题考常见误解，答案给出推理过程。
- 写完运行 `python3 course-src/build.py --check`，再运行 `--stats` 看结构。
