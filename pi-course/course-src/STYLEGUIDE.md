# Pi 课程写作规范

目标：10 个 fragment 拼成一份风格统一的单页源码课。输出是 `pi-course/index.html`，源文件在 `pi-course/course-src/`。

## 定位

- 读者：会 TypeScript / Java / Python 中至少一种，用过 LLM Agent，但没系统读过 Pi 源码。
- 混合难度：主干用类比与流程图讲动机，源码细节放进 `<details class="deep">`。
- 语气：第二人称、口语化、有判断；不写营销腔，不复述官方文档。
- 每章回答：为什么需要 → 它怎么工作 → 源码为什么这样设计。

## 章节骨架

```html
<section id="chNN" class="chapter">
  <p class="chapter-kicker">第 N 讲 · 阶段</p>
  <h2 class="chapter-title">标题<small>一句补充</small></h2>
  <p class="chapter-lede">一句话讲清本章矛盾。</p>
  <p class="source-line"><span>源码 <code>packages/...</code></span></p>
  <ul class="objectives">
    <li class="obj-title">学完这一讲，你会</li>
    <li>……</li>
  </ul>
  <div class="chapter-body">
    <h3><span class="h3num">01</span>小节标题</h3>
    <p>……</p>
    <div class="analogy"><span class="analogy-title">……</span><p>……</p></div>
    <div class="flow">…</div>
    <pre data-lang="ts"><code>…</code></pre>
    <details class="deep"><summary>🔬 深入：……</summary><div class="deep-body"><p>……</p></div></details>
    <details class="quiz"><summary>问题？</summary><div class="answer"><p>答案与推理过程。</p></div></details>
    <div class="takeaway"><span class="tk-label">这一讲带走</span><p>……</p></div>
  </div>
</section>
```

构建强制：1 个 `.chapter`、`.chapter-title`、`.chapter-lede`、`.objectives`、≥1 `.analogy`、≥1 `.deep`、≥3 `.quiz`、≥2 `<pre>`、1 `.takeaway`。

## 组件

- 代码：`<pre data-lang="ts|bash|json|text"><code>…</code></pre>`；`<` 写 `&lt;`，`&` 写 `&amp;`。
- 行内代码：`<code class="inline-code">…</code>`。
- 提示框：`<div class="callout insight|tip|warn|key"><span class="callout-title">…</span><p>…</p></div>`。
- 流程图：`<div class="flow"><div class="flow-node">…</div><div class="flow-arrow">→</div>…</div>`。
- 步骤：`<ol class="steps"><li>…</li></ol>`；表格：`<div class="table-wrap"><table>…</table></div>`。
- 卡片：`<div class="card-grid"><div class="card"><h4>…</h4><p>…</p></div></div>`。
- 禁止：`<script>`、`<style>`、外部图片/字体。

## 质量要求

- 每章正文中文 ≥ 1300 字；核心章节（02/03/04/05）目标 1500–2200 字。
- 代码必须来自真实源码，可删减但要用 `// ...` 标注；不要写「看起来像」的伪代码。
- 自测至少 1 题考常见误解，答案给出推理过程。
- 术语：Agent 循环、`messages[]`、`toolCall` / `toolResult`、harness、子代理（subagent）。
- 写完运行 `python3 course-src/build.py --check`，再运行 `--stats` 看字数与结构。
