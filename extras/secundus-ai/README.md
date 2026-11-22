# Secundus AI: Aurelia web page, bedside screen and alarm clock

Code for Deck Ops lesson **E17 Bedside alarm clock** (phase 10, Aurelia).

| File | Runs on | What it does |
|---|---|---|
| `secundus_ai.py` | Pi (Secundus) | Aurelia chat page on port 8080 for hailo-ollama on the AI HAT+ 2, Claude Code mode, and the Alarm clock settings panel |
| `aurelia_oled.py` | Pi (Secundus) | Feeds the bedside screen over USB (`--serial`), runs the alarm, sends Pi health stats |
| `AureliaOLED/AureliaOLED.ino` | Arduino UNO | Draws the Waveshare 1.27" OLED, reads two buttons, plays the buzzers |

Put the two Python files in `~/secundus-ai/` on the Pi.

```
python3 ~/secundus-ai/secundus_ai.py --install
python3 ~/secundus-ai/aurelia_oled.py --install --serial
```

UNO wiring: OLED VCC 5V, GND GND, DIN 11, CLK 13, CS 10, DC 7, RST 8. Button 1 pin 2 to GND, button 2 pin 3 to GND, passive buzzer + pin 9, active buzzer + pin 6.
