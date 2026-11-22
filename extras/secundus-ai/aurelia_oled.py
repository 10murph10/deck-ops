#!/usr/bin/env python3
"""
AURELIA status display for the Waveshare 1.27inch RGB OLED (128x96, SSD1351) on Secundus Station.

With --serial it is also a bedside ALARM CLOCK: set the alarm in the web page's menu (Alarm clock),
press button 1 (UNO pin 2) to flip pages or snooze, button 2 (pin 3) to stop. Passive buzzer on pin 9
plays the melody; after two snoozes the active buzzer on pin 6 takes over with beeping.

TWO WAYS TO CONNECT THE SCREEN
  A) Through an Arduino UNO (use this while the AI HAT covers the Pi's pins):
       Screen -> UNO:  VCC 5V, GND GND, DIN 11, CLK 13, CS 10, DC 7, RST 8
       Upload AureliaOLED.ino to the UNO, plug the UNO into the Pi by USB, then run:
         python3 aurelia_oled.py --serial
  B) Straight onto the Pi's GPIO pins (only if they're free), see the wiring below, then:
         python3 aurelia_oled.py

Shows whether Aurelia (hailo-ollama on the AI HAT+ 2) is online, a radio-style waveform while she
or Claude is thinking, the model in use, the Pi's IP address, CPU temperature and the time.
It reads http://127.0.0.1:8080/status from secundus_ai.py (v1.3+).

Wiring (Pi powered OFF; physical pin numbers):
  VCC -> pin 1 (3.3V)    GND -> pin 6     DIN -> pin 19 (MOSI)   CLK -> pin 23 (SCLK)
  CS  -> pin 24 (CE0)    DC  -> pin 22 (GPIO25)                  RST -> pin 13 (GPIO27)

One-time setup:   sudo raspi-config nonint do_spi 0   then reboot
Run it:           python3 aurelia_oled.py            (or --serial for the UNO)
Upside down?      python3 aurelia_oled.py --flip
Start at boot:    python3 aurelia_oled.py --install      (add --flip if you use it)
Test pattern:     python3 aurelia_oled.py --test

OLEDs can burn in, so the screen dims after 2 minutes idle and sleeps after 20 minutes idle,
waking as soon as Aurelia or Claude starts working. Content also drifts a pixel or two each minute.
"""
import argparse
import getpass
import json
import math
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

from PIL import Image, ImageDraw, ImageFont

W, H = 128, 96
STATUS_URL = "http://127.0.0.1:8080/status"
DIM_AFTER, SLEEP_AFTER = 120, 20 * 60  # seconds of no AI activity

GREEN, DIM_GREEN, AMBER, RED, WHITE, GREY = (57, 255, 138), (20, 110, 60), (255, 176, 0), (255, 70, 70), (210, 255, 225), (90, 120, 100)


# --------------------------------------------------------------------------- SSD1351 driver

class SSD1351:
    """Minimal SSD1351 driver (same register setup Adafruit uses for 128x96 panels)."""

    INIT = [
        (0xFD, 0x12), (0xFD, 0xB1),  # unlock
        (0xAE,),                     # display off
        (0xB3, 0xF1),                # clock divider
        (0xCA, 0x7F),                # mux ratio 128
        (0xA2, 0x00),                # display offset
        (0xB5, 0x00),                # GPIO
        (0xAB, 0x01),                # internal VDD regulator
        (0xB1, 0x32),                # precharge
        (0xBE, 0x05),                # VCOMH
        (0xA6,),                     # normal display
        (0xC1, 0xC8, 0x80, 0xC8),    # contrast A B C
        (0xC7, 0x0F),                # master contrast (full)
        (0xB4, 0xA0, 0xB5, 0x55),    # VSL
        (0xB6, 0x01),                # precharge 2
    ]

    def __init__(self, flip=False, dc=25, rst=27, bus=0, device=0, hz=16_000_000, startline=None):
        import spidev
        from gpiozero import DigitalOutputDevice
        self.spi = spidev.SpiDev()
        self.spi.open(bus, device)
        self.spi.max_speed_hz = hz
        self.spi.mode = 0
        self.dc = DigitalOutputDevice(dc)
        self.rst = DigitalOutputDevice(rst, initial_value=True)
        self.reset()
        for c in self.INIT:
            self.cmd(*c)
        # orientation: 65k colour, COM split, and scan direction; 96-row panels need start line 96 when not flipped
        self.cmd(0xA0, 0x66 if flip else 0x74)
        self.cmd(0xA1, startline if startline is not None else (0 if flip else H))
        self.cmd(0xAF)
        self.on = True

    def cmd(self, c, *data):
        self.dc.off()
        self.spi.writebytes([c])
        if data:
            self.dc.on()
            self.spi.writebytes(list(data))

    def reset(self):
        self.rst.on(); time.sleep(0.05)
        self.rst.off(); time.sleep(0.05)
        self.rst.on(); time.sleep(0.15)

    def brightness(self, level):  # 0..15
        self.cmd(0xC7, max(0, min(15, int(level))))

    def power(self, on):
        if on != self.on:
            self.cmd(0xAF if on else 0xAE)
            self.on = on

    def show(self, img):
        self.cmd(0x15, 0, W - 1)
        self.cmd(0x75, 0, H - 1)
        self.cmd(0x5C)
        self.dc.on()
        self.spi.writebytes2(to_rgb565(img))

    def close(self):
        try:
            self.power(False)
            self.spi.close()
        except Exception:
            pass


def to_rgb565(img):
    raw = img.convert("RGB").tobytes()
    out = bytearray(W * H * 2)
    j = 0
    for i in range(0, len(raw), 3):
        r, g, b = raw[i], raw[i + 1], raw[i + 2]
        v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
        out[j] = v >> 8
        out[j + 1] = v & 0xFF
        j += 2
    return out


# --------------------------------------------------------------------------- data

def fetch_status():
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(STATUS_URL, timeout=2) as r:
            return json.load(r)
    except Exception:
        return None


def cpu_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            return int(f.read().strip()) / 1000
    except (OSError, ValueError):
        return None


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def font(size, bold=False):
    names = ["DejaVuSansMono-Bold.ttf" if bold else "DejaVuSansMono.ttf"]
    for d in ("/usr/share/fonts/truetype/dejavu/", "/usr/share/fonts/dejavu/", ""):
        for n in names:
            try:
                return ImageFont.truetype(d + n, size)
            except OSError:
                continue
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


F_TITLE, F_BIG, F_SMALL = font(12, True), font(13, True), font(9)


# --------------------------------------------------------------------------- drawing

def short_model(m):
    if not m:
        return "-"
    m = m.replace("_distill_qwen", "").replace("-instruct", "")
    return m if len(m) <= 20 else m[:19] + "~"


def render(st, t, shift=(0, 0)):
    """st: dict from /status (or None). t: seconds, drives the animation."""
    img = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    ox, oy = shift

    if st is None:
        state, color, line = "UI OFFLINE", RED, None
        sub = "start secundus_ai.py"
    elif st.get("claude_busy"):
        state, color, line = "CLAUDE", AMBER, "busy"
        sub = "working on the Pi"
    elif st.get("hat_busy"):
        state, color, line = "THINKING", GREEN, "busy"
        sub = short_model(st.get("last_model"))
    elif not st.get("backend"):
        state, color, line = "HAT OFFLINE", RED, None
        sub = "run: hailo-ollama"
    else:
        state, color, line = "READY", GREEN, "idle"
        sub = short_model(st.get("last_model") or (st.get("models") or [None])[0])

    # title bar
    d.text((2 + ox, 0 + oy), "AURELIA", font=F_TITLE, fill=GREEN)
    pulse = color if line != "busy" or int(t * 4) % 2 == 0 else DIM_GREEN
    d.ellipse((W - 11 + ox, 3 + oy, W - 4 + ox, 10 + oy), fill=pulse)
    d.line((0, 15 + oy, W, 15 + oy), fill=DIM_GREEN)

    # state word
    tw = d.textlength(state, font=F_BIG)
    d.text(((W - tw) / 2 + ox, 19 + oy), state, font=F_BIG, fill=color)

    # scope trace: flat when idle, live waveform while thinking
    y0 = 46 + oy
    if line is None:
        d.line((8 + ox, y0, W - 8 + ox, y0), fill=(60, 25, 25))
    else:
        pts = []
        for x in range(8, W - 8):
            if line == "busy":
                k = x / 9.0
                y = y0 + 7 * math.sin(k + t * 6) * math.sin(x / 37.0 + t * 1.7) + 2 * math.sin(k * 3.1 - t * 9)
            else:
                y = y0 + (1 if (x + int(t * 20)) % 40 == 0 else 0)
            pts.append((x + ox, y))
        d.line(pts, fill=color, width=1)

    # details
    sw = d.textlength(sub, font=F_SMALL)
    d.text(((W - sw) / 2 + ox, 58 + oy), sub, font=F_SMALL, fill=WHITE)
    ip = lan_ip() or "no network"
    d.text((2 + ox, 72 + oy), ip, font=F_SMALL, fill=GREY)
    tc = cpu_temp()
    temp = ("%d°C" % round(tc)) if tc is not None else "--"
    tcol = RED if tc and tc >= 80 else AMBER if tc and tc >= 70 else GREY
    d.text((2 + ox, 84 + oy), temp, font=F_SMALL, fill=tcol)
    clock = time.strftime("%H:%M")
    cw = d.textlength(clock, font=F_SMALL)
    d.text((W - 2 - cw + ox, 84 + oy), clock, font=F_SMALL, fill=GREY)
    return img


def test_pattern():
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    bars = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)]
    for i, c in enumerate(bars):
        d.rectangle((i * 32, 0, i * 32 + 31, 60), fill=c)
    d.rectangle((0, 0, W - 1, H - 1), outline=(255, 176, 0))
    d.text((4, 66), "TOP LEFT ^", font=F_SMALL, fill=(255, 255, 255))
    d.text((4, 80), "R G B W bars", font=F_SMALL, fill=(255, 255, 255))
    return img


# --------------------------------------------------------------------------- main loop

def run(args):
    oled = SSD1351(flip=args.flip, startline=args.startline)
    if args.test:
        oled.show(test_pattern())
        print("Test pattern up: red, green, blue, white bars on top, amber border all round.")
        print("If it's upside down use --flip. If part is cut off or wrapped, tell Claude what you see.")
        input("Press Enter to turn it off...")
        oled.close()
        return

    import signal
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))  # systemctl stop -> clean off
    last_active = time.time()
    level = None
    print("AURELIA status display running. Ctrl+C to stop.")
    try:
        while True:
            st = fetch_status()
            now = time.time()
            busy = bool(st and (st.get("hat_busy") or st.get("claude_busy")))
            if busy or (st and now - (st.get("last_reply") or 0) < 5):
                last_active = now
            idle = now - last_active
            if idle > SLEEP_AFTER and st is not None:
                oled.power(False)
                time.sleep(1)
                continue
            oled.power(True)
            want = 4 if idle > DIM_AFTER else 15
            if want != level:
                oled.brightness(want)
                level = want
            minute = int(now // 60)
            shift = ((minute % 3) - 1, ((minute // 3) % 3) - 1)  # slow 1-pixel drift against burn-in
            frames = 8 if busy else 1
            for i in range(frames):
                oled.show(render(st, time.time(), shift))
                time.sleep(0.12 if busy else 1.0)
    except KeyboardInterrupt:
        pass
    finally:
        oled.close()
        print("\nScreen off.")


# --------------------------------------------------------------------------- UNO over USB

def find_port():
    import glob
    ports = sorted(glob.glob("/dev/ttyACM*")) + sorted(glob.glob("/dev/ttyUSB*"))
    return ports[0] if ports else None


class SerialLink:
    def __init__(self, port):
        import termios
        self.fd = os.open(port, os.O_RDWR | os.O_NOCTTY)
        a = termios.tcgetattr(self.fd)
        a[0] = 0                                                    # iflag: raw
        a[1] = 0                                                    # oflag: raw
        a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL         # 8N1
        a[3] = 0                                                    # lflag: no echo / canonical
        a[4] = a[5] = termios.B115200
        termios.tcsetattr(self.fd, termios.TCSANOW, a)
        time.sleep(2.2)  # the UNO restarts when the port opens

    def send(self, line):
        os.write(self.fd, (line + "\n").encode("ascii", "replace"))

    def close(self):
        try:
            os.close(self.fd)
        except OSError:
            pass


def clean(s, n):
    s = "".join(ch for ch in str(s or "") if 32 <= ord(ch) < 127 and ch != "|")
    return s[:n]


def summarize(st):
    if st is None:
        return "U", "start secundus_ai.py"
    if st.get("claude_busy"):
        return "C", "working on the Pi"
    if st.get("hat_busy"):
        return "T", short_model(st.get("last_model"))
    if not st.get("backend"):
        return "H", "run: hailo-ollama"
    return "R", short_model(st.get("last_model") or (st.get("models") or [None])[0])


# --------------------------------------------------------------------------- alarm clock + Pi health

ALARM_FILE = os.path.expanduser("~/.config/secundus-ai/alarm.json")   # written by the web page's Alarm panel
ALARM_DEFAULT = {"enabled": False, "time": "06:30", "days": [0, 1, 2, 3, 4], "night_start": "22:00",
                 "snooze_min": 9, "test_at": 0}
RING_LIMIT = 15 * 60   # give up ringing after 15 minutes
TEST_SECS = 10


def load_alarm():
    a = dict(ALARM_DEFAULT)
    try:
        with open(ALARM_FILE) as f:
            a.update(json.load(f))
    except (OSError, ValueError):
        pass
    return a


def hm(s):
    h, m = str(s).split(":")
    return int(h) * 60 + int(m)


def next_alarm_label(a, now=None):
    import datetime
    if not a.get("enabled") or not a.get("days"):
        return None
    now = now or datetime.datetime.now()
    h, m = divmod(hm(a["time"]), 60)
    for add in range(8):
        d = now + datetime.timedelta(days=add)
        t = d.replace(hour=h, minute=m, second=0, microsecond=0)
        if d.weekday() in a["days"] and t > now:
            return ("Today " if add == 0 else "Tmrw " if add == 1 else (t.strftime("Next %a ") if add == 7 else t.strftime("%a "))) + a["time"]
    return None


def is_night(a, now):
    start = hm(a.get("night_start", "22:00"))
    end = hm(a["time"]) if a.get("enabled") else 7 * 60
    cur = now.hour * 60 + now.minute
    return (start <= cur < end) if start < end else (cur >= start or cur < end)


class AlarmClock:
    def __init__(self):
        self.ringing = False
        self.ring_start = 0.0
        self.snoozes = 0
        self.snooze_until = None
        self.fired_key = None
        self.last_test = 0
        self.test_until = 0.0

    def tick(self, a, now):
        t = time.time()
        if a.get("test_at") and a["test_at"] != self.last_test:
            self.last_test = a["test_at"]
            if t - a["test_at"] < 30:
                self.test_until = t + TEST_SECS
        if self.test_until and t > self.test_until:
            self.test_until = 0
        if a.get("enabled") and now.weekday() in a.get("days", []) and now.strftime("%H:%M") == a["time"]:
            key = now.strftime("%Y-%m-%d ") + a["time"]
            if key != self.fired_key:
                self.fired_key = key
                self.ringing, self.ring_start, self.snoozes, self.snooze_until = True, t, 0, None
        if self.snooze_until and t >= self.snooze_until:
            self.snooze_until = None
            self.ringing, self.ring_start = True, t
        if self.ringing and t - self.ring_start > RING_LIMIT:
            self.stop()

    def mode(self):  # 0 quiet, 1 melody, 2 beeping
        if self.ringing:
            return 2 if self.snoozes >= 2 else 1
        return 1 if self.test_until else 0

    def snooze(self, minutes):
        if self.test_until:
            self.test_until = 0
        elif self.ringing:
            self.ringing = False
            self.snoozes += 1
            self.snooze_until = time.time() + minutes * 60

    def stop(self):
        self.ringing, self.snooze_until, self.snoozes, self.test_until = False, None, 0, 0

    def busy(self):
        return self.mode() > 0 or self.snooze_until is not None


class Health:
    def __init__(self):
        self.prev = None

    def cpu(self):
        try:
            with open("/proc/stat") as f:
                v = [int(x) for x in f.readline().split()[1:]]
        except (OSError, ValueError):
            return 0
        idle, total = v[3] + (v[4] if len(v) > 4 else 0), sum(v)
        pct = 0
        if self.prev:
            dt, di = total - self.prev[1], idle - self.prev[0]
            pct = round(100 * (dt - di) / dt) if dt > 0 else 0
        self.prev = (idle, total)
        return max(0, min(100, pct))

    @staticmethod
    def ram():
        try:
            info = {}
            with open("/proc/meminfo") as f:
                for line in f:
                    k, v = line.split(":")
                    info[k] = int(v.split()[0])
            return round(100 * (1 - info["MemAvailable"] / info["MemTotal"]))
        except (OSError, ValueError, KeyError):
            return 0

    @staticmethod
    def disk():
        try:
            u = shutil.disk_usage("/")
            return round(100 * u.used / u.total)
        except OSError:
            return 0

    @staticmethod
    def uptime():
        try:
            with open("/proc/uptime") as f:
                sec = int(float(f.read().split()[0]))
        except (OSError, ValueError):
            return "-"
        d, rem = divmod(sec, 86400)
        h, rem = divmod(rem, 3600)
        return "%dd %dh" % (d, h) if d else "%dh %dm" % (h, rem // 60)


def run_serial(args):
    import datetime
    import select
    import signal
    port = args.serial if args.serial not in (True, "auto") else find_port()
    if port and not os.path.exists(port):
        sys.exit("%s doesn't exist. Plug in the UNO and check: ls /dev/ttyACM* /dev/ttyUSB*" % port)
    if not port:
        sys.exit("No Arduino found on USB. Plug the UNO into the Pi, then check: ls /dev/ttyACM* /dev/ttyUSB*")
    try:
        link = SerialLink(port)
    except PermissionError:
        sys.exit("No permission for %s. Run: sudo usermod -aG dialout %s   then log out and back in." % (port, getpass.getuser()))
    except OSError as e:
        sys.exit("Can't open %s (%s). Is the Arduino IDE's Serial Monitor open? Close it and try again." % (port, e.strerror))
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    print("AURELIA status display + alarm clock running through the UNO on %s. Ctrl+C to stop." % port)

    clock, health = AlarmClock(), Health()
    last_active = last_button = time.time()
    temps, shown_temp = [], None
    st, sysline = None, "SYS|0|0|0|-"
    rxbuf = b""
    slot = 0
    next_send = next_status = next_sys = 0.0
    try:
        while True:
            # buttons from the UNO
            r, _, _ = select.select([link.fd], [], [], 0.05)
            if r:
                try:
                    rxbuf += os.read(link.fd, 256)
                except OSError:
                    sys.exit("Lost the UNO (unplugged?). Plug it back in and run this again.")
                while b"\n" in rxbuf:
                    line, rxbuf = rxbuf.split(b"\n", 1)
                    msg = line.strip().decode("ascii", "ignore")
                    a = load_alarm()
                    if msg == "B1":
                        clock.snooze(a.get("snooze_min", 9)) if clock.mode() else None
                    elif msg == "B2":
                        clock.stop() if clock.busy() else None
                    if msg in ("B1", "B2"):
                        last_active = last_button = time.time()

            now = time.time()
            if now < next_send:
                continue
            next_send = now + 0.15   # one short line at a time so the UNO's 64-byte buffer never overflows

            if now >= next_status:
                st = fetch_status()
                next_status = now + 1.0
            if now >= next_sys:
                sysline = "SYS|%d|%d|%d|%s" % (health.cpu(), health.ram(), health.disk(), health.uptime())
                next_sys = now + 2.0

            a = load_alarm()
            dt = datetime.datetime.now()
            clock.tick(a, dt)
            mode = clock.mode()
            night = is_night(a, dt)

            busy = bool(st and (st.get("hat_busy") or st.get("claude_busy")))
            if busy or (st and now - (st.get("last_reply") or 0) < 5) or mode:
                last_active = now
            idle = now - last_active
            if mode:
                level = 15
            elif night:
                level = 6 if now - last_button < 20 else 1
            else:
                level = 0 if (idle > SLEEP_AFTER and st is not None) else 4 if idle > DIM_AFTER else 15

            slot = (slot + 1) % 3
            if slot == 0:
                code, sub = summarize(st)
                tc = cpu_temp()
                if tc is not None:  # average ~10 s, only move the shown number by 2+ degrees
                    temps = (temps + [tc])[-60:]
                    avg = sum(temps) / len(temps)
                    if shown_temp is None or abs(avg - shown_temp) >= 2:
                        shown_temp = round(avg)
                line = "|".join(["AUR", code, clean(sub, 21), clean(lan_ip() or "no network", 15),
                                 ("%dC" % shown_temp) if shown_temp is not None else "--", dt.strftime("%H:%M"), str(level)])
            elif slot == 1:
                snz = ("Snooze til " + time.strftime("%H:%M", time.localtime(clock.snooze_until))) if clock.snooze_until else ""
                line = "|".join(["ALM", clean(next_alarm_label(a) or "off", 15), str(mode), "1" if night else "0", snz])
            else:
                line = sysline
            try:
                link.send(line)
            except OSError:
                sys.exit("Lost the UNO (unplugged?). Plug it back in and run this again.")
    except KeyboardInterrupt:
        pass
    finally:
        link.close()
        print("\nStopped.")


def install(args):
    user, script = getpass.getuser(), os.path.abspath(__file__)
    extra = (" --flip" if args.flip else "") + (" --startline %d" % args.startline if args.startline is not None else "")
    if args.serial:
        extra += " --serial" + ("" if args.serial in (True, "auto") else " " + args.serial)
    unit = """[Unit]
Description=AURELIA OLED status display
After=network.target secundus-ai.service

[Service]
User={u}
ExecStart={py} {s}{x}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
""".format(u=user, py=sys.executable, s=script, x=extra)
    subprocess.run(["sudo", "tee", "/etc/systemd/system/aurelia-oled.service"], input=unit.encode(),
                   stdout=subprocess.DEVNULL, check=True)
    subprocess.run(["sudo", "systemctl", "daemon-reload"], check=True)
    subprocess.run(["sudo", "systemctl", "enable", "--now", "aurelia-oled.service"], check=True)
    print("Done: the status display starts at every boot.  Logs: journalctl -u aurelia-oled -f")


def preflight():
    problems = []
    if not os.path.exists("/dev/spidev0.0"):
        problems.append("SPI is off. Run: sudo raspi-config nonint do_spi 0   then reboot.")
    try:
        with open("/boot/firmware/config.txt") as f:
            if any(l.strip().startswith("dtoverlay=vc4-kms-dpi-hyperpixel") for l in f):
                problems.append("The HyperPixel line is still in /boot/firmware/config.txt and grabs the same pins.\n"
                                "  Remove it: sudo sed -i '/hyperpixel4/d' /boot/firmware/config.txt   then reboot.")
    except OSError:
        pass
    for mod, pkg in (("spidev", "python3-spidev"), ("gpiozero", "python3-gpiozero")):
        try:
            __import__(mod)
        except ImportError:
            problems.append("Missing %s. Run: sudo apt install %s" % (mod, pkg))
    if problems:
        sys.exit("Can't start the display yet:\n- " + "\n- ".join(problems))


def main():
    ap = argparse.ArgumentParser(description="AURELIA status display (Waveshare 1.27in RGB OLED)")
    ap.add_argument("--serial", nargs="?", const="auto", default=None, metavar="PORT",
                    help="screen is on an Arduino UNO plugged in by USB (port found automatically)")
    ap.add_argument("--flip", action="store_true", help="rotate 180 degrees (Pi-wired screen)")
    ap.add_argument("--test", action="store_true", help="show a test pattern")
    ap.add_argument("--install", action="store_true", help="start at every boot")
    ap.add_argument("--startline", type=int, default=None, help=argparse.SUPPRESS)
    ap.add_argument("--preview", metavar="DIR", help=argparse.SUPPRESS)  # render PNGs, no hardware
    args = ap.parse_args()
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        demo = {
            "ready": {"backend": True, "models": ["qwen2:1.5b"], "hat_busy": False, "claude_busy": False, "last_model": "qwen2:1.5b"},
            "thinking": {"backend": True, "models": ["qwen2:1.5b"], "hat_busy": True, "claude_busy": False, "last_model": "qwen2.5-instruct:1.5b"},
            "claude": {"backend": True, "models": [], "hat_busy": False, "claude_busy": True, "last_model": None},
            "hat_offline": {"backend": False, "models": [], "hat_busy": False, "claude_busy": False},
            "ui_offline": None,
        }
        for k, st in demo.items():
            render(st, 1.3).resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(args.preview, k + ".png"))
        test_pattern().resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(args.preview, "test.png"))
        return print("previews written to", args.preview)
    if args.install:
        return install(args)
    if args.serial:
        return run_serial(args)
    preflight()
    run(args)


if __name__ == "__main__":
    main()
