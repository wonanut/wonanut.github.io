# course-src — 课程构建源文件

`course-src/` 是仓库根目录 **`index.html`**（单文件中文课程）的构建源。日常阅读只需要 `index.html`，这里说明如何修改与重新生成。

## 目录

```
course-src/
  manifest.json      # 课程元数据：标题、7 个阶段、21 章的 id/导航标题/源码对应
  template.html      # 页面外壳：CSS 设计系统 + 侧边栏/阅读进度/搜索/主题/代码高亮 JS
  build.py           # 构建脚本：校验 fragment → 拼装 → 排版 → 输出 index.html
  STYLEGUIDE.md      # 写作契约（组件 class、结构、质量要求）
  fragments/         # 21 个章节 fragment，每章一个 <section>
```

## 构建

```sh
cd course

python3 course-src/build.py            # 校验并生成 index.html
python3 course-src/build.py --check    # 只校验，不写文件
python3 course-src/build.py --allow-missing   # 预览：缺章也生成
python3 course-src/build.py --stats    # 每章中文字数 / 代码块 / 折叠区统计
```

构建脚本会做这些检查：

- 每个 fragment 恰好一个 `<section id="chXX" class="chapter">`，id 与 manifest 一致；
- 必备组件：标题、导语、学习目标、类比、1 个折叠深入区、≥3 道自测、≥2 个代码块、结论卡；
- 代码块内 `<`、`&` 必须转义（防止页面错乱）；
- 不允许 fragment 内出现 `<script>`/`<style>`/外部资源；
- 全文 id 唯一。

## 排版处理

构建时会自动做两件展示层的规整：

1. **中文换行空格**：作者把长段落折行书写，浏览器会把换行渲染成空格。`typeset()` 会把「中文/中文标点 + 换行 + 中文」处的空白去掉（`<pre>` 内不动）。
2. **中文引号**：正文里的直引号 `"…"` 转成 `“…”`；`<pre>`、`<code>` 和标签属性内不动。

## 新增或修改一章

1. 在 `manifest.json` 的 `chapters` 里登记（id、part、nav、file、source、readme）；
2. 复制一个现有 fragment，按 `STYLEGUIDE.md` 改写；
3. `python3 course-src/build.py --check` 通过后重新构建。

不要直接改 `index.html` —— 它每次构建都会被覆盖。

## 更新并发布到 GitHub Pages

改完章节后，用下面这套流程发布（本站就是 `wonanut.github.io` 仓库的 `master` 分支）：

```sh
cd course
python3 course-src/build.py --check   # 结构/转义校验，必须通过
python3 course-src/build.py           # 重新生成 index.html
cd ..
git add -A
git commit -m "course: 更新 <章节或主题>"
git push
```

推送后 GitHub Pages 会在一分钟内重新发布。提交前请确认 `course/index.html` 也一起提交了 —— 页面实际访问的是构建产物，不是 `course-src`。

> 课程源码（`course-src/`）就是公开的，方便对照与二次修改；许可见课程根目录的 `LICENSE` 与 `NOTICE.md`。

## 内容来源

章节正文是对上游仓库 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 的 `s01_agent_loop/` … `s17_goal_loop/` 的**重新讲解**，不是原文翻译：主线补动机与类比，深入折叠区补源码级细节、边界与设计取舍，每章附动手实验与自测。遇到描述与源码不一致时，以仓库源码为准。
