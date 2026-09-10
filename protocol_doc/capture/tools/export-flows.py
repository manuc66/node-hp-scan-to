from mitmproxy import http
import os
import re
import time

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exported")
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, "summary.txt"), "w", encoding="utf-8")
SAFE = re.compile(r'[^A-Za-z0-9._-]+')


def _safe(path):
    return SAFE.sub("_", path).strip("_")


def _write_body(flow: http.HTTPFlow, resp: http.Response):
    if not resp.raw_content:
        return
    ctype = resp.headers.get("content-type", "")
    if ctype.startswith("image"):
        ext = "img"
    elif "xml" in ctype:
        ext = "xml"
    elif "json" in ctype:
        ext = "json"
    elif ctype.startswith("text"):
        ext = "text"
    else:
        ext = "bin"
    ts = time.strftime("%H%M%S", time.localtime(flow.request.timestamp_start))
    name = _safe(f"{ts}_{flow.request.method}_{flow.request.path.strip('/').replace('/', '_')}")
    fn = os.path.join(OUT, f"{name}.{ext}")
    with open(fn, "wb") as f:
        f.write(resp.raw_content)


def response(flow: http.HTTPFlow):
    req = flow.request
    resp = flow.response
    ctype = resp.headers.get("content-type", "")
    LOG.write(f"{req.method} {req.pretty_url} -> {resp.status_code} | {ctype} | {len(resp.raw_content or b'')} bytes\n")
    LOG.flush()
    _write_body(flow, resp)