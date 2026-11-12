"""Local dev server for the prototype: like `python -m http.server`, but tells the browser never to cache.

Without this, browsers may keep running an old copy of a JavaScript module after you edit it,
even on a normal reload. Usage (from this folder):  python serve.py        (port 8000)
                                                    python serve.py 8080   (another port)
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("", port), handler) as server:
        print(f"Serving {root} at http://localhost:{port} (no caching). Ctrl+C to stop.")
        server.serve_forever()


if __name__ == "__main__":
    main()
