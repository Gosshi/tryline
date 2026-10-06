"""Serve actual local Next SSR HTML without React, for Playwright first-paint tests.

Start a synthetic local preview on 3108, then run this script. Open
http://127.0.0.1:3109/?state=on&page=/calendar (also off, / and /matches/...)
and evaluate tests/browser/web-spoiler-guard.mjs using browser_evaluate.
No remote services, credentials or database writes are used.
"""
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen

ORIGIN = "http://127.0.0.1:3108"


class FirstPaintPreview(BaseHTTPRequestHandler):
    def do_GET(self):
        request = urlparse(self.path)
        if request.path.startswith("/_next/") or request.path in ("/manifest.webmanifest", "/favicon.ico"):
            with urlopen(ORIGIN + self.path) as response:
                self.send_response(200)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/octet-stream"))
                self.end_headers()
                self.wfile.write(response.read())
            return
        params = parse_qs(request.query)
        path = params.get("page", ["/"])[0]
        state = params.get("state", ["off"])[0]
        if path not in ("/", "/calendar", "/matches/dcd576dd-f778-4690-b4e1-3d960bd664f1") or state not in ("on", "off"):
            self.send_error(400)
            return
        with urlopen(ORIGIN + path) as response:
            html = response.read().decode()
        def keep_bootstrap(match):
            attrs = match.group(1)
            return match.group(0) if "spoiler-guard-bootstrap" in attrs or "application/ld+json" in attrs else ""
        html = re.sub(r"<script\b([^>]*)>[\s\S]*?</script>", keep_bootstrap, html, flags=re.I)
        monitor = '''<script>localStorage.setItem("tryline:spoiler-guard","STATE");window.__spoilerLeaks=[];function inspectSpoilers(){if(localStorage.getItem("tryline:spoiler-guard")!=="on")return;for(var e of document.querySelectorAll("[data-spoiler-value]")){if(e.getClientRects().length&&e.textContent.trim())window.__spoilerLeaks.push(e.textContent.trim());}}new MutationObserver(inspectSpoilers).observe(document,{childList:true,subtree:true});function inspectFrame(){inspectSpoilers();requestAnimationFrame(inspectFrame);}requestAnimationFrame(inspectFrame);</script>'''.replace("STATE", state)
        html = re.sub(r"(<head[^>]*>)", r"\1" + monitor, html, count=1)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode())

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    print("Local first-paint proof: http://127.0.0.1:3109", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 3109), FirstPaintPreview).serve_forever()
