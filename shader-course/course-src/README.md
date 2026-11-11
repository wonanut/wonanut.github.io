# shader-course/course-src — WebGL Shader 内功课构建源

`course-src/` 是 `shader-course/index.html`（单文件课程）的构建源。日常阅读只需要 `index.html`；这里用于修改与重新生成。

```
course-src/
  manifest.json      # 课程元数据：11 章、分阶段标题、文件名
  template.html      # 页面外壳 + WebGL demo runtime（CSS/GLSL/JS 均内联）
  build.py           # 校验 fragment → 拼装 → 输出 ../index.html
  STYLEGUIDE.md      # 写作契约（组件 class、结构、质量要求）
  fragments/         # 11 个章节 fragment，每章一个 <section>
```

## 构建

```sh
cd shader-course
python3 course-src/build.py          # 生成 shader-course/index.html
python3 course-src/build.py --check  # 只校验
python3 course-src/build.py --stats  # 每章中文字数 / 代码块 / 折叠区
```

构建会校验：每章恰好一个 `<section class="chapter">`、标题/导语/目标/类比/深入/≥3 自测/≥2 代码块/结论卡；代码块内 `<`、`&` 必须转义。

## 实时 Demo

Demo 不用额外文件：章节里写 `<div class="demo" data-demo="gradient"></div>`，`template.html` 底部的 runtime 会创建 canvas、编译 shader、处理时间/鼠标/尺寸/可见性暂停。

可用 `data-demo`：

`gradient` · `triangle` · `pulse` · `pattern` · `noise` · `sdf` · `raymarch` · `ripple` · `scene` · `toon`

新增 demo 时，在 template 的 `DEMOS` 对象里加 vertex/fragment 源码，再在 fragment 里放一个容器即可。

## 内容来源

课程基于 WebGL 1 / GLSL ES 1.00 规范与 MDN、[WebGL Fundamentals](https://webglfundamentals.org/) 等公开资料编写；GLSL 示例与 demo 均为本课程原创，不依赖 Three.js 或任何框架。
