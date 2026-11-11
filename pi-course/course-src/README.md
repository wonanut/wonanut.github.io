# pi-course/course-src — Pi 内功课构建源

`course-src/` 是 `pi-course/index.html`（单文件课程）的构建源。日常阅读只需要 `index.html`；这里用于修改与重新生成。

```
course-src/
  manifest.json      # 课程元数据：10 章、分阶段标题、文件名
  template.html      # 页面外壳：CSS + 目录/搜索/主题/代码高亮/进度 JS
  build.py           # 校验 fragment → 拼装 → 输出 ../index.html
  STYLEGUIDE.md      # 写作契约（组件 class、结构、质量要求）
  fragments/         # 10 个章节 fragment，每章一个 <section>
```

## 构建

```sh
cd pi-course
python3 course-src/build.py          # 生成 pi-course/index.html
python3 course-src/build.py --check  # 只校验
python3 course-src/build.py --stats  # 每章中文字数 / 代码块 / 折叠区
```

构建会校验：每章恰好一个 `<section class="chapter">`、标题/导语/目标/类比/深入/≥3 自测/≥2 代码块/结论卡；代码块内 `<`、`&` 必须转义。

## 发布

```sh
cd pi-course
python3 course-src/build.py --check
python3 course-src/build.py
cd ..
git add pi-course
git commit -m "course(pi): ..."
git push
```

`pi-course/index.html` 是站点实际访问的构建产物，必须一起提交。

## 内容来源

课程基于开源仓库 [earendil-works/pi](https://github.com/earendil-works/pi)（MIT）的 `packages/agent`、`packages/coding-agent` 源码与 `docs/` 编写；对应 coding-agent 1.5.2。上游实现会继续演进，遇到描述与源码不一致时以仓库为准。课程与 Pi 作者无隶属关系。
