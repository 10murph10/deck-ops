// Elegoo lesson 2.13 IR Receiver, rewritten for the current IRremote library (4.x).
// One file, no IR.h, no zip. Needs: Sketch > Include Library > Manage Libraries > "IRremote" > Install.
// Wiring: receiver Y (signal) to pin 2, R to 5V, G to GND.
// Open Tools > Serial Monitor at 9600 and press buttons on the Elegoo remote.

#include <IRremote.hpp>

#define RECEIVER 2   // signal pin

void setup() {
  Serial.begin(9600);
  Serial.println(F("IR Receiver Button Decode"));
  IrReceiver.begin(RECEIVER, ENABLE_LED_FEEDBACK);   // the UNO's L light flickers when a signal arrives
}

void loop() {
  if (!IrReceiver.decode()) return;                  // nothing received yet

  if (IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT) {
    Serial.println(F("REPEAT"));                     // a button is being held down
  } else {
    switch (IrReceiver.decodedIRData.command) {
      case 0x45: Serial.println(F("POWER")); break;
      case 0x47: Serial.println(F("FUNC/STOP")); break;
      case 0x46: Serial.println(F("VOL+")); break;
      case 0x44: Serial.println(F("FAST BACK")); break;
      case 0x40: Serial.println(F("PAUSE")); break;
      case 0x43: Serial.println(F("FAST FORWARD")); break;
      case 0x07: Serial.println(F("DOWN")); break;
      case 0x15: Serial.println(F("VOL-")); break;
      case 0x09: Serial.println(F("UP")); break;
      case 0x19: Serial.println(F("EQ")); break;
      case 0x0D: Serial.println(F("ST/REPT")); break;
      case 0x16: Serial.println(F("0")); break;
      case 0x0C: Serial.println(F("1")); break;
      case 0x18: Serial.println(F("2")); break;
      case 0x5E: Serial.println(F("3")); break;
      case 0x08: Serial.println(F("4")); break;
      case 0x1C: Serial.println(F("5")); break;
      case 0x5A: Serial.println(F("6")); break;
      case 0x42: Serial.println(F("7")); break;
      case 0x52: Serial.println(F("8")); break;
      case 0x4A: Serial.println(F("9")); break;
      default:
        Serial.print(F("other button, code 0x"));
        Serial.println(IrReceiver.decodedIRData.command, HEX);
    }
  }
  IrReceiver.resume();                               // get ready for the next button
}
