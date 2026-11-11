#!/usr/bin/env python3
"""Assemble the single-file course from fragments + template.

Usage:
    python3 course-src/build.py            # build ../course.html (all chapters required)
    python3 course-src/build.py --check    # validate fragments only, no output
    python3 course-src/build.py --allow-missing   # build with whatever exists
    python3 course-src/build.py --stats    # print per-chapter statistics
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # shader-course/course-src
COURSE = ROOT.parent                              # shader-course
SRC = ROOT
FRAG = SRC / "fragments"
OUT = COURSE / "index.html"

REQUIRED = {
    "chapter-title": 1,
    "chapter-lede": 1,
    "objectives": 1,
    "analogy": 1,
    "deep": 1,
    "quiz": 3,
}

ENTITY_RE = re.compile(r"&(?!(?:amp|lt|gt|quot|apos|nbsp|hellip|mdash|ndash|times|rarr|check|middot|laquo|raquo|copy|reg|trade|deg|plusmn|frac12|frac14|sup2|sup3|alpha|beta|gamma|delta|pi|sigma|omega|Delta|Sigma|Omega|le|ge|ne|asymp|infin|sum|prod|int|radic|there4|sim|cong|equiv|sub|sup|nsub|sube|supe|oplus|otimes|perp|sdot|larr|uarr|darr|harr|crarr|forall|exist|empty|nabla|isin|notin|ni|and|or|cap|cup|there4|sect|para|dagger|Dagger|bull|prime|Prime|euro|pound|yen|cent|curren|szlig|agrave|aacute|acirc|atilde|auml|aring|aelig|ccedil|egrave|eacute|ecirc|euml|igrave|iacute|icirc|iuml|ntilde|ograve|oacute|ocirc|otilde|ouml|oslash|ugrave|uacute|ucirc|uuml|yacute|yuml|Agrave|Aacute|Acirc|Atilde|Auml|Aring|AElig|Ccedil|Egrave|Eacute|Ecirc|Euml|Igrave|Iacute|Icirc|Iuml|Ntilde|Ograve|Oacute|Ocirc|Otilde|Ouml|Oslash|Ugrave|Uacute|Ucirc|Uuml|Yacute|yuml|alpha|beta|chi|delta|epsilon|eta|iota|kappa|lambda|mu|nu|omega|phi|pi|psi|rho|sigma|tau|theta|upsilon|xi|zeta|Alpha|Beta|Chi|Delta|Epsilon|Eta|Iota|Kappa|Lambda|Mu|Nu|Omega|Phi|Pi|Psi|Rho|Sigma|Tau|Theta|Upsilon|Xi|Zeta|harr|hArr|rArr|lArr|dArr|lsquo|rsquo|ldquo|rdquo|sbquo|bdquo|lsaquo|rsaquo|oline|frasl|weierp|image|real|alefsym|lArr|rArr|hArr|forall|part|exist|empty|nabla|isin|notin|ni|prod|sum|minus|lowast|radic|prop|infin|ang|and|or|cap|cup|int|there4|sim|cong|asymp|ne|equiv|le|ge|sub|sup|nsub|sube|supe|oplus|otimes|perp|sdot|lceil|rceil|lfloor|rfloor|lang|rang|loz|spades|clubs|hearts|diams|OElig|oelig|Scaron|scaron|Yuml|circ|tilde|ensp|emsp|thinsp|zwnj|zwj|lrm|rlm|shy|#\d+|#x[0-9a-fA-F]+);)", re.S)


def fail(msg):
    print("  ✗ " + msg)
    return False


def check_fragment(ch):
    path = FRAG / ch["file"]
    if not path.is_file():
        return None
    html = path.read_text(encoding="utf-8")
    ok = True
    print("· %s  %s" % (ch["id"], ch["file"]))

    sec = re.search(r'<section\b[^>]*\bid="([^"]+)"[^>]*>', html)
    if not sec:
        ok = fail("缺少 <section id=...>")
    elif sec.group(1) != ch["id"]:
        ok = fail("section id 应为 %s，实际 %s" % (ch["id"], sec.group(1)))
    if "class=" not in (sec.group(0) if sec else ""):
        ok = fail("<section> 需要 class=\"chapter\"")

    if html.count("<section") != 1 or html.count("</section>") != 1:
        ok = fail("每个 fragment 必须恰好包含一个 <section>…</section>")

    for name, minimum in REQUIRED.items():
        count = len(re.findall(r'class="[^"]*\b%s\b' % re.escape(name), html))
        if count < minimum:
            ok = fail("组件 %s 至少需要 %d 个，实际 %d 个" % (name, minimum, count))

    code_blocks = len(re.findall(r"<pre\b", html))
    if code_blocks < 2:
        ok = fail("至少需要 2 个代码块，实际 %d 个" % code_blocks)

    if "<script" in html or "<style" in html:
        ok = fail("fragment 中不允许出现 <script> / <style>")
    if "<html" in html or "<body" in html:
        ok = fail("fragment 中不允许出现 <html> / <body>")
    for m in re.finditer(r'(?:src|href)="(https?://[^"]+)"', html):
        tag_start = html.rfind("<", 0, m.start())
        tag = html[tag_start:m.end()]
        if re.match(r"<(?:img|script|link|iframe|video|audio|source)\b", tag, re.I):
            ok = fail("不允许引用外部资源：%s" % m.group(1))

    # unescaped '<' or bare '&' inside code blocks.
    # The optional <code> wrapper is legitimate markup, so strip it before
    # checking the code payload itself; any other '<' inside <pre> is a bug.
    for m in re.finditer(r"<pre[^>]*>(.*?)</pre>", html, re.S):
        raw = m.group(1)
        inner = re.sub(r"</?code\b[^>]*>", "", raw)
        if "<" in inner:
            ok = fail("代码块内有未转义的 '<'（应写成 &lt;）：%s…" % inner[max(0, inner.find("<") - 30):inner.find("<") + 30].replace("\n", " "))
        bad = ENTITY_RE.search(raw)
        if bad:
            ok = fail("代码块内有裸 '&'（应写成 &amp;）：…%s…" % raw[max(0, bad.start() - 25):bad.start() + 25].replace("\n", " "))

    # duplicate ids inside fragment
    ids = re.findall(r'\sid="([^"]+)"', html)
    if len(ids) != len(set(ids)):
        ok = fail("fragment 内存在重复 id")

    return ok


def curlify_quotes(html):
    """Turn straight double quotes in prose into Chinese curly quotes.

    Quoted tokens inside <pre>/<code> and inside tags are left untouched, so
    code samples and attributes keep their ASCII quotes. A segment with an odd
    number of quotes is skipped to avoid mismatched pairing.
    """
    parts = re.split(r"(<pre\b.*?</pre>|<code\b.*?</code>)", html, flags=re.S)
    for i in range(0, len(parts), 2):
        segments = re.split(r"(<[^>]*>)", parts[i])
        for j in range(0, len(segments), 2):
            seg = segments[j]
            if seg.count('"') % 2 == 0:
                seg = re.sub(r'"([^"\n]{1,160})"', "\u201c\\1\u201d", seg)
            segments[j] = seg
        parts[i] = "".join(segments)
    return "".join(parts)


def typeset(html):
    """Collapse source line-wraps so Chinese text does not show stray spaces.

    Writers wrap long paragraphs across lines; browsers turn those newlines into
    a space, which looks wrong between Chinese characters. Only text outside
    <pre> is touched, and only whitespace that contains a newline.
    """
    CJK = r"\u4e00-\u9fff"
    CJK_END = r"\u4e00-\u9fff。，、；：！？）】」』”’…"
    parts = re.split(r"(<pre\b.*?</pre>)", html, flags=re.S)
    for i in range(0, len(parts), 2):
        t = parts[i]
        t = re.sub(r"([" + CJK_END + r"])[ \t]*\n[ \t]+(?=[" + CJK_END + r"（【「『“‘<])", r"\1", t)
        t = re.sub(r"(</(?:b|code|strong|em|i|span)>)[ \t]*\n[ \t]+(?=[" + CJK + r"（【「『“‘])", r"\1", t)
        parts[i] = t
    return "".join(parts)


def build_sidebar(manifest):
    parts = {p["id"]: p for p in manifest["parts"]}
    out = []
    current = None
    for ch in manifest["chapters"]:
        if ch["part"] != current:
            if current is not None:
                out.append("    </div>")
            current = ch["part"]
            part = parts[current]
            out.append('    <div class="nav-part" data-part="%s">' % part["id"])
            out.append('      <p class="nav-part-title">%s</p>' % part["title"])
        out.append(
            '      <a class="nav-link" href="#%s" data-ch="%s">'
            '<span class="nav-num">%s</span><span class="nav-label">%s</span>'
            '<span class="nav-check" data-check="%s" role="checkbox" aria-checked="false" tabindex="0"></span>'
            "</a>" % (ch["id"], ch["id"], ch["num"], ch["nav"], ch["id"])
        )
    if current is not None:
        out.append("    </div>")
    return "\n".join(out)


def stats(html, label):
    text = re.sub(r"<[^>]+>", "", html)
    cjk = len(re.findall(r"[\u4e00-\u9fff]", text))
    print("   %-22s 中文 %5d 字 · 代码块 %2d · 深入 %d · 自测 %d" % (
        label, cjk, len(re.findall(r"<pre\b", html)),
        html.count("<details class=\"deep"), html.count("<details class=\"quiz")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验，不生成 index.html")
    ap.add_argument("--allow-missing", action="store_true", help="允许章节缺失，生成预览")
    ap.add_argument("--stats", action="store_true", help="输出每章统计")
    args = ap.parse_args()

    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
    chapters = manifest["chapters"]

    print("校验 fragments …")
    missing, failed = [], []
    for ch in chapters:
        result = check_fragment(ch)
        if result is None:
            missing.append(ch)
        elif not result:
            failed.append(ch)
    if missing:
        print("  ! 缺少 %d 个 fragment：%s" % (len(missing), ", ".join(c["id"] for c in missing)))
    if failed:
        print("  ✗ %d 个 fragment 校验失败：%s" % (len(failed), ", ".join(c["id"] for c in failed)))
        return 1
    if missing and not (args.allow_missing or args.check):
        print("  请补齐 fragment 或使用 --allow-missing 生成预览。")
        return 1
    if args.check:
        print("校验通过。")
        return 0

    template = (SRC / "template.html").read_text(encoding="utf-8")
    pieces = []
    for idx, ch in enumerate(chapters):
        path = FRAG / ch["file"]
        if not path.is_file():
            continue
        html = curlify_quotes(typeset(path.read_text(encoding="utf-8").strip()))
        prev_ch = chapters[idx - 1] if idx > 0 else None
        next_ch = chapters[idx + 1] if idx + 1 < len(chapters) else None
        nav = ['<nav class="chapter-nav" aria-label="章节导航">']
        if prev_ch and (FRAG / prev_ch["file"]).is_file():
            nav.append('<a class="prev" href="#%s"><span class="dir">← 上一讲</span><span class="name">%s</span></a>'
                       % (prev_ch["id"], prev_ch["nav"]))
        if next_ch and (FRAG / next_ch["file"]).is_file():
            nav.append('<a class="next" href="#%s"><span class="dir">下一讲 →</span><span class="name">%s</span></a>'
                       % (next_ch["id"], next_ch["nav"]))
        nav.append("</nav>\n")
        pos = html.rfind("</section>")
        html = html[:pos] + "\n" + "\n".join(nav) + html[pos:]
        pieces.append(html)

    content = "\n\n".join(pieces)
    html = template.replace("<!--SIDEBAR-->", build_sidebar(manifest)).replace("<!--CONTENT-->", content)
    html = html.replace("{{TITLE}}", manifest["title"]).replace("{{DESCRIPTION}}", manifest["description"])

    ids = re.findall(r'\sid="([^"]+)"', html)
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        print("  ✗ 全文中存在重复 id：%s" % ", ".join(dupes))
        return 1

    if args.stats:
        for ch in chapters:
            path = FRAG / ch["file"]
            if path.is_file():
                stats(path.read_text(encoding="utf-8"), ch["id"] + " " + ch["title"])

    OUT.write_text(html, encoding="utf-8")
    size_kb = OUT.stat().st_size / 1024
    print("✓ 生成 %s（%.1f KB，%d 章）" % (OUT.relative_to(COURSE.parent), size_kb, len(pieces)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
