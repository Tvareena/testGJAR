"""Build the upload zip for itch.io (T44): index.html at the zip root, plus src/, data/, assets/, CREDITS.txt.

Usage (from this folder):  python build.py
Output: ../builds/kaleidoscope-spellcasting-<version>.zip
Dev-only files (serve.py, build.py, README.md, assets README.txt files) are left out.
"""
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
INCLUDE_DIRS = ["src", "data", "assets"]
INCLUDE_FILES = ["index.html", "CREDITS.txt"]
SKIP_NAMES = {"README.txt", ".DS_Store", "Thumbs.db"}


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


def main():
    version = read_version()
    check_index_version(version)
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
    size_kb = os.path.getsize(out) / 1024
    print(f"Built {out}: {count} files, {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
