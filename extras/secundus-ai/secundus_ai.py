#!/usr/bin/env python3
"""
SECUNDUS // AI  -  a lightweight web chat for hailo-ollama on the Raspberry Pi AI HAT+ 2.

No Docker, no pip installs: plain Python 3 standard library.

  Run it:            python3 secundus_ai.py
  Open it:           http://localhost:8080          (on the Pi)
                     http://<pi-ip>:8080            (phone / PC on the same Wi-Fi)
  Start at boot:     python3 secundus_ai.py --install
  Remove boot start: python3 secundus_ai.py --uninstall

Claude Code mode (online, Pi screen only):
  1. Install Claude Code:  curl -fsSL https://claude.ai/install.sh | bash
  2. Save your API key:    python3 secundus_ai.py --claude-key
  3. Open http://localhost:8080 on the Pi and pick a Claude model in the dropdown.
  Claude edits files freely inside ~/aurelia-work; every command (and any change
  outside that folder) waits for Approve / Deny in the chat.

Options: --port 8080  --backend http://127.0.0.1:8000  --host 0.0.0.0 (use 127.0.0.1 for Pi-only)
         --claude-budget 1.00  (max US$ Claude may spend per message)
"""
import argparse
import getpass
import http.client
import json
import os
import queue
import re
import secrets
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.4.0"
READ_TIMEOUT = 900  # seconds to wait on the HAT (first load of a model can be slow)

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000
PORT = 8080
STATE = {"hat_busy": 0, "last_model": None, "last_reply": 0.0}
STATE_LOCK = None  # set in main() (threading imported below)


# --------------------------------------------------------------------------- server

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "SecundusAI/" + VERSION

    def log_message(self, fmt, *args):  # quieter log: only proxied model calls and errors
        path = getattr(self, "path", "") or ""  # not set yet when the request line is garbage
        code = str(args[1]) if len(args) > 1 else ""
        if not path and code == "400":
            return  # https/garbage request, already explained by log_error
        if path.startswith("/api/chat") or code[:1] in ("4", "5"):
            sys.stderr.write("[web] %s %s\n" % (self.address_string(), fmt % args))

    def log_error(self, fmt, *args):
        msg = fmt % args
        if "Bad request version" in msg or "Bad HTTP/0.9" in msg or "Bad request syntax" in msg:
            sys.stderr.write("[web] Got an https:// request. Use http://localhost:%d instead.\n"
                             % self.server.server_address[1])
        else:
            sys.stderr.write("[web] %s %s\n" % (self.address_string(), msg))

    # -- helpers
    def send_bytes(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, code, obj, close=False):
        if close:  # we didn't read the request body, so don't reuse this connection
            self.close_connection = True
        self.send_bytes(code, json.dumps(obj).encode(), "application/json",
                        {"Connection": "close"} if close else None)

    # -- routes
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path in ("/", "/index.html"):
            return self.send_bytes(200, PAGE.encode(), "text/html; charset=utf-8")
        if path == "/manifest.json":
            return self.send_bytes(200, MANIFEST.encode(), "application/manifest+json")
        if path == "/icon.svg":
            return self.send_bytes(200, ICON.encode(), "image/svg+xml")
        if path == "/alarm":
            a = load_alarm()
            a["next"] = next_alarm_label(a)
            return self.send_json(200, a)
        if path == "/status":  # small, cached feed for status screens (aurelia_oled.py)
            h = backend_health(max_age=20)
            return self.send_json(200, {
                "backend": h["backend"], "models": h["models"], "version": VERSION,
                "hat_busy": STATE["hat_busy"] > 0, "last_model": STATE["last_model"],
                "last_reply": STATE["last_reply"], "claude_busy": CURRENT["run"] is not None})
        if path == "/health":
            h = backend_health(max_age=5)
            h["claude"] = claude_status(self)
            return self.send_json(200, h)
        if path.startswith("/api/") or path.startswith("/hailo/"):
            return self.proxy("GET")
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/claude/chat":
            return self.claude_chat()
        if path == "/claude/decide":
            return self.claude_decide()
        if path == "/claude/perm":
            return self.claude_perm()
        if path == "/claude/stop":
            return self.claude_stop()
        if path in ("/alarm", "/alarm/test"):
            return self.alarm_post(path)
        if path.startswith("/api/") or path.startswith("/hailo/"):
            return self.proxy("POST")
        self.send_json(404, {"error": "not found"}, close=True)

    # -- streaming pass-through to hailo-ollama
    def proxy(self, method):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        gen = method == "POST" and urllib.parse.urlsplit(self.path).path in ("/api/chat", "/api/generate")
        if gen:
            try:
                STATE["last_model"] = json.loads(body or b"{}").get("model") or STATE["last_model"]
            except ValueError:
                pass
            with STATE_LOCK:
                STATE["hat_busy"] += 1
        try:
            return self._proxy(method, body)
        finally:
            if gen:
                with STATE_LOCK:
                    STATE["hat_busy"] -= 1
                STATE["last_reply"] = time.time()

    def _proxy(self, method, body):
        conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=READ_TIMEOUT)
        try:
            headers = {"Content-Type": "application/json"} if body is not None else {}
            conn.request(method, self.path, body=body, headers=headers)
            resp = conn.getresponse()
        except OSError as e:
            conn.close()
            return self.send_json(502, {
                "error": "hailo-ollama isn't answering on port %d (%s). Start it with: hailo-ollama"
                         % (BACKEND_PORT, e.__class__.__name__)})

        self.send_response(resp.status)
        self.send_header("Content-Type", resp.getheader("Content-Type") or "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        try:
            while True:
                try:
                    chunk = resp.read1(8192)
                except http.client.IncompleteRead as e:  # backend cut the stream short
                    chunk = e.partial
                    if chunk:
                        self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
                    break
                except socket.timeout:
                    msg = json.dumps({"error": "The HAT went quiet for %d s. Check the hailo-ollama terminal." % READ_TIMEOUT}).encode() + b"\n"
                    self.wfile.write(b"%x\r\n%s\r\n" % (len(msg), msg))
                    break
                if not chunk:
                    break
                self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # browser pressed Stop or closed the tab: drop the backend connection too
        finally:
            conn.close()
            self.close_connection = True


    # -- Claude Code bridge (only for the browser on the Pi itself)
    def read_body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}") if n else {}
        except ValueError:
            return None

    def claude_guard(self):
        origin = self.headers.get("Origin")
        ok_origin = origin in (None, "http://localhost:%d" % PORT, "http://127.0.0.1:%d" % PORT)
        if is_local(self) and self.headers.get("X-Secundus") == "1" and ok_origin:
            return True
        self.send_json(403, {"error": "Claude mode only works in the browser on the Pi itself, at http://localhost:%d" % PORT}, close=True)
        return False

    def claude_chat(self):
        if not self.claude_guard():
            return
        req = self.read_body()
        if not isinstance(req, dict) or not (req.get("prompt") or "").strip():
            return self.send_json(400, {"error": "Empty message."})
        exe = claude_bin()
        if not exe:
            return self.send_json(503, {"error": "Claude Code isn't installed on the Pi yet. In a terminal run: curl -fsSL https://claude.ai/install.sh | bash"})
        key = read_key()
        if not RUN_LOCK.acquire(blocking=False):
            return self.send_json(409, {"error": "Claude is still working on the last message. Wait, or press Stop."})
        run = ClaudeRun()
        CURRENT["run"] = run
        try:
            os.makedirs(WORKDIR, exist_ok=True)
            ensure_claude_md()
            model = req.get("model") if req.get("model") in CLAUDE_MODELS else "sonnet"
            prompt = req["prompt"].strip()
            session = req.get("session") or ""
            ctx = (req.get("context") or "").strip()
            if ctx and not session:
                prompt = ("Earlier in this chat, with the offline assistant:\n" + ctx[-6000:] +
                          "\n\nMarshall's new message:\n" + prompt)
            hook = "%s %s --perm-hook" % (shlex.quote(sys.executable), shlex.quote(os.path.abspath(__file__)))
            settings = {"hooks": {"PermissionRequest": [
                {"matcher": "*", "hooks": [{"type": "command", "command": hook, "timeout": 600}]}]}}
            cmd = [exe, "-p", prompt, "--output-format", "stream-json", "--verbose",
                   "--include-partial-messages", "--permission-mode", "acceptEdits",
                   "--model", model, "--max-budget-usd", "%.2f" % CLAUDE_BUDGET,
                   "--settings", json.dumps(settings),
                   "--append-system-prompt", CLAUDE_SYSTEM + (TUTOR_RULE if req.get("tutor") else "")]
            if session and re.fullmatch(r"[0-9A-Za-z_-]{8,80}", session):
                cmd += ["--resume", session]
            env = dict(os.environ, SECUNDUS_HOOK_TOKEN=HOOK_TOKEN, SECUNDUS_PORT=str(PORT))
            if key:
                env["ANTHROPIC_API_KEY"] = key
            try:
                run.proc = subprocess.Popen(cmd, cwd=WORKDIR, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                            stderr=subprocess.PIPE, env=env, text=True, bufsize=1,
                                            start_new_session=True)
            except OSError as e:
                return self.send_json(500, {"error": "Couldn't start Claude Code: %s" % e})
            threading.Thread(target=pump_claude, args=(run,), daemon=True).start()
            threading.Thread(target=run.read_stderr, daemon=True).start()
            sys.stderr.write("[claude] %s: %s\n" % (model, req["prompt"].strip()[:80]))

            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()

            def emit(obj):
                data = (json.dumps(obj) + "\n").encode()
                self.wfile.write(b"%x\r\n%s\r\n" % (len(data), data))
                self.wfile.flush()
            try:
                while True:
                    try:
                        ev = run.q.get(timeout=2)
                    except queue.Empty:
                        emit({"type": "ping"})  # also how we notice the browser pressed Stop
                        continue
                    if ev is None:
                        break
                    emit(ev)
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                sys.stderr.write("[claude] stopped from the chat\n")
        finally:
            run.stop()
            CURRENT["run"] = None
            RUN_LOCK.release()
            self.close_connection = True

    def alarm_post(self, path):
        if self.headers.get("X-Secundus") != "1":
            return self.send_json(403, {"error": "forbidden"}, close=True)
        req = self.read_body()
        if not isinstance(req, dict):
            return self.send_json(400, {"error": "bad request"})
        a = load_alarm()
        if path == "/alarm/test":
            a["test_at"] = time.time()
        else:
            hhmm = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
            if "enabled" in req:
                a["enabled"] = bool(req["enabled"])
            if hhmm.match(str(req.get("time", ""))):
                a["time"] = req["time"]
            if hhmm.match(str(req.get("night_start", ""))):
                a["night_start"] = req["night_start"]
            if isinstance(req.get("days"), list):
                a["days"] = sorted({int(d) for d in req["days"] if str(d).isdigit() and 0 <= int(d) <= 6})
        save_alarm(a)
        a["next"] = next_alarm_label(a)
        self.send_json(200, a)

    def claude_stop(self):
        if not self.claude_guard():
            return
        self.read_body()
        run = CURRENT["run"]
        if run:
            threading.Thread(target=run.stop, daemon=True).start()
        self.send_json(200, {"ok": True})

    def claude_decide(self):
        if not self.claude_guard():
            return
        req = self.read_body() or {}
        slot = PENDING.get(str(req.get("id")))
        if not slot:
            return self.send_json(404, {"error": "That request already timed out or finished."})
        slot["allow"] = bool(req.get("allow"))
        slot["ev"].set()
        self.send_json(200, {"ok": True})

    def claude_perm(self):
        # called by our own PermissionRequest hook, which Claude Code runs on this Pi
        if self.client_address[0] not in LOOPBACK or self.headers.get("X-Secundus-Token") != HOOK_TOKEN:
            return self.send_json(403, {"allow": False}, close=True)
        req = self.read_body() or {}
        run = CURRENT["run"]
        if not run:
            return self.send_json(200, {"allow": False})
        pid = secrets.token_hex(6)
        slot = {"ev": threading.Event(), "allow": False}
        PENDING[pid] = slot
        run.perms.add(pid)
        name = str(req.get("tool_name") or "a tool")
        run.q.put({"type": "perm", "id": pid, "name": name, "detail": tool_detail(name, req.get("tool_input"))})
        answered = slot["ev"].wait(570)
        PENDING.pop(pid, None)
        if not answered:
            run.q.put({"type": "perm_done", "id": pid, "allow": False})
        sys.stderr.write("[claude] %s %s\n" % ("approved" if slot["allow"] else "denied", name))
        self.send_json(200, {"allow": slot["allow"]})


# --------------------------------------------------------------------------- Claude Code helpers

LOOPBACK = ("127.0.0.1", "::1", "::ffff:127.0.0.1")
HOOK_TOKEN = secrets.token_hex(16)
CLAUDE_BUDGET = 1.00
CLAUDE_MODELS = ["sonnet", "opus", "haiku"]
WORKDIR = os.path.expanduser("~/aurelia-work")
KEY_FILE = os.path.expanduser("~/.config/secundus-ai/anthropic_key")
ALARM_FILE = os.path.expanduser("~/.config/secundus-ai/alarm.json")
ALARM_DEFAULT = {"enabled": False, "time": "06:30", "days": [0, 1, 2, 3, 4], "night_start": "22:00",
                 "snooze_min": 9, "test_at": 0}


def load_alarm():
    a = dict(ALARM_DEFAULT)
    try:
        with open(ALARM_FILE) as f:
            a.update(json.load(f))
    except (OSError, ValueError):
        pass
    return a


def save_alarm(a):
    os.makedirs(os.path.dirname(ALARM_FILE), exist_ok=True)
    tmp = ALARM_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({k: a[k] for k in ALARM_DEFAULT}, f, indent=1)
    os.replace(tmp, ALARM_FILE)


def next_alarm_label(a, now=None):
    if not a.get("enabled") or not a.get("days"):
        return None
    import datetime
    now = now or datetime.datetime.now()
    h, m = map(int, a["time"].split(":"))
    for add in range(8):
        d = now + datetime.timedelta(days=add)
        t = d.replace(hour=h, minute=m, second=0, microsecond=0)
        if d.weekday() in a["days"] and t > now:
            return ("Today " if add == 0 else "Tomorrow " if add == 1 else (t.strftime("Next %a ") if add == 7 else t.strftime("%a "))) + a["time"]
    return None
RUN_LOCK = threading.Lock()
CURRENT = {"run": None}
PENDING = {}

CLAUDE_SYSTEM = (
    "You are working on Secundus Station: Marshall's Raspberry Pi 5 (4 GB RAM, Raspberry Pi OS, user "
    + getpass.getuser() + ") with an AI HAT+ 2. Marshall talks to you through the Aurelia web chat on the Pi, "
    "not a terminal: he sees your replies and the commands you run, but not their output, so tell him what you "
    "found. He is learning Linux and electronics; when you run or suggest a command, say in a few words what it "
    "does. Your working folder is ~/aurelia-work; keep new files there unless he names another place. "
    "Each command you run waits for him to tap Approve, so batch work into fewer commands where you can. "
    "Keep replies short, in plain markdown.")
TUTOR_RULE = (" Tutor mode is on: don't give the final answer first. Give one hint; if he is still stuck, "
              "show a worked example of a similar problem; give the exact answer only when he asks for it.")

CLAUDE_MD = """# Secundus Station - notes for Claude Code

- Raspberry Pi 5, 4 GB RAM, Raspberry Pi OS (Debian), hostname secundus-station.
- Raspberry Pi AI HAT+ 2 (Hailo-10H) running hailo-ollama on port 8000; Aurelia is the offline assistant on it.
- The Aurelia web chat (secundus_ai.py) runs on port 8080 and is how Marshall talks to you here.
- Marshall is learning Linux, Python, Arduino (Elegoo UNO R3 kit, Arduino IDE 1.8.19) and radio.
- Explain commands briefly. Prefer small, safe steps. Ask before deleting anything.
- Keep project files in this folder (~/aurelia-work) unless told otherwise.

Edit this file to teach Claude more about your setup.
"""


def is_local(h):
    host = (h.headers.get("Host") or "").lower()
    host = host[1:host.index("]")] if host.startswith("[") and "]" in host else host.split(":")[0]
    return h.client_address[0] in LOOPBACK and host in ("localhost", "127.0.0.1", "::1")


def claude_bin():
    p = shutil.which("claude")
    if p:
        return p
    for c in ("~/.local/bin/claude", "~/.claude/local/claude", "/usr/local/bin/claude", "/usr/bin/claude"):
        c = os.path.expanduser(c)
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def read_key():
    try:
        with open(KEY_FILE) as f:
            return f.read().strip()
    except OSError:
        return os.environ.get("ANTHROPIC_API_KEY", "")


def claude_status(h):
    return {"installed": bool(claude_bin()), "key": bool(read_key()), "local": is_local(h),
            "models": CLAUDE_MODELS, "budget": CLAUDE_BUDGET, "busy": CURRENT["run"] is not None}


def ensure_claude_md():
    p = os.path.join(WORKDIR, "CLAUDE.md")
    if not os.path.exists(p):
        with open(p, "w") as f:
            f.write(CLAUDE_MD)


def tool_detail(name, inp):
    if not isinstance(inp, dict):
        return ""
    for k in ("command", "file_path", "notebook_path", "path", "url", "pattern", "query", "description"):
        if inp.get(k):
            v = str(inp[k])
            return v if len(v) <= 500 else v[:500] + "..."
    return json.dumps(inp)[:300]


def friendly_error(text):
    t = (text or "").strip()
    low = t.lower()
    if "credit balance" in low:
        return "Your Anthropic Console account is out of credit. Top it up at console.anthropic.com."
    if "api key" in low or "authentication" in low or "401" in low or "not logged in" in low or "/login" in low:
        return ("Claude Code couldn't sign in. Save your API key with: "
                "python3 ~/secundus-ai/secundus_ai.py --claude-key  (then restart this server)")
    if "getaddrinfo" in low or "enotfound" in low or "network" in low or "econnrefused" in low:
        return "Claude Code can't reach the internet. Check the Pi's Wi-Fi; Aurelia still works offline."
    return t.splitlines()[-1][:400] if t else ""


class ClaudeRun:
    def __init__(self):
        self.q = queue.Queue()
        self.proc = None
        self.perms = set()
        self.err = ""

    def read_stderr(self):
        for line in self.proc.stderr:
            self.err = (self.err + line)[-4000:]

    def stop(self):
        for pid in list(self.perms):  # deny anything still waiting on a tap
            slot = PENDING.get(pid)
            if slot:
                slot["ev"].set()
        p = self.proc
        if not p or p.poll() is not None:
            return
        for sig, wait in ((signal.SIGINT, 5), (signal.SIGTERM, 5), (signal.SIGKILL, 2)):
            try:
                os.killpg(p.pid, sig)
                p.wait(wait)
                return
            except subprocess.TimeoutExpired:
                continue
            except OSError:
                return


def pump_claude(run):
    """Turn Claude Code's stream-json into small events for the page."""
    streamed = saw_result = False
    try:
        for line in run.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except ValueError:
                continue
            t = o.get("type")
            if o.get("parent_tool_use_id"):
                continue  # subagent chatter
            if t == "stream_event":
                e = o.get("event") or {}
                if e.get("type") == "content_block_start" and (e.get("content_block") or {}).get("type") == "text" and streamed:
                    run.q.put({"type": "text", "text": "\n\n"})
                d = e.get("delta") or {}
                if e.get("type") == "content_block_delta" and d.get("type") == "text_delta" and d.get("text"):
                    streamed = True
                    run.q.put({"type": "text", "text": d["text"]})
            elif t == "assistant":
                for b in (o.get("message") or {}).get("content") or []:
                    if b.get("type") == "tool_use":
                        run.q.put({"type": "tool", "name": b.get("name"), "detail": tool_detail(b.get("name"), b.get("input"))})
                    elif b.get("type") == "text" and b.get("text") and not streamed:
                        run.q.put({"type": "text", "text": b["text"] + "\n\n"})
            elif t == "system" and o.get("subtype") == "init":
                run.q.put({"type": "init", "model": o.get("model"), "session_id": o.get("session_id")})
            elif t == "system" and o.get("subtype") == "api_retry":
                run.q.put({"type": "status", "text": "Connection trouble, retrying (%s of %s)..." % (o.get("attempt"), o.get("max_retries"))})
            elif t == "result":
                saw_result = True
                err = bool(o.get("is_error")) or str(o.get("subtype", "")).startswith("error")
                msg = o.get("result") if (err or not streamed) else None
                if err:
                    msg = friendly_error(msg or "") or msg or o.get("subtype")
                    if o.get("subtype") == "error_max_budget_usd":
                        msg = "Stopped at the $%.2f per-message limit. Ask it to continue, or raise --claude-budget." % CLAUDE_BUDGET
                run.q.put({"type": "done", "session_id": o.get("session_id"), "cost": o.get("total_cost_usd"),
                           "error": err, "result": msg})
        run.proc.wait()
    except Exception as e:  # never leave the page hanging
        run.err += "\n%s" % e
    if not saw_result:
        run.q.put({"type": "error", "error": friendly_error(run.err) or
                   "Claude Code stopped without answering (exit code %s)." % run.proc.returncode})
    run.q.put(None)


def perm_hook():
    """Run by Claude Code as a PermissionRequest hook: ask the chat page, print the decision."""
    try:
        data = json.load(sys.stdin)
    except ValueError:
        data = {}
    allow = False
    conn = http.client.HTTPConnection("127.0.0.1", int(os.environ.get("SECUNDUS_PORT", "8080")), timeout=590)
    try:
        conn.request("POST", "/claude/perm", body=json.dumps({"tool_name": data.get("tool_name"),
                                                              "tool_input": data.get("tool_input")}),
                     headers={"Content-Type": "application/json",
                              "X-Secundus-Token": os.environ.get("SECUNDUS_HOOK_TOKEN", "")})
        allow = bool(json.loads(conn.getresponse().read() or b"{}").get("allow"))
    except Exception:
        allow = False
    finally:
        conn.close()
    decision = {"behavior": "allow"} if allow else {
        "behavior": "deny", "message": "Marshall tapped Deny in the chat (or didn't answer). Don't retry it; explain or ask."}
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": decision}}))


def save_key():
    print("Paste your Anthropic Console API key (starts with sk-ant-). It won't show as you type.")
    key = getpass.getpass("API key: ").strip()
    if not key.startswith("sk-ant-"):
        sys.exit("That doesn't look like an Anthropic API key; nothing saved.")
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(key + "\n")
    os.chmod(KEY_FILE, 0o600)
    print("Saved to %s (only your user can read it). Restart secundus_ai.py if it's running." % KEY_FILE)


def backend_get(path, timeout=4):
    conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=timeout)
    try:
        conn.request("GET", path)
        r = conn.getresponse()
        data = r.read()
        return r.status, data
    finally:
        conn.close()


HEALTH_CACHE = {"t": 0.0, "v": None}


def backend_health(max_age=0):
    c = HEALTH_CACHE
    if c["v"] is not None and time.time() - c["t"] < max_age:
        return dict(c["v"])
    v = _backend_health()
    c["t"], c["v"] = time.time(), v
    return dict(v)


def _backend_health():
    try:
        status, data = backend_get("/api/tags")
        if status == 200:
            models = [m.get("name") or m.get("model") for m in json.loads(data).get("models", [])]
            return {"ok": True, "backend": True, "models": [m for m in models if m], "version": VERSION}
    except Exception:
        pass
    try:
        status, data = backend_get("/hailo/v1/list")
        if status == 200:
            raw = json.loads(data).get("models", [])
            models = [m if isinstance(m, str) else (m.get("name") or m.get("model")) for m in raw]
            return {"ok": True, "backend": True, "models": [m for m in models if m], "version": VERSION}
    except Exception:
        pass
    return {"ok": True, "backend": False, "models": [], "version": VERSION}


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; just picks the outbound interface
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


# --------------------------------------------------------------------------- boot services

def unit_exists(name):
    out = subprocess.run(["systemctl", "list-unit-files", name, "--no-legend"],
                         capture_output=True, text=True).stdout
    return name in out


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def write_unit(name, text):
    subprocess.run(["sudo", "tee", "/etc/systemd/system/" + name], input=text.encode(),
                   stdout=subprocess.DEVNULL, check=True)
    print("  wrote /etc/systemd/system/" + name)


def install(args):
    if not shutil.which("systemctl"):
        sys.exit("systemd not found; run the script by hand instead.")
    user = getpass.getuser()
    home = os.path.expanduser("~")
    script = os.path.abspath(__file__)
    units = []

    if unit_exists("hailo-ollama.service"):
        print("hailo-ollama.service already exists; leaving it as is.")
        units.append("hailo-ollama.service")
    else:
        exe = shutil.which("hailo-ollama")
        if not exe:
            sys.exit("Can't find the hailo-ollama command. Install the AI HAT+ 2 LLM package first.")
        if port_open(BACKEND_PORT):
            sys.exit("Something is already using port %d, probably hailo-ollama running in a terminal.\n"
                     "Close it (click that terminal and press Ctrl+C), then run --install again." % BACKEND_PORT)
        write_unit("hailo-ollama.service", """[Unit]
Description=hailo-ollama LLM server (AI HAT+ 2)
After=network.target

[Service]
User={user}
Environment=HOME={home}
ExecStart={exe}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
""".format(user=user, home=home, exe=exe))
        units.append("hailo-ollama.service")

    write_unit("secundus-ai.service", """[Unit]
Description=SECUNDUS AI web chat
After=network.target hailo-ollama.service
Wants=hailo-ollama.service

[Service]
User={user}
WorkingDirectory={wd}
ExecStart={py} {script} --port {port} --host {host} --backend http://{bh}:{bp} --claude-budget {budget}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
""".format(user=user, wd=os.path.dirname(script), py=sys.executable, script=script,
           port=args.port, host=args.host, bh=BACKEND_HOST, bp=BACKEND_PORT, budget="%.2f" % args.claude_budget))
    units.append("secundus-ai.service")

    subprocess.run(["sudo", "systemctl", "daemon-reload"], check=True)
    subprocess.run(["sudo", "systemctl", "enable", "--now"] + units, check=True)
    ip = lan_ip()
    print("\nDone. Both start at every boot.")
    print("  On the Pi:      http://localhost:%d" % args.port)
    if ip:
        print("  Phone / PC:     http://%s:%d" % (ip, args.port))
    print("  Logs:           journalctl -u hailo-ollama -u secundus-ai -f")
    print("  Note: keep %s where it is; the service runs it from there." % script)


def uninstall():
    subprocess.run(["sudo", "systemctl", "disable", "--now", "secundus-ai.service"])
    subprocess.run(["sudo", "rm", "-f", "/etc/systemd/system/secundus-ai.service"])
    subprocess.run(["sudo", "systemctl", "daemon-reload"])
    print("Removed secundus-ai.service (hailo-ollama.service left in place).")


# --------------------------------------------------------------------------- main

def main():
    global BACKEND_HOST, BACKEND_PORT
    ap = argparse.ArgumentParser(description="SECUNDUS AI web chat for hailo-ollama")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0", help="0.0.0.0 = whole network, 127.0.0.1 = this Pi only")
    ap.add_argument("--backend", default="http://127.0.0.1:8000", help="hailo-ollama address")
    ap.add_argument("--install", action="store_true", help="start hailo-ollama and this UI at every boot")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--claude-key", action="store_true", help="save your Anthropic API key for Claude mode")
    ap.add_argument("--claude-budget", type=float, default=1.00, help="max US$ Claude may spend per message")
    ap.add_argument("--perm-hook", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args()

    if args.perm_hook:
        return perm_hook()
    if args.claude_key:
        return save_key()
    global PORT, CLAUDE_BUDGET, STATE_LOCK
    PORT, CLAUDE_BUDGET = args.port, max(0.05, args.claude_budget)
    STATE_LOCK = threading.Lock()

    u = urllib.parse.urlsplit(args.backend if "//" in args.backend else "http://" + args.backend)
    BACKEND_HOST, BACKEND_PORT = u.hostname or "127.0.0.1", u.port or 8000

    if args.install:
        return install(args)
    if args.uninstall:
        return uninstall()

    try:
        srv = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as e:
        sys.exit("Can't open port %d (%s). Is it already running? Try --port 8081." % (args.port, e.strerror))
    srv.daemon_threads = True
    ip = lan_ip()
    print("SECUNDUS // AI %s" % VERSION)
    print("  hailo-ollama:  http://%s:%d  (%s)" % (BACKEND_HOST, BACKEND_PORT,
          "answering" if backend_health()["backend"] else "NOT answering yet - start it with: hailo-ollama"))
    print("  On the Pi:     http://localhost:%d" % args.port)
    if ip and args.host != "127.0.0.1":
        print("  Phone / PC:    http://%s:%d" % (ip, args.port))
    exe = claude_bin()
    print("  Claude Code:   %s" % ("ready (Pi screen only, up to $%.2f/message)" % CLAUDE_BUDGET if exe and read_key()
                                  else "installed, but no API key yet: run with --claude-key" if exe
                                  else "not installed (optional)"))
    print("  Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


# --------------------------------------------------------------------------- page

ICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#04140b"/><rect x="6" y="6" width="52" height="52" rx="8" fill="none" stroke="#39ff8a" stroke-width="3"/><text x="32" y="42" font-family="monospace" font-size="26" font-weight="700" text-anchor="middle" fill="#39ff8a">II</text></svg>"""

MANIFEST = json.dumps({
    "name": "SECUNDUS AI", "short_name": "Secundus AI", "start_url": "/", "display": "standalone",
    "background_color": "#030806", "theme_color": "#030806",
    "icons": [{"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml"}]})

PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#030806">
<title>SECUNDUS // AI</title>
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icon.svg">
<style>
:root{--bg:#030806;--panel:#07120c;--line:#14402a;--fg:#b8ffd6;--hi:#39ff8a;--dim:#5f9d7a;--err:#ff6b6b;--you:#0b2216;--glow:0 0 6px rgba(57,255,138,.45)}
[data-theme=amber]{--bg:#0a0602;--panel:#140c04;--line:#4a3110;--fg:#ffe2b0;--hi:#ffb000;--dim:#a88550;--you:#241606;--glow:0 0 6px rgba(255,176,0,.45)}
[data-theme=blueprint]{--bg:#061224;--panel:#0a1b33;--line:#1d3d66;--fg:#dbeeff;--hi:#8fd3ff;--dim:#7095bd;--you:#0e2647;--glow:0 0 6px rgba(143,211,255,.4)}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:15px/1.5 "DejaVu Sans Mono",ui-monospace,Menlo,Consolas,monospace}
body{display:flex;flex-direction:column;height:100dvh}
body::after{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);z-index:50}
button,select,input,textarea{font:inherit;color:inherit}
button{background:transparent;border:1px solid var(--line);border-radius:6px;padding:.45em .8em;cursor:pointer}
button:hover:not(:disabled){border-color:var(--hi);color:var(--hi)}
button:disabled{opacity:.4;cursor:default}
button.primary{background:var(--hi);color:var(--bg);border-color:var(--hi);font-weight:700}
button.primary:hover:not(:disabled){color:var(--bg);box-shadow:var(--glow)}
:focus-visible{outline:2px solid var(--hi);outline-offset:2px}
header{display:flex;align-items:center;gap:.6rem;padding:.55rem .8rem;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
.brand{font-weight:700;letter-spacing:.12em;color:var(--hi);text-shadow:var(--glow);white-space:nowrap}
.brand small{color:var(--dim);font-weight:400;letter-spacing:.05em;text-shadow:none}
.dot{width:9px;height:9px;border-radius:50%;background:var(--err);display:inline-block;flex:none}
.dot.on{background:var(--hi);box-shadow:var(--glow)}
.grow{flex:1}
select{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:.4em .5em;max-width:46vw}
main{flex:1;overflow-y:auto;padding:1rem .8rem 1.5rem;scroll-behavior:smooth}
.wrap{max-width:860px;margin:0 auto}
.msg{margin:0 0 1.1rem}
.who{font-size:.78rem;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;margin-bottom:.2rem}
.who b{color:var(--hi);font-weight:700}
.user .bubble{background:var(--you);border:1px solid var(--line);border-radius:8px;padding:.55rem .75rem;white-space:pre-wrap;word-wrap:break-word}
.bot .bubble{padding:.1rem 0;word-wrap:break-word}
.bot .bubble p{margin:.35rem 0 .6rem}
.bot .bubble h4{margin:.8rem 0 .3rem;color:var(--hi)}
.bot .bubble ul,.bot .bubble ol{margin:.3rem 0 .7rem;padding-left:1.4rem}
.bubble code{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:0 .3em;font-size:.93em}
.code{position:relative;margin:.5rem 0 .8rem;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
.code pre{margin:0;padding:.7rem .8rem;overflow-x:auto}
.code pre code{background:none;border:0;padding:0}
.code .copy{position:absolute;top:.3rem;right:.3rem;font-size:.75rem;padding:.15em .55em;background:var(--bg)}
.code .lang{display:block;font-size:.72rem;color:var(--dim);padding:.3rem .8rem 0}
.err .bubble{color:var(--err)}
.meta{font-size:.75rem;color:var(--dim);margin-top:.15rem}
.tool{font-size:.82rem;color:var(--dim);border-left:2px solid var(--line);padding:.05rem .55rem;margin:.2rem 0;white-space:pre-wrap;word-break:break-all}
.tool b{color:var(--fg);font-weight:700}
.perm{border:1px solid var(--hi);border-radius:8px;padding:.6rem .75rem;margin:.6rem 0;background:var(--panel);box-shadow:var(--glow)}
.perm pre{white-space:pre-wrap;word-break:break-all;margin:.45rem 0 .6rem;font-size:.85rem;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:.45rem .55rem}
.perm .row{display:flex;gap:.5rem;flex-wrap:wrap}
.perm .note{font-size:.78rem;color:var(--dim);margin-top:.4rem}
optgroup{color:var(--dim)}option{color:var(--fg)}
.think{border-left:2px solid var(--line);padding-left:.6rem;margin:.2rem 0 .6rem;color:var(--dim);font-size:.9em}
.think summary{cursor:pointer;letter-spacing:.08em}
.cursor::after{content:"\2588";color:var(--hi);animation:blink 1s steps(1) infinite;margin-left:1px}
@keyframes blink{50%{opacity:0}}
.wait{color:var(--dim);font-style:italic}
.empty{margin-top:12vh;text-align:center;color:var(--dim)}
.empty .big{font-size:1.6rem;color:var(--hi);text-shadow:var(--glow);letter-spacing:.15em;margin-bottom:.4rem}
.chips{display:flex;flex-wrap:wrap;gap:.45rem;justify-content:center;margin-top:1.2rem}
.chips button{font-size:.85rem}
footer{border-top:1px solid var(--line);background:var(--panel);padding:.6rem .8rem calc(.6rem + env(safe-area-inset-bottom))}
.composer{max-width:860px;margin:0 auto;display:flex;gap:.5rem;align-items:flex-end}
textarea{flex:1;resize:none;min-height:2.6rem;max-height:40vh;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:.55rem .65rem;line-height:1.4}
textarea:focus{border-color:var(--hi);outline:none}
.status{max-width:860px;margin:.3rem auto 0;font-size:.75rem;color:var(--dim);min-height:1.1em;display:flex;gap:.8rem}
.status .mode{margin-left:auto}
/* drawer */
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:20;display:none}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(380px,92vw);background:var(--panel);border-left:1px solid var(--line);z-index:30;transform:translateX(100%);transition:transform .2s;overflow-y:auto;padding:1rem}
body.open .drawer{transform:none}body.open .scrim{display:block}
.drawer h3{margin:1.1rem 0 .5rem;font-size:.8rem;letter-spacing:.14em;color:var(--hi);text-transform:uppercase}
.drawer h3:first-child{margin-top:0}
.drawer label{display:block;font-size:.85rem;color:var(--dim);margin:.6rem 0 .2rem}
.drawer input,.drawer select,.drawer textarea{width:100%;max-width:none;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:.45em .55em}
.seg{display:flex;gap:.35rem;flex-wrap:wrap}
.seg button[aria-pressed=true]{border-color:var(--hi);color:var(--hi);box-shadow:var(--glow)}
.chatlist{list-style:none;margin:0;padding:0}
.chatlist li{display:flex;gap:.3rem;align-items:center;margin-bottom:.3rem}
.chatlist li button.pick{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chatlist li.cur button.pick{border-color:var(--hi);color:var(--hi)}
.hint{font-size:.78rem;color:var(--dim);margin:.3rem 0 0}
.drawer label.sw{display:flex;align-items:center;gap:.5rem;color:var(--fg);font-size:.95rem}
.drawer label.sw input{width:auto;accent-color:var(--hi);transform:scale(1.3)}
.days button{min-width:2.4em;padding:.4em .5em}
.toast{position:fixed;left:50%;bottom:6rem;transform:translateX(-50%);background:var(--hi);color:var(--bg);padding:.45rem .9rem;border-radius:6px;font-weight:700;z-index:60;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (max-width:560px){.brand small{display:none}header{gap:.4rem;flex-wrap:nowrap;padding:.5rem .6rem}header button{padding:.4em .6em}select{min-width:0;flex:1 1 auto;max-width:none}.grow{display:none}}
@media (max-width:400px){.brand .ai{display:none}}
</style>
</head>
<body>
<header>
  <span class="dot" id="dot" title="hailo-ollama status"></span>
  <span class="brand">SECUNDUS<span class="ai"> // AI</span> <small>AI HAT+ 2</small></span>
  <span class="grow"></span>
  <label class="sr" for="model">Model</label>
  <select id="model"><option value="">no models</option></select>
  <button id="newBtn" title="New chat">New</button>
  <button id="menuBtn" aria-label="Chats and settings">&#9776;</button>
</header>

<main id="main"><div class="wrap" id="log" aria-live="polite"></div></main>

<footer>
  <form class="composer" id="form">
    <label class="sr" for="input">Message</label>
    <textarea id="input" rows="1" placeholder="Ask something..." autocomplete="off"></textarea>
    <button type="button" id="stopBtn" hidden>Stop</button>
    <button type="submit" class="primary" id="sendBtn">Send</button>
  </form>
  <div class="status"><span id="status">Connecting...</span><span class="mode" id="modeTag"></span></div>
</footer>

<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" aria-label="Chats and settings">
  <h3>Chats</h3>
  <ul class="chatlist" id="chatlist"></ul>
  <div class="seg" style="margin-top:.5rem"><button id="exportBtn">Export this chat</button><button id="clearBtn">Delete all</button></div>

  <h3>Mode</h3>
  <div class="seg" id="modeSeg">
    <button data-mode="assistant">Assistant</button>
    <button data-mode="tutor">Tutor</button>
    <button data-mode="custom">Custom</button>
  </div>
  <p class="hint" id="modeHint"></p>
  <div id="customWrap" hidden>
    <label for="custom">Custom system prompt</label>
    <textarea id="custom" rows="5"></textarea>
  </div>

  <h3>Settings</h3>
  <label for="name">Assistant name</label>
  <input id="name" maxlength="24">
  <label for="history">Messages of memory sent each turn</label>
  <select id="history"><option>2</option><option>4</option><option>6</option><option>10</option><option>16</option></select>
  <p class="hint">Small models on the HAT have short memories. Fewer = faster and less confused.</p>
  <label>Theme</label>
  <div class="seg" id="themeSeg">
    <button data-theme="phosphor">Phosphor</button>
    <button data-theme="amber">Amber</button>
    <button data-theme="blueprint">Blueprint</button>
  </div>
  <h3>Alarm clock</h3>
  <label class="sw"><input type="checkbox" id="alOn"> Alarm on</label>
  <label for="alTime">Wake-up time</label>
  <input type="time" id="alTime" value="06:30">
  <label>Days</label>
  <div class="seg days" id="alDays">
    <button data-day="0">M</button><button data-day="1">T</button><button data-day="2">W</button><button data-day="3">T</button><button data-day="4">F</button><button data-day="5">S</button><button data-day="6">S</button>
  </div>
  <label for="alNight">Dim night clock from</label>
  <input type="time" id="alNight" value="22:00">
  <div class="seg" style="margin-top:.7rem"><button class="primary" id="alSave">Save alarm</button><button id="alTest">Test 10 s</button></div>
  <p class="hint" id="alNext">Loading...</p>
  <p class="hint">Rings on the bedside screen: a melody first; snooze twice and it switches to beeping. Button 1 snoozes 9 min, button 2 stops.</p>

  <h3>About</h3>
  <p class="hint">Runs 100% on this Pi: hailo-ollama on port 8000 does the thinking on the Hailo-10H, this page just talks to it. Chats are saved in this browser only.</p>
  <p class="hint" id="about"></p>
</aside>
<div class="toast" id="toast" role="status"></div>

<script>
"use strict";
const $ = s => document.querySelector(s);
const log = $("#log"), main = $("#main"), input = $("#input");
const store = {
  get(k, d){ try{ const v = localStorage.getItem("sai." + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem("sai." + k, JSON.stringify(v)); }catch(e){} }
};
const DEFAULTS = {name:"Aurelia", mode:"assistant", custom:"", history:4, theme:"phosphor", model:""};
const cfg = Object.assign({}, DEFAULTS, store.get("cfg", {}));
let chats = store.get("chats", []);
let cur = chats[0] || freshChat();
let busy = false, ctrl = null, models = [], online = false, claude = null;
const isClaude = () => /^claude:/.test(cfg.model || "");

const PROMPTS = {
  assistant: n => "You are " + n + ", a helpful assistant running fully offline on Marshall's Raspberry Pi 5 cyberdeck, Secundus Station. Answer clearly and briefly. If you are not sure, say so.",
  tutor: n => "You are " + n + ", Marshall's engineering tutor. Do not give the final answer first. Give one hint. If he is still stuck, show a worked example of a similar problem. Give the exact answer only when he asks for it directly. Keep replies short.",
  custom: n => (cfg.custom.trim() || PROMPTS.assistant(n)).replace(/\{name\}/g, n)
};
const HINTS = {
  assistant: "Straight answers, kept short.",
  tutor: "Hint first, then a worked example of a similar problem, the real answer only when you ask for it.",
  custom: "Your own instructions. {name} is replaced with the assistant name."
};
const STARTERS = {
  assistant: ["Explain what a pull-up resistor does", "Write a bash one-liner to show disk usage by folder", "What is the difference between TCP and UDP?"],
  tutor: ["Quiz me on Ohm's law", "Help me work out the resistor for an LED on 5 V", "Teach me what chmod 755 means"],
  custom: ["Hello, who are you?"],
  claude: ["What's using the space on my SD card?", "Write a Python script that blinks an LED on GPIO 17", "Check if the Pi has been throttling"]
};

function freshChat(){ const c = {id: Date.now().toString(36), title: "New chat", messages: [], at: Date.now()}; chats.unshift(c); return c; }
function save(){ cur.at = Date.now(); chats = chats.filter(c => c.messages.length || c === cur).slice(0, 40); store.set("chats", chats); }
function saveCfg(){ store.set("cfg", cfg); }
function toast(t){ const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 1800); }
function name(){ return (cfg.name || "Aurelia").trim(); }
function systemPrompt(){ return PROMPTS[cfg.mode](name()); }

/* ---------- tiny markdown ---------- */
function esc(s){ return s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function inline(s){ return s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>"); }
function blocks(t){
  const lines = esc(t).split("\n"); let html = "", list = null, para = [], olN = 0;
  const endPara = () => { if(para.length){ html += "<p>" + inline(para.join("<br>")) + "</p>"; para = []; } };
  const endList = () => { if(list){ html += "</" + list + ">"; list = null; } };
  for(const l of lines){
    let m;
    if(!l.trim()){ endPara(); if(list === "ul") endList(); continue; }
    if(l.startsWith("\u27e6tool\u27e7")){ endPara(); endList(); const tl = l.slice(6), ci = tl.indexOf(": ");
      html += '<div class="tool">\u25b8 ' + (ci > 0 ? "<b>" + tl.slice(0, ci) + "</b> " + tl.slice(ci + 2) : "<b>" + tl + "</b>") + "</div>"; continue; }
    if((m = l.match(/^#{1,6}\s+(.*)/))){ endPara(); endList(); html += "<h4>" + inline(m[1]) + "</h4>"; continue; }
    if((m = l.match(/^\s*[-*•]\s+(.*)/))){
      endPara(); if(list !== "ul"){ endList(); html += "<ul>"; list = "ul"; }
      html += "<li>" + inline(m[1]) + "</li>"; continue;
    }
    if((m = l.match(/^\s*\d+[.)]\s+(.*)/))){
      endPara(); olN++; if(list !== "ol"){ endList(); html += '<ol start="' + olN + '">'; list = "ol"; }
      html += "<li>" + inline(m[1]) + "</li>"; continue;
    }
    if(list === "ol" && /^\s{2,}\S/.test(l)){ html = html.replace(/<\/li>$/, "<br>" + inline(l.trim()) + "</li>"); continue; }
    endList(); olN = 0; para.push(l);
  }
  endPara(); endList(); return html;
}
function stripThink(s){ if(!/<think>/.test(s) && /<\/think>/.test(s)) s = "<think>" + s; return s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim(); }
function md(src, model){
  let out = "", body;
  if(!/<think>/.test(src) && (/<\/think>/.test(src) || /deepseek|r1/i.test(model || ""))) src = "<think>" + src;
  body = src;
  const t = src.match(/<think>([\s\S]*?)(<\/think>|$)/);
  if(t){
    body = src.replace(t[0], "");
    const open = !t[2];
    out += '<details class="think"' + (open ? " open" : "") + "><summary>" + (open ? "thinking..." : "reasoning (tap to show)") + "</summary><div>" + esc(t[1].trim()).replace(/\n/g, "<br>") + "</div></details>";
  }
  body.replace(/^\n+/, "").split("```").forEach((p, i) => {
    if(i % 2){
      const nl = p.indexOf("\n"), lang = nl >= 0 ? p.slice(0, nl).trim() : "", code = nl >= 0 ? p.slice(nl + 1) : p;
      out += '<div class="code">' + (lang ? '<span class="lang">' + esc(lang) + "</span>" : "") + '<button class="copy" data-copy>copy</button><pre><code>' + esc(code.replace(/\n$/, "")) + "</code></pre></div>";
    } else out += blocks(p);
  });
  return out;
}

/* ---------- render ---------- */
function msgHTML(m, i){
  if(m.role === "user") return '<div class="msg user"><div class="who">you</div><div class="bubble">' + esc(m.content) + "</div></div>";
  const live = busy && i === cur.messages.length - 1;
  let inner = m.content ? md(m.content, m.model) : (live ? '<p class="wait">' + esc(m.wait || (m.claude ? "starting Claude Code..." : "warming up the HAT...")) + "</p>" : "");
  if(m.perm) inner += '<div class="perm" role="alert"><div>Claude wants to run <b>' + esc(m.perm.name) + "</b>" + (m.perm.name === "Bash" ? " (a terminal command)" : "") + ":</div>" +
    (m.perm.detail ? "<pre>" + esc(m.perm.detail) + "</pre>" : "") +
    '<div class="row"><button class="primary" data-allow="' + esc(m.perm.id) + '">Approve</button><button data-deny="' + esc(m.perm.id) + '">Deny</button></div>' +
    '<div class="note">Not sure what it does? Tap Deny and ask Claude to explain it first.</div></div>';
  return '<div class="msg bot' + (m.error ? " err" : "") + '"><div class="who"><b>' + esc(m.name || name()) + "</b>" + (m.model ? " &middot; " + esc(m.model) : "") + '</div><div class="bubble' + (live && m.content ? " cursor" : "") + '">' + inner + "</div>" + (m.meta ? '<div class="meta">' + esc(m.meta) + "</div>" : "") + "</div>";
}
function emptyHTML(){
  if(isClaude()) return '<div class="empty"><div class="big">CLAUDE CODE</div><div>Online. Works in ~/aurelia-work. Commands wait for your Approve.</div><div class="chips">' +
    STARTERS.claude.map(s => '<button data-starter="' + esc(s) + '">' + esc(s) + "</button>").join("") + "</div></div>";
  return '<div class="empty"><div class="big">' + esc(name().toUpperCase()) + '</div><div>Offline. On-device. ' + (cfg.mode === "tutor" ? "Tutor mode." : "Ask away.") + '</div><div class="chips">' +
    STARTERS[cfg.mode].map(s => '<button data-starter="' + esc(s) + '">' + esc(s) + "</button>").join("") + "</div></div>";
}
function nearBottom(){ return main.scrollHeight - main.scrollTop - main.clientHeight < 120; }
function render(stick){
  const glue = stick || nearBottom();
  log.innerHTML = cur.messages.length ? cur.messages.map(msgHTML).join("") : emptyHTML();
  if(glue) main.scrollTop = main.scrollHeight;
}
function paintLast(){
  const glue = nearBottom(), el = log.lastElementChild, i = cur.messages.length - 1;
  if(el){ el.outerHTML = msgHTML(cur.messages[i], i); } else render();
  if(glue) main.scrollTop = main.scrollHeight;
}
function renderDrawer(){
  $("#chatlist").innerHTML = chats.filter(c => c.messages.length).map(c =>
    '<li class="' + (c === cur ? "cur" : "") + '"><button class="pick" data-chat="' + c.id + '">' + esc(c.title) + '</button><button data-del="' + c.id + '" aria-label="Delete chat">x</button></li>').join("") || '<li class="hint">No saved chats yet.</li>';
  document.querySelectorAll("#modeSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === cfg.mode));
  document.querySelectorAll("#themeSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.theme === cfg.theme));
  $("#modeHint").textContent = HINTS[cfg.mode];
  $("#customWrap").hidden = cfg.mode !== "custom";
  $("#custom").value = cfg.custom; $("#name").value = cfg.name; $("#history").value = String(cfg.history);
}
function applyTheme(){ document.documentElement.dataset.theme = cfg.theme; const c = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(); document.querySelector('meta[name=theme-color]').content = c; }
function setStatus(t){ $("#status").textContent = t; }
function idleStatus(){
  if(isClaude()){
    if(!claude || !claude.installed) return setStatus("Claude Code isn't installed on the Pi yet.");
    return setStatus(claude.key ? "Claude Code ready. Needs internet. Up to $" + Number(claude.budget).toFixed(2) + " per message." : "Claude Code installed. Save your API key: secundus_ai.py --claude-key");
  }
  if(!online) return setStatus("hailo-ollama offline. On the Pi run: hailo-ollama");
  setStatus(models.length ? "Ready. " + models.length + " model" + (models.length > 1 ? "s" : "") + " on the HAT." : "Connected, but no models installed.");
}
function setBusy(b){
  busy = b; $("#sendBtn").hidden = b; $("#stopBtn").hidden = !b; $("#model").disabled = b; $("#newBtn").disabled = b;
  if(!b) idleStatus();
}
$("#modeTag").textContent = "";
function modeTag(){ $("#modeTag").textContent = cfg.mode.toUpperCase(); }

/* ---------- backend ---------- */
async function health(){
  try{
    const r = await fetch("health", {cache: "no-store"}); const h = await r.json();
    online = !!h.backend;
    const list = h.models || [], cl = h.claude || null;
    if(JSON.stringify([list, cl && cl.installed, cl && cl.local]) !== JSON.stringify([models, claude && claude.installed, claude && claude.local])){ models = list; claude = cl; fillModels(); }
    claude = cl;
    $("#about").textContent = "Web UI v" + h.version + " · backend " + (online ? "online" : "offline");
  }catch(e){ online = false; }
  $("#dot").classList.toggle("on", online);
  $("#dot").title = online ? "hailo-ollama online" : "hailo-ollama offline";
  if(!busy) idleStatus();
}
function fillModels(){
  const sel = $("#model");
  const cl = claude && claude.local && claude.installed ? claude.models.map(m => "claude:" + m) : [];
  const values = models.concat(cl);
  if(!values.length){ sel.innerHTML = '<option value="">no models</option>'; cfg.model = ""; return; }
  if(!values.includes(cfg.model)) cfg.model = models.find(m => /^qwen2:/.test(m)) || models.find(m => /qwen2\.5-instruct/.test(m)) || values[0];
  const opt = (v, label) => '<option value="' + esc(v) + '"' + (v === cfg.model ? " selected" : "") + ">" + esc(label) + "</option>";
  let html = models.length ? '<optgroup label="Aurelia \u00b7 HAT (offline)">' + models.map(m => opt(m, m)).join("") + "</optgroup>" : "";
  if(cl.length) html += '<optgroup label="Claude Code (online)">' + cl.map(v => opt(v, "Claude " + v.slice(7).replace(/^./, c => c.toUpperCase()))).join("") + "</optgroup>";
  sel.innerHTML = html;
  saveCfg();
}
function stats(o, t0, first, pieces){
  const now = performance.now(), secs = (now - t0) / 1000;
  let s = secs.toFixed(1) + " s";
  if(o && o.eval_count && o.eval_duration) s = (o.eval_count / (o.eval_duration / 1e9)).toFixed(1) + " tok/s · " + s;
  else if(first && pieces > 3 && now > first) s = "~" + (pieces / ((now - first) / 1000)).toFixed(1) + " tok/s · " + s;
  if(first) s = "first word " + ((first - t0) / 1000).toFixed(1) + " s · " + s;
  return s;
}
async function errText(r){
  const t = await r.text();
  try{ const j = JSON.parse(t); if(j.error) return j.error; }catch(e){}
  return "HTTP " + r.status + (t ? ": " + t.slice(0, 200) : "");
}

async function send(text){
  text = (text != null ? text : input.value).trim();
  if(!text || busy) return;
  if(!cfg.model){ toast(online ? "No model installed yet" : "hailo-ollama is offline"); return; }
  if(isClaude()) return sendClaude(text);
  cur.messages.push({role: "user", content: text});
  if(cur.title === "New chat") cur.title = text.slice(0, 48);
  const bot = {role: "assistant", content: "", model: cfg.model, name: name()};
  cur.messages.push(bot);
  input.value = ""; autosize(); setBusy(true); save(); render(true);

  const hist = cur.messages.slice(0, -1).filter(m => !m.error && m.content).slice(-cfg.history);
  if(hist[0] && hist[0].role === "assistant") hist.shift();
  const body = {model: cfg.model, stream: true,
    messages: [{role: "system", content: systemPrompt()}].concat(hist.map(m => ({role: m.role, content: m.role === "assistant" ? stripThink(m.content).replace(/^\u27e6tool\u27e7.*$/gm, "").trim() : m.content})))};

  ctrl = new AbortController();
  const t0 = performance.now(); let first = 0, raw = "", pieces = 0;
  setStatus("Sending to " + cfg.model + "... first reply after a model switch can take a while.");
  const tick = setInterval(() => { if(!bot.content){ bot.wait = "warming up the HAT... " + Math.round((performance.now() - t0) / 1000) + " s"; paintLast(); } }, 1000);
  try{
    const r = await fetch("api/chat", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body), signal: ctrl.signal});
    if(!r.ok) throw new Error(await errText(r));
    setStatus("Generating... tap Stop to cut it off.");
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    const take = line => {
      line = line.trim(); if(!line) return;
      let o; try{ o = JSON.parse(line); }catch(e){ return; }
      if(o.error) throw new Error(typeof o.error === "string" ? o.error : JSON.stringify(o.error));
      const piece = (o.message && o.message.content) || o.response || "";
      if(piece){ if(!first) first = performance.now(); pieces++; bot.content += piece; paintLast(); }
      if(o.done) bot.meta = stats(o, t0, first, pieces);
    };
    for(;;){
      const {value, done} = await rd.read(); if(done) break;
      const chunk = dec.decode(value, {stream: true}); raw += chunk; buf += chunk;
      let i; while((i = buf.indexOf("\n")) >= 0){ take(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    take(buf);
    if(!bot.content && raw.trim()){ try{ take(JSON.stringify(JSON.parse(raw))); }catch(e){} }
    if(!bot.content) throw new Error("The model sent back an empty reply. Try again, or pick another model.");
    if(!bot.meta) bot.meta = stats(null, t0, first, pieces);
  }catch(e){
    if(e.name === "AbortError"){ bot.meta = "stopped · " + stats(null, t0, first, pieces); if(!bot.content) bot.content = "*(stopped before any words came back)*"; }
    else if(e instanceof TypeError && !bot.content){ bot.error = true; bot.content = "Can't reach the web UI server. Is secundus_ai.py still running on the Pi?"; }
    else { bot.error = !bot.content; bot.content = (bot.content ? bot.content + "\n\n" : "") + "ERROR: " + e.message; }
  }finally{
    clearInterval(tick); delete bot.wait; ctrl = null; setBusy(false); save(); paintLast(); health();
    if(matchMedia("(pointer:fine)").matches) input.focus();
  }
}

/* ---------- Claude Code ---------- */
function addLine(m, line){ m.content += (m.content && !m.content.endsWith("\n") ? "\n" : "") + "\u27e6tool\u27e7" + line.replace(/\n/g, " ").slice(0, 300) + "\n"; }
async function sendClaude(text){
  const model = cfg.model.slice(7);
  const prior = cur.messages.filter(m => !m.error && m.content).slice(-6);
  cur.messages.push({role: "user", content: text});
  if(cur.title === "New chat") cur.title = text.slice(0, 48);
  const bot = {role: "assistant", content: "", model: "claude " + model, name: "Claude", claude: true};
  cur.messages.push(bot);
  input.value = ""; autosize(); setBusy(true); save(); render(true);
  const context = cur.claudeSession ? "" : prior.map(m => (m.role === "user" ? "Marshall: " : "Assistant: ") + stripThink(m.content).replace(/^\u27e6tool\u27e7.*$/gm, "").trim()).join("\n\n");
  ctrl = new AbortController();
  const t0 = performance.now();
  setStatus("Starting Claude Code...");
  const tick = setInterval(() => { if(!bot.content && !bot.perm){ bot.wait = "Claude is thinking... " + Math.round((performance.now() - t0) / 1000) + " s"; paintLast(); } }, 1000);
  try{
    const r = await fetch("claude/chat", {method: "POST", headers: {"Content-Type": "application/json", "X-Secundus": "1"},
      body: JSON.stringify({prompt: text, model, session: cur.claudeSession || "", context, tutor: cfg.mode === "tutor"}), signal: ctrl.signal});
    if(!r.ok) throw new Error(await errText(r));
    setStatus("Claude is working... Stop cancels it.");
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
    const take = line => {
      line = line.trim(); if(!line) return;
      let o; try{ o = JSON.parse(line); }catch(e){ return; }
      if(o.type === "ping") return;
      if(o.type === "init"){ if(o.session_id) cur.claudeSession = o.session_id; return; }
      if(o.type === "text"){ bot.content += o.text; paintLast(); return; }
      if(o.type === "tool"){ addLine(bot, o.name + (o.detail ? ": " + o.detail : "")); paintLast(); return; }
      if(o.type === "perm"){ bot.perm = {id: o.id, name: o.name, detail: o.detail}; paintLast(); setStatus("Claude is waiting for your OK."); main.scrollTop = main.scrollHeight; return; }
      if(o.type === "perm_done"){ if(bot.perm && bot.perm.id === o.id){ addLine(bot, "Timed out, denied: " + bot.perm.name); bot.perm = null; paintLast(); } return; }
      if(o.type === "status"){ setStatus(o.text); return; }
      if(o.type === "error") throw new Error(o.error);
      if(o.type === "done"){
        if(o.session_id) cur.claudeSession = o.session_id;
        if(o.error){ bot.error = !bot.content.trim(); bot.content += (bot.content ? "\n\n" : "") + "ERROR: " + (o.result || "Claude Code reported an error."); }
        else if(o.result && !bot.content.trim()) bot.content = o.result;
        bot.meta = "Claude " + model + (typeof o.cost === "number" ? " \u00b7 $" + o.cost.toFixed(3) : "") + " \u00b7 " + ((performance.now() - t0) / 1000).toFixed(1) + " s";
      }
    };
    for(;;){
      const {value, done} = await rd.read(); if(done) break;
      buf += dec.decode(value, {stream: true});
      let i; while((i = buf.indexOf("\n")) >= 0){ take(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    take(buf);
    if(!bot.content.trim()) throw new Error("Claude Code finished without a reply.");
  }catch(e){
    if(e.name === "AbortError"){ bot.meta = "stopped"; if(!bot.content) bot.content = "*(stopped)*"; }
    else if(e instanceof TypeError && !bot.content){ bot.error = true; bot.content = "Can't reach the web UI server. Is secundus_ai.py still running?"; }
    else { bot.error = !bot.content.trim(); bot.content = (bot.content ? bot.content + "\n\n" : "") + "ERROR: " + e.message; }
  }finally{
    clearInterval(tick); delete bot.wait; bot.perm = null; ctrl = null; setBusy(false); save(); paintLast(); health();
    if(matchMedia("(pointer:fine)").matches) input.focus();
  }
}
async function decide(id, allow){
  const m = cur.messages.find(x => x.perm && x.perm.id === id); if(!m) return;
  const p = m.perm; m.perm = null;
  addLine(m, (allow ? "Approved " : "Denied ") + p.name + (p.detail ? ": " + p.detail : ""));
  paintLast(); setStatus(allow ? "Approved. Claude is working..." : "Denied. Claude will explain or try another way.");
  try{
    const r = await fetch("claude/decide", {method: "POST", headers: {"Content-Type": "application/json", "X-Secundus": "1"}, body: JSON.stringify({id, allow})});
    if(!r.ok) toast(await errText(r));
  }catch(e){ toast("Couldn't send that: " + e.message); }
}

/* ---------- copy (works on plain http too) ---------- */
function copyText(t){
  if(navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(() => toast("Copied"));
  const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); toast("Copied"); }catch(e){ toast("Copy failed"); }
  ta.remove();
}

/* ---------- events ---------- */
function autosize(){ input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, innerHeight * .4) + "px"; }
input.addEventListener("input", autosize);
input.addEventListener("keydown", e => {
  if(e.key === "Enter" && !e.shiftKey && matchMedia("(pointer:fine)").matches){ e.preventDefault(); send(); }
});
$("#form").addEventListener("submit", e => { e.preventDefault(); send(); });
$("#stopBtn").addEventListener("click", () => {
  if(isClaude()) fetch("claude/stop", {method: "POST", headers: {"Content-Type": "application/json", "X-Secundus": "1"}, body: "{}"}).catch(() => {});
  if(ctrl) ctrl.abort();
});
$("#model").addEventListener("change", e => { cfg.model = e.target.value; saveCfg(); idleStatus(); if(!cur.messages.length) render();
  toast(isClaude() ? "Claude Code: online, commands need your OK" : "Next reply loads " + cfg.model); });
$("#newBtn").addEventListener("click", () => { if(busy) return; cur = chats.find(c => !c.messages.length) || freshChat(); save(); render(); if(matchMedia("(pointer:fine)").matches) input.focus(); });
const openDrawer = o => { document.body.classList.toggle("open", o); if(o){ renderDrawer(); loadAlarm(); } };
let alarm = null;
function paintAlarm(){
  if(!alarm) return;
  $("#alOn").checked = !!alarm.enabled; $("#alTime").value = alarm.time; $("#alNight").value = alarm.night_start;
  document.querySelectorAll("#alDays button").forEach(b => b.setAttribute("aria-pressed", alarm.days.includes(+b.dataset.day)));
  $("#alNext").textContent = alarm.enabled ? (alarm.next ? "Next alarm: " + alarm.next : "Alarm on, but no days picked.") : "Alarm is off.";
}
async function loadAlarm(){
  try{ const r = await fetch("alarm", {cache: "no-store"}); alarm = await r.json(); paintAlarm(); }
  catch(e){ $("#alNext").textContent = "Couldn't load the alarm settings."; }
}
async function postAlarm(path, body){
  const r = await fetch(path, {method: "POST", headers: {"Content-Type": "application/json", "X-Secundus": "1"}, body: JSON.stringify(body || {})});
  if(!r.ok) throw new Error(await errText(r));
  alarm = await r.json(); paintAlarm();
}
$("#alDays").addEventListener("click", e => {
  const b = e.target.closest("[data-day]"); if(!b || !alarm) return;
  const d = +b.dataset.day; alarm.days = alarm.days.includes(d) ? alarm.days.filter(x => x !== d) : alarm.days.concat(d).sort();
  paintAlarm();
});
$("#alSave").addEventListener("click", async () => {
  try{ await postAlarm("alarm", {enabled: $("#alOn").checked, time: $("#alTime").value, night_start: $("#alNight").value, days: alarm ? alarm.days : [0,1,2,3,4]});
       toast(alarm.enabled ? "Alarm set: " + (alarm.next || alarm.time) : "Alarm off"); }
  catch(e){ toast("Not saved: " + e.message); }
});
$("#alTest").addEventListener("click", async () => {
  try{ await postAlarm("alarm/test"); toast("Ringing the bedside screen for 10 s"); }
  catch(e){ toast("Test failed: " + e.message); }
});
$("#menuBtn").addEventListener("click", () => openDrawer(true));
$("#scrim").addEventListener("click", () => openDrawer(false));
addEventListener("keydown", e => { if(e.key === "Escape") openDrawer(false); });
log.addEventListener("click", e => {
  const s = e.target.closest("[data-starter]"); if(s) return send(s.dataset.starter);
  const c = e.target.closest("[data-copy]"); if(c) copyText(c.parentElement.querySelector("code").textContent);
  const a = e.target.closest("[data-allow]"); if(a) decide(a.dataset.allow, true);
  const d = e.target.closest("[data-deny]"); if(d) decide(d.dataset.deny, false);
});
$("#drawer").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return;
  if(b.dataset.chat && !busy){ cur = chats.find(c => c.id === b.dataset.chat) || cur; render(true); openDrawer(false); }
  else if(b.dataset.del && !busy){ chats = chats.filter(c => c.id !== b.dataset.del); if(!chats.includes(cur)) cur = chats[0] || freshChat(); save(); render(); renderDrawer(); }
  else if(b.dataset.mode){ cfg.mode = b.dataset.mode; saveCfg(); renderDrawer(); modeTag(); if(!cur.messages.length) render(); toast(b.textContent + " mode"); }
  else if(b.dataset.theme){ cfg.theme = b.dataset.theme; saveCfg(); applyTheme(); renderDrawer(); }
  else if(b.id === "exportBtn"){ exportChat(); }
  else if(b.id === "clearBtn" && !busy){ if(confirm("Delete every saved chat on this device?")){ chats = []; cur = freshChat(); save(); render(); renderDrawer(); } }
});
$("#name").addEventListener("input", e => { cfg.name = e.target.value; saveCfg(); if(!cur.messages.length) render(); });
$("#history").addEventListener("change", e => { cfg.history = +e.target.value; saveCfg(); });
$("#custom").addEventListener("input", e => { cfg.custom = e.target.value; saveCfg(); });
function exportChat(){
  if(!cur.messages.length) return toast("Nothing to export");
  const md = "# " + cur.title + "\n\n" + cur.messages.map(m => (m.role === "user" ? "**You:** " : "**" + (m.name || name()) + ":** ") + stripThink(m.content)).join("\n\n") + "\n";
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], {type: "text/markdown"}));
  a.download = "secundus-chat-" + new Date().toISOString().slice(0, 10) + ".md"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- boot ---------- */
applyTheme(); modeTag(); render(true); health(); setInterval(() => { if(!busy && !document.hidden) health(); }, 30000);
if(matchMedia("(pointer:fine)").matches) input.focus();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
