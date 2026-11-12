"""Release builds (T44). Usage (from this folder):  python build.py

Makes two things from the current src/, data/ and assets/:

1. play.html (in this folder): a single self-contained file - all code, data, art and sound packed inside.
   Double-click it to play in any modern browser, no server or install needed. Commit it so teammates can
   download the repository and open it. Regenerate it after every change to code, data or assets.

2. ../builds/kaleidoscope-spellcasting-<version>.zip for itch.io: index.html at the zip root, plus src/,
   data/, assets/, CREDITS.txt. Dev-only files (serve.py, build.py, README.md, README.txt) are left out.
"""
import base64
import json
import os
import posixpath
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
INCLUDE_DIRS = ["src", "data", "assets"]
INCLUDE_FILES = ["index.html", "CREDITS.txt"]
SKIP_NAMES = {"README.txt", ".DS_Store", "Thumbs.db"}
ENTRY = "src/main.js"

IMPORT_RE = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'([^']+)';[ \t]*$", re.M)
EXPORT_FN_RE = re.compile(r"^export\s+((?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*))", re.M)
EXPORT_DECL_RE = re.compile(r"^export\s+((?:const|let|class)\s+([A-Za-z_$][\w$]*))", re.M)


def read_version():
    with open(os.path.join(ROOT, "src", "version.js"), encoding="utf-8") as f:
        m = re.search(r"VERSION\s*=\s*'([^']+)'", f.read())
    if not m:
        sys.exit("Could not read VERSION from src/version.js")
    return m.group(1)


def check_index_version(version):
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        html = f.read()
    if f"main.js?v={version}" not in html:
        sys.exit(f"index.html does not load src/main.js?v={version} - bump it to match src/version.js")


# ---------- play.html ----------

def transform_module(path, source):
    """Turn one ES module into a function body: imports become __req() calls, exports go onto __exp."""
    deps = []

    def import_repl(m):
        names = []
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            if " as " in part:
                orig, alias = [p.strip() for p in part.split(" as ")]
                names.append(f"{orig}: {alias}")
            else:
                names.append(part)
        dep = posixpath.normpath(posixpath.join(posixpath.dirname(path), m.group(2)))
        deps.append(dep)
        return f"const {{ {', '.join(names)} }} = __req({json.dumps(dep)});"

    body = IMPORT_RE.sub(import_repl, source)
    exported = []

    def export_repl(m):
        exported.append(m.group(2))
        return m.group(1)

    body = EXPORT_FN_RE.sub(export_repl, body)
    body = EXPORT_DECL_RE.sub(export_repl, body)
    leftover = re.search(r"^\s*(import|export)\b.*$", body, re.M)
    if leftover:
        sys.exit(f"{path}: unsupported import/export form for play.html: {leftover.group(0).strip()}")
    if "</" in body:
        sys.exit(f"{path}: contains '</', which would end the inline <script> in play.html")
    body += "\n" + "".join(f"__exp.{n} = {n};\n" for n in exported)
    return body, deps


def bundle_js():
    modules = {}
    order = []
    stack = [ENTRY]
    while stack:
        path = stack.pop()
        if path in modules:
            continue
        full = os.path.join(ROOT, *path.split("/"))
        if not os.path.exists(full):
            sys.exit(f"Missing module {path}")
        with open(full, encoding="utf-8") as f:
            body, deps = transform_module(path, f.read())
        modules[path] = body
        order.append(path)
        stack.extend(deps)
    parts = [
        "(function () {",
        "'use strict';",
        "var __mods = {}, __cache = {};",
        "function __req(p) { if (p in __cache) return __cache[p]; var e = {}; __cache[p] = e; __mods[p](e); return e; }",
    ]
    for path in order:
        parts.append(f"__mods[{json.dumps(path)}] = function (__exp) {{\n{modules[path]}\n}};")
    parts.append(f"__req({json.dumps(ENTRY)});")
    parts.append("})();")
    return "\n".join(parts), len(order)


def embed_assets():
    data = {}
    for fn in sorted(os.listdir(os.path.join(ROOT, "data"))):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(ROOT, "data", fn), encoding="utf-8") as f:
            try:
                data[fn] = json.load(f)
            except json.JSONDecodeError as e:
                sys.exit(f"data/{fn} is not valid JSON ({e}) - fix it before building")
    media = {"art": {}, "audio": {}}
    kinds = {"art": (".png", "image/png"), "audio": (".mp3", "audio/mpeg")}
    for kind, (ext, mime) in kinds.items():
        folder = os.path.join(ROOT, "assets", kind)
        for fn in sorted(os.listdir(folder)):
            if fn.lower().endswith(ext):
                with open(os.path.join(folder, fn), "rb") as f:
                    b64 = base64.b64encode(f.read()).decode("ascii")
                media[kind][fn[: -len(ext)]] = f"data:{mime};base64,{b64}"
    return {"data": data, **media}


def build_play_html(version):
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        index = f.read()
    style = re.search(r"<style>.*?</style>", index, re.S)
    style = style.group(0) if style else ""
    js, module_count = bundle_js()
    embed = json.dumps(embed_assets(), separators=(",", ":")).replace("</", "<\\/")
    html = (
        "<!doctype html>\n"
        f"<!-- Kaleidoscope Spellcasting v{version} - single-file build generated by build.py. Do not edit:\n"
        "     change src/, data/ or assets/ and run `python build.py` again. Double-click to play. -->\n"
        '<html lang="en">\n<head>\n  <meta charset="utf-8">\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
        "  <title>Kaleidoscope Spellcasting</title>\n"
        f"  {style}\n</head>\n<body>\n"
        '  <canvas id="game"></canvas>\n'
        f"  <script>window.KS_EMBED = {embed};</script>\n"
        f"  <script>\n{js}\n  </script>\n</body>\n</html>\n"
    )
    out = os.path.join(ROOT, "play.html")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print(f"Built {out}: {module_count} modules, {os.path.getsize(out) / 1024:.0f} KB")


# ---------- itch.io zip ----------

def build_zip(version):
    out_dir = os.path.join(os.path.dirname(ROOT), "builds")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"kaleidoscope-spellcasting-{version}.zip")
    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name in INCLUDE_FILES:
            z.write(os.path.join(ROOT, name), name)
            count += 1
        for d in INCLUDE_DIRS:
            for dirpath, _, files in os.walk(os.path.join(ROOT, d)):
                for fn in sorted(files):
                    if fn in SKIP_NAMES:
                        continue
                    full = os.path.join(dirpath, fn)
                    z.write(full, os.path.relpath(full, ROOT).replace(os.sep, "/"))
                    count += 1
    print(f"Built {out}: {count} files, {os.path.getsize(out) / 1024:.0f} KB")


def main():
    version = read_version()
    check_index_version(version)
    build_play_html(version)
    build_zip(version)


if __name__ == "__main__":
    main()
