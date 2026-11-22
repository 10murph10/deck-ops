// AURELIA bedside display + alarm clock
// Arduino UNO + Waveshare 1.27inch RGB OLED (SSD1351, 128x96), fed by aurelia_oled.py --serial on Secundus.
//
// WIRING
//   OLED  -> UNO:  VCC 5V, GND GND, DIN 11, CLK 13, CS 10, DC 7, RST 8   (male-to-male jumpers)
//   Button 1 (page / snooze): one leg to pin 2, the opposite leg to GND
//   Button 2 (stop):          one leg to pin 3, the opposite leg to GND
//   Passive buzzer (melody):  + to pin 9, - to GND
//   Active buzzer (beeping):  + (longer leg / marked +) to pin 6, - to GND
//
// LIBRARY: Sketch > Include Library > Manage Libraries > "Adafruit SSD1351 library" (install all)
//
// FROM THE PI (one short line at a time):
//   AUR|state|subtitle|ip|temp|clock|brightness   state: R ready, T thinking, C Claude, H HAT off, U UI off
//   ALM|next alarm|mode|night|snooze text           mode: 0 quiet, 1 melody, 2 beeping
//   SYS|cpu%|ram%|sd%|uptime
// TO THE PI:  B1 / B2 when a button is pressed

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1351.h>

#define OLED_CS   10
#define OLED_DC    7
#define OLED_RST   8
#define BTN1       2
#define BTN2       3
#define BUZZ_P     9
#define BUZZ_A     6
#define FLIP       0      // 1 if the picture is upside down

#define C_BLACK  0x0000
#define C_GREEN  0x3FF1
#define C_DIM    0x1367
#define C_AMBER  0xFD80
#define C_RED    0xFA28
#define C_NIGHT  0xF800
#define C_WHITE  0xD7FC
#define C_GREY   0x5BCC
#define C_DKRED  0x38C3

Adafruit_SSD1351 tft = Adafruit_SSD1351(128, 96, &SPI, OLED_CS, OLED_DC, OLED_RST);

// ---- data from the Pi
char state = 'N';
char sub[22] = "", ip[16] = "", temp[6] = "", clk[6] = "--:--";
char nextAl[16] = "off", snz[18] = "";
byte almMode = 0, night = 0;
byte cpu = 0, ram = 0, sd = 0;
char upt[10] = "-";
byte bright = 15;
unsigned long lastRx = 0;

// ---- screen
enum { V_AUR, V_HEALTH, V_CLOCK, V_NIGHT, V_RING };
byte page = 0, shown = 255;
bool dirty = true;
byte fieldDirty = 0;       // 1 sub, 2 ip, 4 temp, 8 clock, 16 alarm, 32 health
int8_t prevY[112];
bool havePrev = false;

// ---- buttons + sound
bool b1Prev = HIGH, b2Prev = HIGH;
unsigned long b1At = 0, b2At = 0, lastBtnMs = 0, silenceUntil = 0;
unsigned long ringStart = 0, nextNote = 0;
byte noteIx = 0, beepStep = 0, lastMode = 0;
const uint16_t melody[] = {523, 659, 784, 1047, 784, 659, 523, 0, 587, 740, 880, 1175, 880, 740, 587, 0};
const byte MELODY_LEN = sizeof(melody) / sizeof(melody[0]);

char rx[72];
byte rxLen = 0;

void drawAurField(byte which);
void drawRing(bool on);
void drawView(byte v);

// ------------------------------------------------------------------ helpers
void centered(const char* s, int y, byte size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color);
  int w = strlen(s) * 6 * size;
  tft.setCursor(max(0, (128 - w) / 2), y);
  tft.print(s);
}

void title(const char* s, uint16_t color) {
  tft.setTextSize(1);
  tft.setTextColor(color);
  tft.setCursor(2, 2);
  tft.print(s);
  tft.drawFastHLine(0, 13, 128, C_DIM);
}

uint16_t stateColor() {
  if (state == 'C' || state == 'N') return C_AMBER;
  if (state == 'R' || state == 'T') return C_GREEN;
  return C_RED;
}

const char* stateWord() {
  switch (state) {
    case 'R': return "READY";
    case 'T': return "THINKING";
    case 'C': return "CLAUDE";
    case 'H': return "HAT OFF";
    case 'U': return "UI OFF";
    default:  return "NO LINK";
  }
}

byte currentView() {
  if (almMode && millis() > silenceUntil) return V_RING;
  if (night && millis() - lastBtnMs > 20000UL) return V_NIGHT;
  return page;
}

// ------------------------------------------------------------------ views
void drawAur() {
  title("AURELIA", C_GREEN);
  tft.fillCircle(122, 5, 3, stateColor());
  centered(stateWord(), 19, 2, stateColor());
  if (state == 'R') tft.drawFastHLine(8, 45, 112, C_GREEN);
  else if (state != 'T' && state != 'C') tft.drawFastHLine(8, 45, 112, C_DKRED);
  havePrev = false;
  if (state == 'N') {
    centered("waiting for the Pi", 58, 1, C_WHITE);
    centered("run aurelia_oled.py", 72, 1, C_GREY);
    centered("--serial", 82, 1, C_GREY);
    return;
  }
  for (byte i = 0; i < 4; i++) drawAurField(i);
}

void drawAurField(byte which) {
  tft.setTextSize(1);
  tft.setTextColor(C_GREY);
  switch (which) {
    case 0: tft.fillRect(0, 58, 128, 8, C_BLACK); centered(sub, 58, 1, C_WHITE); break;
    case 1: tft.fillRect(0, 72, 128, 8, C_BLACK); tft.setCursor(2, 72); tft.print(ip); break;
    case 2: tft.fillRect(0, 86, 60, 8, C_BLACK); tft.setCursor(2, 86); tft.print(temp); break;
    case 3: tft.fillRect(68, 86, 60, 8, C_BLACK); tft.setCursor(126 - strlen(clk) * 6, 86); tft.print(clk); break;
  }
}

void drawWave() {
  float t = millis() / 1000.0;
  int8_t y[112];
  for (byte i = 0; i < 112; i++) {
    float k = (i + 8) / 9.0;
    y[i] = 45 + 7 * sin(k + t * 6) * sin((i + 8) / 37.0 + t * 1.7) + 2 * sin(k * 3.1 - t * 9);
  }
  uint16_t col = stateColor();
  for (byte i = 0; i < 111; i++) {
    if (havePrev) tft.drawLine(i + 8, prevY[i], i + 9, prevY[i + 1], C_BLACK);
    tft.drawLine(i + 8, y[i], i + 9, y[i + 1], col);
  }
  memcpy(prevY, y, sizeof(y));
  havePrev = true;
  tft.fillCircle(122, 5, 3, (millis() / 250) % 2 ? col : C_DIM);
}

void bar(byte row, const char* label, byte pct) {
  int y = 18 + row * 15;
  tft.fillRect(0, y, 128, 10, C_BLACK);
  tft.setTextSize(1);
  tft.setTextColor(C_GREY);
  tft.setCursor(2, y + 1);
  tft.print(label);
  uint16_t col = pct >= 90 ? C_RED : pct >= 75 ? C_AMBER : C_GREEN;
  tft.drawRect(28, y, 70, 9, C_DIM);
  tft.fillRect(29, y + 1, (68 * pct) / 100, 7, col);
  tft.setTextColor(C_WHITE);
  tft.setCursor(102, y + 1);
  tft.print(pct);
  tft.print('%');
}

void drawHealthValues() {
  bar(0, "CPU", cpu);
  bar(1, "RAM", ram);
  bar(2, "SD", sd);
  tft.fillRect(0, 66, 128, 28, C_BLACK);
  tft.setTextSize(1);
  tft.setTextColor(C_GREY);
  tft.setCursor(2, 68);  tft.print("TEMP "); tft.setTextColor(C_WHITE); tft.print(temp);
  tft.setTextColor(C_GREY);
  tft.setCursor(2, 82);  tft.print("UP   "); tft.setTextColor(C_WHITE); tft.print(upt);
}

void drawHealth() {
  title("PI HEALTH", C_GREEN);
  drawHealthValues();
}

void drawClockTime() {
  tft.fillRect(0, 22, 128, 26, C_BLACK);
  centered(clk, 24, 3, C_WHITE);
}

void drawClockAlarm() {
  tft.fillRect(0, 56, 128, 38, C_BLACK);
  tft.setTextSize(1);
  tft.setTextColor(C_GREY);
  tft.setCursor(2, 58);
  tft.print("Alarm ");
  tft.setTextColor(strcmp(nextAl, "off") ? C_GREEN : C_GREY);
  tft.print(nextAl);
  if (snz[0]) centered(snz, 72, 1, C_AMBER);
  centered("B1 page   B2 stop", 86, 1, C_DIM);
}

void drawClock() {
  title("CLOCK", C_GREEN);
  drawClockTime();
  drawClockAlarm();
}

void drawNight() {   // big dim red clock that drifts a little each minute (OLED burn-in protection)
  int m = (clk[3] - '0') * 10 + (clk[4] - '0');
  if (m < 0 || m > 59) m = 0;
  int x = 2 + (m % 3) * 2, y = 22 + ((m / 3) % 3) * 6;
  tft.setTextSize(4);
  tft.setTextColor(C_NIGHT);
  tft.setCursor(x, y);
  tft.print(clk);
  if (strcmp(nextAl, "off")) {
    tft.setTextSize(1);
    tft.setTextColor(C_DKRED);
    tft.setCursor(x + 4, y + 40);
    tft.print(nextAl);
  }
}

void drawRing(bool on) {
  tft.fillRect(0, 0, 128, 96, C_BLACK);
  uint16_t col = almMode == 2 ? C_RED : C_AMBER;
  centered("WAKE UP", 4, 2, on ? col : C_DIM);
  centered(clk, 32, 3, on ? C_WHITE : C_GREY);
  if (snz[0]) centered(snz, 62, 1, C_GREY);
  centered("B1 snooze  B2 stop", 84, 1, C_GREY);
}

void drawView(byte v) {
  tft.fillScreen(C_BLACK);
  switch (v) {
    case V_AUR: drawAur(); break;
    case V_HEALTH: drawHealth(); break;
    case V_CLOCK: drawClock(); break;
    case V_NIGHT: drawNight(); break;
    case V_RING: drawRing(true); break;
  }
}

// ------------------------------------------------------------------ brightness + sound
void setBright(byte b) {
  if (b > 15) b = 15;
  if (b == bright) return;
  if (b == 0) {
    tft.enableDisplay(false);
  } else {
    if (bright == 0) tft.enableDisplay(true);
    uint8_t v = b;
    tft.sendCommand(0xC7, &v, 1);
  }
  bright = b;
}

void soundOff() {
  noTone(BUZZ_P);
  digitalWrite(BUZZ_A, LOW);
}

void soundTick() {
  byte mode = (millis() > silenceUntil) ? almMode : 0;
  if (mode != lastMode) {
    soundOff();
    ringStart = millis();
    noteIx = beepStep = 0;
    nextNote = 0;
    lastMode = mode;
  }
  if (!mode || millis() < nextNote) return;
  unsigned long secs = (millis() - ringStart) / 1000;
  if (mode == 1) {                              // melody, speeding up the longer it rings
    int len = 280 - (int)min(secs, 45UL) * 4;   // 280 ms per note down to 100 ms
    uint16_t f = melody[noteIx];
    if (f) tone(BUZZ_P, f, len * 8 / 10); else noTone(BUZZ_P);
    noteIx = (noteIx + 1) % MELODY_LEN;
    nextNote = millis() + len;
  } else {                                      // beeping: 4 short beeps, pause, repeat
    bool on = beepStep < 8 && beepStep % 2 == 0;
    digitalWrite(BUZZ_A, on ? HIGH : LOW);
    nextNote = millis() + (beepStep < 8 ? 110 : 600);
    beepStep = (beepStep + 1) % 9;
  }
}

// ------------------------------------------------------------------ input
void pressed(byte which) {
  Serial.print(which == 1 ? "B1\n" : "B2\n");
  bool ringing = almMode && millis() > silenceUntil;
  if (ringing) {                     // snooze / stop: go quiet right away, the Pi confirms
    silenceUntil = millis() + 2000;
    soundOff();
    dirty = true;
    return;
  }
  bool asleep = night && millis() - lastBtnMs > 20000UL;
  lastBtnMs = millis();
  if (which == 1 && !asleep) page = (page + 1) % 3;
  dirty = true;
}

void readButtons() {
  bool b1 = digitalRead(BTN1), b2 = digitalRead(BTN2);
  if (b1 != b1Prev && millis() - b1At > 40) { b1At = millis(); b1Prev = b1; if (b1 == LOW) pressed(1); }
  if (b2 != b2Prev && millis() - b2At > 40) { b2At = millis(); b2Prev = b2; if (b2 == LOW) pressed(2); }
}

void copyField(char* dst, const char* src, byte size, byte bit) {
  if (strncmp(dst, src, size - 1) != 0) {
    strncpy(dst, src, size - 1);
    dst[size - 1] = 0;
    fieldDirty |= bit;
  }
}

void parseLine() {
  char* f[7];
  byte n = 0;
  char* p = strtok(rx, "|");
  while (p && n < 7) { f[n++] = p; p = strtok(NULL, "|"); }
  if (n == 0) return;
  if (!strcmp(f[0], "AUR") && n == 7) {
    if (f[1][0] != state) { state = f[1][0]; if (shown == V_AUR) dirty = true; }
    copyField(sub, f[2], sizeof(sub), 1);
    copyField(ip, f[3], sizeof(ip), 2);
    copyField(temp, f[4], sizeof(temp), 4);
    copyField(clk, f[5], sizeof(clk), 8);
    setBright(atoi(f[6]));
  } else if (!strcmp(f[0], "ALM") && n >= 4) {
    copyField(nextAl, f[1], sizeof(nextAl), 16);
    almMode = atoi(f[2]);
    night = atoi(f[3]);
    copyField(snz, n >= 5 ? f[4] : "", sizeof(snz), 16);
  } else if (!strcmp(f[0], "SYS") && n == 5) {
    byte c = atoi(f[1]), r = atoi(f[2]), s = atoi(f[3]);
    if (c != cpu || r != ram || s != sd || strcmp(upt, f[4])) fieldDirty |= 32;
    cpu = c; ram = r; sd = s;
    strncpy(upt, f[4], sizeof(upt) - 1);
  } else {
    return;
  }
  lastRx = millis();
}

// ------------------------------------------------------------------ main
void setup() {
  pinMode(BTN1, INPUT_PULLUP);
  pinMode(BTN2, INPUT_PULLUP);
  pinMode(BUZZ_A, OUTPUT);
  digitalWrite(BUZZ_A, LOW);
  Serial.begin(115200);
  tft.begin();
  tft.setRotation(FLIP ? 2 : 0);
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { rx[rxLen] = 0; parseLine(); rxLen = 0; }
    else if (c != '\r' && rxLen < sizeof(rx) - 1) rx[rxLen++] = c;
  }
  readButtons();
  if (state != 'N' && millis() - lastRx > 6000) {   // the Pi stopped talking: go quiet, say so
    state = 'N';
    almMode = 0;
    night = 0;
    setBright(15);
    dirty = true;
    page = V_AUR;
  }
  soundTick();
  if (bright == 0) { delay(10); return; }

  byte v = currentView();
  if (v != shown || dirty) {
    drawView(v);
    shown = v;
    dirty = false;
    fieldDirty = 0;
  } else if (fieldDirty) {
    if (v == V_AUR && state != 'N') { for (byte i = 0; i < 4; i++) if (fieldDirty & (1 << i)) drawAurField(i); }
    else if (v == V_HEALTH && (fieldDirty & (32 | 4))) drawHealthValues();
    else if (v == V_CLOCK) { if (fieldDirty & 8) drawClockTime(); if (fieldDirty & 16) drawClockAlarm(); }
    else if (v == V_NIGHT && (fieldDirty & (8 | 16))) drawView(V_NIGHT);
    else if (v == V_RING && (fieldDirty & (8 | 16))) drawRing(true);
    fieldDirty = 0;
  }

  if (v == V_AUR && (state == 'T' || state == 'C')) { drawWave(); delay(15); }
  else if (v == V_RING) {
    static bool flash = true;
    static unsigned long nextFlash = 0;
    if (millis() > nextFlash) {
      flash = !flash;
      nextFlash = millis() + 500;
      centered("WAKE UP", 4, 2, flash ? (almMode == 2 ? C_RED : C_AMBER) : C_DIM);
    }
    delay(5);
  } else {
    delay(20);
  }
}
