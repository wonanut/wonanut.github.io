# wonanut.github.io

Doran 的个人站点：<https://wonanut.github.io/>

西安交通大学计算机技术硕士，在华为上海从事技术研究，关注交互体验、企业海量数据治理、知识图谱与 Agent 企业落地。

- 首页：个人介绍、精选作品、项目列表、联系方式（手写 HTML/CSS/JS，无构建步骤）
- [`course/`](course/)：中文课程《Claude Code 内功课》——沿开源仓库 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 的 17 个机制，从零理解 Agent Harness。单文件、离线可读，源码在 [`course/course-src/`](course/course-src/)。

## 结构

```
index.html            首页
assets/               样式、脚本、头像、favicon
course/               课程（index.html + 构建源 + 许可与署名）
404.html              404 页
.nojekyll             关闭 Jekyll，直接按静态文件发布
```

## 本地预览

```sh
python3 -m http.server 8000
# 打开 http://localhost:8000/
```

课程改动后重新生成：

```sh
cd course
python3 course-src/build.py
```

## 许可

- 站点与课程文字：MIT（见 [`course/LICENSE`](course/LICENSE)）
- 课程引用的上游源码：MIT，署名见 [`course/NOTICE.md`](course/NOTICE.md)
