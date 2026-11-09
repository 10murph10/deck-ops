/* Deck Ops content: phases, skill nodes, parts, codex. */
const BRANCHES = [
  { id: 'linux', name: 'Linux', blurb: 'The deck itself: the terminal, packages, remote access, recovery.' },
  { id: 'elec', name: 'Electronics', blurb: 'Your Arduino kit first, then soldering, power, batteries and the ESP32.' },
  { id: 'cad', name: 'CAD & fab', blurb: 'Makerspace, Tinkercad, printing, measuring, and the aluminum front panel.' },
  { id: 'radio', name: 'Radio', blurb: 'How radio works, the SDR, antennas, mesh messaging and the ham ticket.' }
];

const PHASES = [
  { id: 1, name: 'Bench deck', gate: null,
    blurb: 'The Pi on the kitchen table, booting to your TV. Learn the terminal and work through the Arduino kit basics.',
    obj: ['L1', 'L2', 'L3', 'L4', 'E1', 'E2', 'E3', 'E4', 'E5'] },
  { id: 2, name: 'Radio ears', gate: { node: 'L4' },
    blurb: 'An RTL-SDR dongle turns the deck into a wide-band receiver: FM, aircraft, weather, ham, and shortwave later.',
    obj: ['L5', 'L6', 'R1', 'R2', 'R3', 'R4'] },
  { id: 3, name: 'The case', gate: null,
    blurb: 'Radio field kit: Nanuk hard case, aluminum front panel, printed brackets. You design it; Creation Nation prints it. Open from day one so you can start the makerspace training now.',
    obj: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'L9'] },
  { id: 4, name: 'Field power', gate: { node: 'C8' },
    blurb: 'A battery board with 18650 cells so the deck runs unplugged. The one phase with real safety rules; read the Safety page in the Codex before buying.',
    obj: ['E8', 'E9', 'L8'] },
  { id: 5, name: 'Mesh net', gate: { node: 'E5' },
    blurb: 'Meshtastic nodes for off-grid text, a first ESP32, soldering, and gadgets that report to the deck.',
    obj: ['E6', 'E7', 'E10', 'L7', 'R5', 'L10'] },
  { id: 6, name: 'On the air', gate: { node: 'R4' },
    blurb: 'Shortwave listening across continents, then the Basic certificate and a VE4 call sign of your own.',
    obj: ['R6', 'R7'] }
];

const NODES = [
  /* ---------------- LINUX ---------------- */
  { id: 'L1', b: 'linux', phase: 1, t: 'First boot', mins: 45, xp: 10, req: [], needs: ['pi-kit', 'keyboard', 'cord'],
    why: 'The kit is a complete computer. This gets it running on your HP monitor.',
    learn: [
      'Fit the Pi into the metal case with the thermal pad between the chip and the lid. The case is the heat sink.',
      'The microSD card is the Pi\'s hard drive, and the kit\'s card already has Raspberry Pi OS on it. Slide it into the slot under the board, label facing away.',
      'Run the kit\'s micro-HDMI cable from the Pi (the port beside the USB-C power jack) to either HDMI port on the HP monitor. Then the keyboard\'s USB receiver, then power last.',
      'The setup wizard asks for country (Canada), keyboard, a username and password, and Wi-Fi, then offers updates. Say yes; it takes 10 to 20 minutes.',
      'Shut down from the menu, not by pulling the plug. Cutting power while it runs can corrupt the card.'
    ],
    mission: 'Boot the deck, finish the wizard, and open the Terminal from the icon in the top bar.',
    done: 'You\'re on the desktop with a terminal window open.',
    terms: ['sbc', 'rpios', 'microsd', 'hdmi'] },

  { id: 'L2', b: 'linux', phase: 1, t: 'Find your way', mins: 30, xp: 10, req: ['L1'],
    why: 'The terminal is a text door into the whole machine. Everything after this uses it.',
    learn: [
      'Linux keeps every file in one tree starting at `/`. Your own files live in your home folder, written `~`.',
      'The prompt `marshall@deck:~ $` reads: user, computer name, current folder.',
      '`pwd` prints where you are. `ls` lists what\'s here. `cd name` moves in, `cd ..` moves up one, `cd ~` goes home.',
      'Tab finishes a name for you. The up arrow brings back earlier commands.',
      'Capitals matter: `Deck` and `deck` are different folders.'
    ],
    cmd: [['pwd', 'Print the folder you\'re in'], ['ls', 'List what\'s here'], ['cd ..', 'Up one folder'], ['mkdir -p ~/deck/logs', 'Make a folder and any parents it needs']],
    mission: 'Make a folder called deck with a logs folder inside it, move into logs, and print where you are.',
    done: '`pwd` shows /home/yourname/deck/logs.',
    terms: ['terminal', 'home', 'path'] },

  { id: 'L3', b: 'linux', phase: 1, t: 'Files and editing', mins: 30, xp: 10, req: ['L2'],
    why: 'Config files, notes and scripts are all plain text. You need to make, read, copy and delete them without a mouse.',
    learn: [
      '`nano file.txt` opens a simple editor inside the terminal. Ctrl+O then Enter saves, Ctrl+X quits. The shortcuts are listed along the bottom.',
      '`cat file.txt` prints a file. `cp a b` copies, `mv a b` moves or renames.',
      '`rm file` deletes for good. There is no trash can, so read the line twice before pressing Enter.',
      '`touch name` makes an empty file.'
    ],
    cmd: [['nano ~/deck/notes.txt', 'Write a file'], ['cat ~/deck/notes.txt', 'Print it'], ['cp notes.txt notes-copy.txt', 'Copy it'], ['rm notes-copy.txt', 'Delete the copy']],
    mission: 'Write three lines in ~/deck/notes.txt about what you did today, print them with cat, make a copy, then delete the copy.',
    done: '`ls ~/deck` shows notes.txt and no copy.',
    terms: ['editor'] },

  { id: 'L4', b: 'linux', phase: 1, t: 'Updates and packages', mins: 30, xp: 15, req: ['L3'],
    why: 'Every tool you add, from SDR drivers to Python libraries, installs this way. Finishing this opens Radio ears.',
    learn: [
      'Software comes as packages from Raspberry Pi\'s servers. `apt` is the tool that fetches and installs them.',
      '`sudo` runs one command as the administrator. It asks for your password, and nothing shows while you type it. That\'s normal.',
      '`sudo apt update` refreshes the list of what\'s available. `sudo apt full-upgrade` installs the newer versions. Do both, in that order, every week or two.',
      '`sudo apt install name` installs a program; `sudo apt remove name` takes it off.'
    ],
    cmd: [['sudo apt update', 'Refresh the package list'], ['sudo apt full-upgrade', 'Install all updates'], ['sudo apt install htop', 'Install the htop monitor'], ['htop', 'Run it; q quits']],
    mission: 'Update the Pi from the terminal without looking at notes, then install htop and watch the four cores work.',
    done: 'You ran update, upgrade and an install from memory.',
    terms: ['sudo', 'apt'] },

  { id: 'L5', b: 'linux', phase: 2, t: 'Permissions', mins: 30, xp: 10, req: ['L4'],
    why: 'SDR drivers and device access trip over permissions. Knowing how they work turns a confusing error into a two-minute fix.',
    learn: [
      'Every file has an owner and three permissions: read (r), write (w) and execute (x). `ls -l` shows them, like `-rwxr-xr--`.',
      'The three groups of three are: the owner, the owner\'s group, and everyone else.',
      '`chmod +x file` makes a file runnable as a program.',
      '`sudo` bypasses all of it. That\'s why you read any sudo command before running it, especially one copied from the internet.'
    ],
    cmd: [['ls -l', 'Show permissions'], ['chmod +x hello.sh', 'Make a script runnable'], ['./hello.sh', 'Run it']],
    code: '#!/bin/bash\necho "deck online"',
    mission: 'Make a script called hello.sh with the two lines above, make it executable, and run it.',
    done: '`./hello.sh` prints deck online.',
    terms: ['permissions', 'script'] },

  { id: 'L6', b: 'linux', phase: 2, t: 'Remote control', mins: 30, xp: 10, req: ['L4'],
    why: 'SSH lets you drive the deck\'s terminal from your laptop or phone. Very handy once it\'s sealed in a case.',
    learn: [
      'Turn it on in Menu > Preferences > Raspberry Pi Configuration > Interfaces > SSH. Set the hostname to deck on the System tab while you\'re there.',
      'From a laptop on the same Wi-Fi, run `ssh yourname@deck.local`. Windows 10 and 11 and macOS have ssh built in.',
      'If the .local name doesn\'t resolve, `hostname -I` on the Pi shows its IP address to use instead.',
      'Type `exit` to leave.'
    ],
    cmd: [['ssh marshall@deck.local', 'Log in from another computer (use your username)'], ['hostname -I', 'Show the Pi\'s IP address'], ['exit', 'Close the session']],
    mission: 'Rename the Pi to deck, enable SSH, and log in from your laptop.',
    done: 'Your laptop\'s terminal shows yourname@deck.',
    terms: ['ssh', 'hostname'] },

  { id: 'L7', b: 'linux', phase: 5, t: 'Scripts and Python', mins: 45, xp: 15, req: ['L5'],
    why: 'Python is how the deck will log signals, read gadgets and automate chores.',
    learn: [
      'A script is a list of commands saved in a file. Bash suits terminal chores; Python is better once there\'s logic or data.',
      'Python 3 is already installed. `python3 file.py` runs a file.',
      '`vcgencmd measure_temp` reports the Pi\'s chip temperature.',
      'The script below logs the temperature with a timestamp every minute. Ctrl+C stops it.'
    ],
    code: 'import subprocess, time\nwhile True:\n    t = subprocess.run(["vcgencmd", "measure_temp"],\n                       capture_output=True, text=True).stdout.strip()\n    print(time.strftime("%H:%M:%S"), t, flush=True)\n    time.sleep(60)',
    mission: 'Save it as ~/deck/temp.py, run it for ten minutes while htop runs in another window, and log the highest temperature.',
    done: 'A Field log entry with your temperature readings.',
    terms: ['python'] },

  { id: 'L8', b: 'linux', phase: 4, t: 'Break it and rebuild', mins: 60, xp: 20, req: ['L3'],
    why: 'Before the deck goes into the field, prove you can bring it back from nothing.',
    learn: [
      'Back up your files to a USB stick: `cp -r ~/deck /media/yourname/STICK/` (the stick\'s name will differ).',
      'On your laptop, Raspberry Pi Imager writes a fresh OS to the card. Choose Raspberry Pi 5, Raspberry Pi OS (64-bit), then the card.',
      'Its settings screen can preset your username, Wi-Fi, hostname and SSH so the rebuilt deck comes up ready.',
      'Restore your files from the stick and reinstall your tools. Keep a text file listing every install command; that list is your rebuild kit.'
    ],
    links: [['Raspberry Pi Imager', 'https://www.raspberrypi.com/software/']],
    mission: 'Back up, wipe the card with Imager, rebuild, restore your notes, and reinstall htop and the SDR drivers.',
    done: 'The rebuilt deck runs everything it did before.',
    terms: ['imager'] },

  { id: 'L9', b: 'linux', phase: 3, t: 'Two screens', mins: 30, xp: 15, req: ['L4'], needs: ['screen', 'hdmi2'],
    why: 'At the bench the deck drives the big HP monitor and its own 7-inch at the same time: work on one, watch the radio on the other.',
    learn: [
      'The Pi 5 has two micro-HDMI ports and runs a separate screen on each. HDMI0 sits beside the USB-C power jack; HDMI1 is next to it.',
      'Big monitor on HDMI0, the 7-inch on HDMI1. Plug both in before powering on.',
      'Open Menu > Preferences > Screen Configuration. Drag the two screens so their layout matches your desk, then pick which one is the main display. Apply.',
      'Windows drag across from one screen to the other. The 7-inch becomes your status screen; the HP stays your workspace.',
      'In the field, unplug the HP and the deck carries on with just the 7-inch.'
    ],
    mission: 'Run both screens at once, arrange them to match your desk, and drag a terminal across to the 7-inch.',
    done: 'Both screens show one desktop and windows move between them.',
    terms: [] },

  { id: 'L10', b: 'linux', phase: 5, t: 'Status board', mins: 90, xp: 25, req: ['L9', 'L7', 'E6'],
    why: 'The side screen becomes the deck\'s instrument panel: radio, mesh, system and gadgets at a glance.',
    learn: [
      'Each panel is just a window on the 7-inch. Drag and resize them by their edges and corners into a grid.',
      'System: `htop` for CPU and memory, and `watch -n 5 vcgencmd measure_temp` for the chip temperature, refreshing every 5 seconds.',
      'Gadgets: `tail -f ~/deck/logs/sensor.csv` prints each new reading from your E6 logger as it arrives.',
      'Radio: the SDR waterfall from R2, sized to fill half the screen.',
      'Mesh: the Meshtastic web client in Chromium shows messages and the node map from the deck\'s node.',
      'Once the layout is right, save the startup commands in a script so one command rebuilds the board.'
    ],
    mission: 'Build a four-panel status board on the 7-inch (waterfall, mesh, htop, sensor feed) while you work on the HP monitor.',
    done: 'All four panels run on the side screen at once, and one script brings them back after a reboot.',
    terms: [] },

  /* ---------------- ELECTRONICS ---------------- */
  { id: 'E1', b: 'elec', phase: 1, t: 'Blink', mins: 30, xp: 10, req: [], needs: ['arduino'],
    why: 'Uploading a program and watching hardware respond is the core loop of every gadget you\'ll build.',
    learn: [
      'Install the Arduino IDE on your computer. Plug the board in, then pick the board (Arduino Uno, which is right for the Elegoo UNO too) and its port (COM3 or similar on Windows) in the IDE.',
      'Open File > Examples > 01.Basics > Blink and press Upload (the right arrow).',
      'A sketch has two parts: `setup()` runs once, `loop()` runs forever. Blink turns pin 13 on, waits 1000 ms, turns it off, waits.',
      'Change both 1000s to 200 and upload again. You just changed what the hardware does with code.'
    ],
    links: [['Arduino IDE download', 'https://www.arduino.cc/en/software']],
    mission: 'Upload Blink, then rewrite the loop so the onboard LED flashes SOS: three short, three long, three short.',
    done: 'The board flashes SOS on repeat.',
    terms: ['arduino', 'sketch', 'flashing'] },

  { id: 'E2', b: 'elec', phase: 1, t: 'The breadboard', mins: 45, xp: 10, req: ['E1'],
    why: 'The breadboard lets you build and change circuits without solder. Every early gadget starts here.',
    learn: [
      'The holes are joined in strips: each short row of five is one connection, and the long rails down the sides carry power (+) and ground (−).',
      'An LED only works one way round. The long leg (+) goes toward the pin, the short leg toward ground. A flat edge on the rim marks the short side.',
      'An LED with no resistor draws too much current and dies. Put a 220 Ω resistor in series. On 5-band resistors that\'s red, red, black, black, brown; on 4-band ones, red, red, brown, gold.',
      'The circuit: pin 13, then the resistor, then the LED\'s long leg; the LED\'s short leg to GND.'
    ],
    mission: 'Wire an external LED to pin 13 through a 220 Ω resistor and run your SOS sketch on it.',
    done: 'The breadboard LED flashes along with the onboard one.',
    terms: ['breadboard', 'led', 'resistor', 'ground'] },

  { id: 'E3', b: 'elec', phase: 1, t: 'Ohm\'s law', mins: 45, xp: 15, req: ['E2'],
    why: 'One equation explains resistor values, why parts get hot, and how long a battery lasts.',
    learn: [
      'Voltage (V, volts) is the push. Current (I, amps) is the flow. Resistance (R, ohms) slows the flow.',
      'Ohm\'s law: V = I × R. Rearranged, I = V ÷ R and R = V ÷ I.',
      'Worked example: a pin gives 5 V and a red LED drops about 2 V, leaving 3 V across the resistor. For 15 mA, R = 3 ÷ 0.015 = 200 Ω, so use the next standard value up, 220 Ω.',
      'Power is P = V × I, in watts. It tells you how hot a part gets and how fast a battery drains.',
      'Resistor bands are digits, then how many zeros. 5-band: three digits, then the zeros (red, red, black, black, brown is 220 and no zeros). 4-band: two digits, then the zeros (red, red, brown is 22 and one zero). Both are 220 Ω.'
    ],
    mission: 'Work out the resistor for a 20 mA LED at 5 V with a 2 V drop. Then wire two LEDs, one on 220 Ω and one on 1 kΩ (5 bands: brown, black, black, brown, brown), and compare.',
    done: 'You got 150 Ω and can explain why the 1 kΩ LED is dimmer.',
    terms: ['voltage', 'current', 'ohms', 'watt'] },

  { id: 'E4', b: 'elec', phase: 1, t: 'Inputs', mins: 30, xp: 10, req: ['E2'],
    why: 'Pins can read as well as write. Buttons and switches are how you talk to a gadget.',
    learn: [
      '`digitalRead(pin)` returns HIGH or LOW.',
      'An unconnected input pin floats and reads random values. `INPUT_PULLUP` switches on a built-in resistor that holds it HIGH until something connects it to ground.',
      'Wire a pushbutton from pin 2 to GND and the pin reads LOW while it\'s pressed.',
      'The toggle switches on your deck\'s panel would work exactly this way if you wired them to a board.'
    ],
    code: 'void setup() {\n  pinMode(2, INPUT_PULLUP);\n  pinMode(13, OUTPUT);\n}\nvoid loop() {\n  digitalWrite(13, digitalRead(2) == LOW ? HIGH : LOW);\n}',
    mission: 'Make the LED light only while the button is held. Stretch: make each press toggle it (search "Arduino debounce" when it misbehaves).',
    done: 'The button controls the LED.',
    terms: ['pullup', 'digital'] },

  { id: 'E5', b: 'elec', phase: 1, t: 'Read a sensor', mins: 45, xp: 15, req: ['E4'],
    why: 'Measuring the world is what gadgets are for. Finishing this opens Mesh net.',
    learn: [
      '`analogRead(A0)` measures a voltage between 0 and 5 V and returns a number from 0 to 1023.',
      '`Serial.begin(9600)` and `Serial.println(value)` send readings to your laptop. Open Tools > Serial Monitor at 9600 baud to see them, or Serial Plotter for a live graph.',
      'Your kit\'s photoresistor is wired as a voltage divider: photoresistor from 5 V to A0, a 10 kΩ resistor from A0 to GND.',
      'Watching the number move as you cover the sensor is the moment it clicks.'
    ],
    mission: 'Wire the photoresistor from your kit and stream its readings to the Serial Plotter.',
    done: 'The plotter line moves when you cover or warm the sensor.',
    terms: ['analog', 'serial', 'baud'] },

  { id: 'E6', b: 'elec', phase: 5, t: 'Talk to the deck', mins: 60, xp: 20, req: ['E5', 'L4'],
    why: 'This is the deck-and-gadgets idea working: the Arduino measures, the Pi records.',
    learn: [
      'The Pi can read the Arduino\'s serial output over the same USB cable.',
      'Plug the Arduino into the Pi and run `ls /dev/tty*`. A genuine board shows up as /dev/ttyACM0; many clones show /dev/ttyUSB0.',
      'Install the serial library with `sudo apt install python3-serial`, then run the script below.',
      'Permission denied? Run `sudo usermod -aG dialout $USER`, then log out and back in.'
    ],
    code: 'import serial, time, pathlib\nport = serial.Serial("/dev/ttyACM0", 9600, timeout=2)\nout = pathlib.Path.home() / "deck/logs/sensor.csv"\nwith open(out, "a") as f:\n    while True:\n        line = port.readline().decode(errors="ignore").strip()\n        if line:\n            f.write(time.strftime("%Y-%m-%d %H:%M:%S") + "," + line + "\\n")\n            f.flush()\n            print(line)',
    mission: 'Leave your E5 sketch on the Arduino, plug it into the Pi, and log an hour of readings to ~/deck/logs/sensor.csv.',
    done: 'sensor.csv holds an hour of timestamped readings.',
    terms: [] },

  { id: 'E7', b: 'elec', phase: 5, t: 'First solder', mins: 90, xp: 20, req: ['E2'], needs: ['solder'],
    why: 'A breadboard is for trying things. From here on, most of the build gets soldered: header pins on boards, the panel switches and USB ports, the battery wiring. Solder is what keeps it working after a day in a pack.',
    learn: [
      'What you\'ll solder: 20 practice joints on a board that doesn\'t matter, then a real job from your kit. If your LCD screen\'s 16 pins came as a loose strip, solder them on and the deck gets a little status screen.',
      'Two ways to do it: the electronics bench at Creation Nation once you\'re a member, or your own iron at home. A temperature-controlled iron kit is about $30 to $50 at Canadian Tire, Princess Auto or Amazon.ca, and a learn-to-solder practice kit is about $12.',
      'Heat the joint, not the solder. Hold the tip on the pad and the pin together for two seconds, then feed solder into the joint. A good joint is shiny and shaped like a small cone.',
      'The tip runs at about 350 °C. It goes in its stand every time you put it down. Work with moving air, wear glasses when clipping leads, and wash your hands after leaded solder.',
      'It\'s heat control and clean surfaces, the same as the forge at a much smaller scale.'
    ],
    mission: 'Make 20 practice joints, then solder the header pins onto your kit\'s LCD (or a header strip onto perfboard). Photograph your best and worst joints for the Field log.',
    done: 'Twenty good practice joints, a soldered header, and the photo logged.',
    terms: ['solder', 'flux'] },
  { id: 'E8', b: 'elec', phase: 4, t: 'Power budget', mins: 45, xp: 15, req: ['E3'],
    why: 'Before buying batteries, work out what the deck draws and how long it will run.',
    learn: [
      'Battery capacity is in mAh at a voltage. Energy in watt-hours is volts × amp-hours: two 3,000 mAh cells at 3.6 V hold about 2 × 3.6 × 3 = 21.6 Wh.',
      'Rough draws: the Pi 5 uses about 3 to 7 W depending on load, a 7-inch screen about 2 to 3 W, the SDR about 1.5 W. Call it 10 W working hard.',
      'Runtime ≈ watt-hours × 0.85 (conversion losses) ÷ watts. 21.6 × 0.85 ÷ 10 is about 1.8 hours.',
      'The Pi 5 wants 5 V at up to 5 A. On a weaker supply it limits its USB ports to 600 mA total, which can starve the SDR and front-panel ports.'
    ],
    mission: 'Write a power table for your deck: each part\'s watts, the total, and the runtime on two cells and on four. Log it.',
    done: 'A Field log entry with your table and runtime estimates.',
    terms: ['mah', 'buck', 'ups'] },

  { id: 'E9', b: 'elec', phase: 4, t: 'Battery build', mins: 90, xp: 30, req: ['E8'], needs: ['ups', 'cells', 'charger'],
    why: 'The deck goes cordless. This is the step with real hazards, so it goes slowly.',
    learn: [
      'Read the Safety page in the Codex first.',
      'Named-brand cells only, from a reputable Canadian seller. Check every cell\'s plastic wrap for tears; a torn wrap can short against metal.',
      'Seat the cells in the board\'s holder matching the + and − marks. Never solder directly to a cell.',
      'Do the first charge on the bench where you can watch it. Check after ten minutes: warm is normal, hot is not, so unplug.',
      'Keep the deck away from the forge. Heat and lithium cells don\'t mix.'
    ],
    mission: 'Install the UPS board and cells, run the deck unplugged until the low-battery warning, and log the real runtime beside your E8 estimate.',
    done: 'Measured runtime logged next to the estimate.',
    terms: ['cell18650'] },

  { id: 'E10', b: 'elec', phase: 5, t: 'Meet the ESP32', mins: 60, xp: 20, req: ['E5'], needs: ['esp32'],
    why: 'Same programming as the Arduino, plus Wi-Fi and Bluetooth, for about $15. The base for wireless gadgets.',
    learn: [
      'In the Arduino IDE, open Boards Manager, search esp32 and install "esp32 by Espressif Systems". If it doesn\'t appear, add Espressif\'s board URL from their docs under File > Preferences.',
      'Most ESP32 boards run at 3.3 V, not 5 V. Feeding 5 V into a pin can kill it.',
      'File > Examples > WiFi > WiFiScan lists the networks around you.',
      'The WebServer examples let your phone open a page served by the board itself.'
    ],
    mission: 'Run WiFiScan and log how many networks your house can see. Stretch: serve a sensor reading to your phone.',
    done: 'The Serial Monitor lists nearby networks.',
    terms: ['esp32'] },

  /* ---------------- CAD & FAB ---------------- */
  { id: 'C1', b: 'cad', phase: 3, t: 'Makerspace in', mins: 120, xp: 20, req: [], needs: ['membership'],
    why: 'Creation Nation has about ten printers, a laser cutter and an electronics bench, and people who have built Pi projects.',
    learn: [
      'Creation Nation Makerspace, 440 Rosser Avenue, Brandon. Membership is $50/month plus tax, with 24/7 access once you\'re in.',
      'Book the filament 3D printer training: slicing, materials, setup and common failures. It\'s free for members and $30 for non-members.',
      'Contact from their listings: makers@bnrc.ca or 204-729-2490 ext. 104.',
      'Ask while you\'re there whether they sell filament by the gram and where the electronics bench is.'
    ],
    links: [['Creation Nation, about', 'https://cnm.bnrc.ca/about-us/']],
    mission: 'Join, finish the 3D printer training, and print the test model they give you.',
    done: 'You\'re signed off on the printers.',
    terms: ['makerspace'] },

  { id: 'C2', b: 'cad', phase: 3, t: 'Tinkercad basics', mins: 60, xp: 10, req: [],
    why: 'You chose to design the case yourself. This is where that skill starts.',
    learn: [
      'Tinkercad is free CAD in a browser. You build parts by stacking simple shapes and cutting holes. Do this one at home before your printer training, then print the result there.',
      'Drag a box onto the workplane and type exact sizes into its handles. Work in millimetres.',
      'Set any shape to Hole, group it with a solid (Ctrl+G), and it cuts away.',
      'Align and Group are most of the job. Think like laying out stock at the anvil: size the blank, then mark what comes off.'
    ],
    links: [['Tinkercad', 'https://www.tinkercad.com']],
    mission: 'Design a 40 × 25 × 3 mm tag with your name raised 1 mm on top and a 4 mm hole in one corner. Export it as an STL.',
    done: 'Tag designed and saved as an STL file.',
    terms: ['cad', 'stl'] },

  { id: 'C3', b: 'cad', phase: 3, t: 'Print it', mins: 60, xp: 10, req: ['C1', 'C2'],
    why: 'Turning a file into a part you can hold, and learning which settings matter.',
    learn: [
      'A slicer (Bambu Studio, PrusaSlicer or Cura; use whatever the makerspace runs) turns an STL into layer-by-layer printer instructions.',
      'Layer height 0.2 mm is the everyday setting. Infill 15 to 20% suits most parts; brackets that take load want more.',
      'Supports hold up overhangs steeper than about 45°. Design parts to need as few as possible.',
      'PLA is easiest but softens around 60 °C. PETG holds to about 80 °C; use it for anything living in the shop or a hot truck.'
    ],
    mission: 'Slice and print your tag, in PETG if they have it.',
    done: 'The tag is in your hand.',
    terms: ['slicer', 'infill', 'petg'] },

  { id: 'C4', b: 'cad', phase: 3, t: 'Measure twice', mins: 45, xp: 15, req: ['C3'], needs: ['screen', 'calipers'],
    why: 'A case is only as good as its measurements. Printed parts also come out slightly off-size, and you need to know by how much.',
    learn: [
      'Digital calipers are the tool; a $25 pair is fine.',
      'Printed holes come out slightly small and pegs slightly big. Add 0.2 to 0.3 mm of clearance for a snug fit, 0.4 to 0.5 mm for a loose one.',
      'The Pi 5\'s mounting holes form a 58 × 49 mm rectangle and take M2.5 screws.',
      'Measure the screen\'s outer frame, its visible area, and where the connectors stick out. Write every number down.'
    ],
    mission: 'Measure your 7-inch screen and print a 2 mm thick frame it should drop into. Adjust and reprint until it fits.',
    done: 'The screen drops into a printed frame without forcing.',
    terms: ['tolerance'] },

  { id: 'C5', b: 'cad', phase: 3, t: 'Bracket design', mins: 90, xp: 20, req: ['C4'], needs: ['case', 'standoffs'],
    why: 'The first real deck part: the plate that holds the Pi inside the case.',
    learn: [
      'A standoff is a threaded post that holds a board off a surface. M2.5 × 6 mm brass standoffs suit the Pi.',
      'Design a 3 mm plate with four 2.7 mm holes on the 58 × 49 mm pattern, plus tabs to bolt it into the case.',
      'Leave air under the Pi and room for cables to bend; a plug needs about 30 mm behind it.',
      'Print, fit, adjust. Two or three versions is normal.'
    ],
    mission: 'Design and print a Pi mounting plate that bolts into the Nanuk case.',
    done: 'The Pi sits on standoffs on your printed plate inside the case.',
    terms: ['standoff'] },

  { id: 'C6', b: 'cad', phase: 3, t: 'Panel layout', mins: 60, xp: 15, req: ['C4'],
    why: 'Holes in aluminum are permanent. Cardboard is free.',
    learn: [
      'Draw the front panel at full size before touching metal.',
      'Place things in this order: the screen opening, antenna ports along the top edge, USB ports and switches where your hand falls, and the power switch apart from the rest so it never gets bumped.',
      'Typical hole sizes, to check against your actual parts: SMA bulkhead about 6.5 mm, mini toggle about 6 mm, panel USB per its flange.',
      'Keep the aluminum off the Pi itself so its Wi-Fi isn\'t blocked, or plan an external Wi-Fi antenna.'
    ],
    mission: 'Draw the panel full scale, cut it from cardboard, tape it into the case with the real parts poked through, and live with it for a week.',
    done: 'Cardboard panel tested and final hole positions written down.',
    terms: ['sma'] },

  { id: 'C7', b: 'cad', phase: 3, t: 'Cut the panel', mins: 120, xp: 25, req: ['C6'], needs: ['alu', 'sma', 'usbpanel', 'toggles'],
    why: 'Your shop skills, applied to the deck.',
    learn: [
      'Mark from the cardboard template with a scribe and square, then centre-punch every hole.',
      'Drill small pilot holes and step up. A step bit makes clean round holes in thin aluminum.',
      'For the screen opening, chain-drill just inside the line, cut with a metal-blade jigsaw or nibbler, and file to the line.',
      'Aluminum clogs files and blades. Chalk on the file and a little cutting fluid or WD-40 on the blade help.',
      'Deburr every edge. Finish it brushed with Scotch-Brite, or painted and stencilled. Your call.'
    ],
    mission: 'Cut, drill and finish the aluminum panel.',
    done: 'The panel test-fits in the case with every part mounted.',
    terms: [] },

  { id: 'C8', b: 'cad', phase: 3, t: 'Final fit', mins: 120, xp: 25, req: ['C5', 'C7'],
    why: 'Everything comes together. Finishing this opens Field power.',
    learn: [
      'Mount parts to the panel, then the panel into the case. Route cables in gentle bends and secure them with zip ties or printed clips.',
      'Strain relief: no cable should pull on a connector when the lid closes or the deck gets bumped.',
      'Leave the battery space empty and reachable for Field power.',
      'Close it, shake it gently, open it, and check nothing moved.'
    ],
    mission: 'Assemble the deck in its case and run it fully built for an evening.',
    done: 'The deck runs fully assembled in its case.',
    terms: ['strain'] },

  /* ---------------- RADIO ---------------- */
  { id: 'R1', b: 'radio', phase: 2, t: 'How radio works', mins: 45, xp: 10, req: [],
    why: 'Frequency and wavelength explain every antenna, band and setting you\'ll touch.',
    learn: [
      'A radio signal is a wave repeating millions of times a second. That rate is its frequency: 100 MHz is 100 million cycles a second.',
      'Wavelength in metres = 300 ÷ frequency in MHz. FM at 100 MHz has a 3 m wavelength, and antennas are sized as fractions of it.',
      'Bands: HF 3 to 30 MHz (shortwave, travels around the world), VHF 30 to 300 MHz (FM, airband, the 2 m ham band), UHF 300 to 3,000 MHz (aircraft transponders, LoRa mesh at 902 to 928 MHz).',
      'AM varies the wave\'s strength; FM varies its frequency. Airband uses AM; broadcast and most handheld radio use FM.',
      'In Canada listening is legal. Repeating or making use of private communications you overhear is not (Radiocommunication Act, section 9).'
    ],
    mission: 'Work out the wavelengths of 1090 MHz and 7.85 MHz, and log three Brandon FM stations with their frequencies.',
    done: 'You got about 27.5 cm and 38.2 m, and three stations are logged.',
    terms: ['frequency', 'wavelength', 'band', 'amfm'] },

  { id: 'R2', b: 'radio', phase: 2, t: 'First signals', mins: 90, xp: 20, req: ['R1'], needs: ['sdr'],
    why: 'The first time the deck pulls sound out of the air.',
    learn: [
      'Attach the dipole to the RTL-SDR V4 and plug it into a USB port.',
      'Install the drivers with the commands below, from the official RTL-SDR Blog V4 guide. Run them one line at a time and read what each does; you know enough Linux now.',
      'Reboot, then run `rtl_test`. It should find the device and name its R828D tuner. Ctrl+C stops it.',
      'For a receiver program, the Core Electronics SDR cyberdeck guide has a script that builds Gqrx for the V4 on a Pi. If you use their script, it handles the drivers too.'
    ],
    code: 'sudo apt purge ^librtlsdr\nsudo rm -rvf /usr/lib/librtlsdr* /usr/include/rtl-sdr* /usr/local/lib/librtlsdr* /usr/local/include/rtl-sdr* /usr/local/include/rtl_* /usr/local/bin/rtl_*\nsudo apt-get install libusb-1.0-0-dev git cmake pkg-config build-essential\ngit clone https://github.com/osmocom/rtl-sdr\ncd rtl-sdr\nmkdir build\ncd build\ncmake ../ -DINSTALL_UDEV_RULES=ON\nmake\nsudo make install\nsudo cp ../rtl-sdr.rules /etc/udev/rules.d/\nsudo ldconfig\necho \'blacklist dvb_usb_rtl28xxu\' | sudo tee --append /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf\nsudo reboot',
    links: [['RTL-SDR Blog V4 guide', 'https://www.rtl-sdr.com/v4'], ['Core Electronics SDR cyberdeck', 'https://core-electronics.com.au/projects/raspberry-pi-cyberdeck-sdr/']],
    mission: 'Tune a local FM station and hear it through the deck.',
    done: 'You heard FM broadcast through the SDR.',
    terms: ['sdr', 'rtlsdr', 'waterfall'] },

  { id: 'R3', b: 'radio', phase: 2, t: 'Antennas', mins: 60, xp: 15, req: ['R2'],
    why: 'The antenna matters more than the radio. Getting it right is the cheapest upgrade there is.',
    learn: [
      'A dipole is two equal arms pointing opposite ways. Each arm should be a quarter wavelength: 75 ÷ frequency in MHz, in metres.',
      'FM at 100 MHz needs about 75 cm per arm (the long telescopes). Aircraft at 1090 MHz need about 6.9 cm per arm (the short ones).',
      'Height and a clear view of the sky beat everything else. A window beats a basement; a roof beats a window.',
      'Airliners broadcast position, altitude and callsign on 1090 MHz (ADS-B). FlightAware\'s dump1090-fa, or readsb with tar1090, turns the deck into a live aircraft map. Pick one project and follow its install page exactly.'
    ],
    mission: 'Set the dipole for 1090 MHz, put it in a window, and track aircraft over Brandon on a live map.',
    done: 'You saw at least five aircraft with callsigns.',
    terms: ['dipole', 'adsb'] },

  { id: 'R4', b: 'radio', phase: 2, t: 'Listen around', mins: 90, xp: 20, req: ['R3'],
    why: 'Learning to find and identify signals on the waterfall. Finishing this opens On the air.',
    learn: [
      'Airband: 118 to 137 MHz, AM mode. Pilots and controllers in short, fast exchanges.',
      'Weatheradio Canada: one of seven channels between 162.400 and 162.550 MHz, FM. Continuous Environment Canada forecasts.',
      'The 2 m ham band: 144 to 148 MHz, FM. Local hams, often through repeaters on hilltops or towers.',
      'On the waterfall, signals show as bright streaks. Click one to tune it.',
      'Log each catch with the Signal tag: frequency, mode and what it was.'
    ],
    mission: 'Find and log one signal from each: airband, Weatheradio, and 2 m ham.',
    done: 'Three Signal entries in your Field log.',
    terms: ['repeater'] },

  { id: 'R5', b: 'radio', phase: 5, t: 'Mesh basics', mins: 90, xp: 20, req: ['R1'], needs: ['mesh'],
    why: 'Off-grid text messaging over kilometres, on gear you set up yourself.',
    learn: [
      'LoRa is a long-range, low-power radio method: short messages, kilometres, milliwatts, slow.',
      'Meshtastic is free firmware that turns LoRa boards into a text mesh. Each node relays the others\' messages, so no cell or internet is needed.',
      'Canada uses 902 to 928 MHz for this. In Meshtastic, set the region to US, which is that band.',
      'Flash each board from the web flasher in Chrome or Edge over USB, then pair it with the Meshtastic phone app over Bluetooth.',
      'Always attach the antenna before powering a LoRa board. Transmitting without one can damage it.'
    ],
    links: [['Meshtastic web flasher', 'https://flasher.meshtastic.org']],
    mission: 'Flash two nodes, set the region and a shared channel, and send a message across town between the deck\'s node and your pocket node.',
    done: 'A message got through with both phones\' cell data off.',
    terms: ['lora', 'meshtastic'] },

  { id: 'R6', b: 'radio', phase: 6, t: 'Shortwave', mins: 90, xp: 20, req: ['R4'], needs: ['longwire'],
    why: 'HF signals bounce off the ionosphere and cross oceans. Your deck can hear the world.',
    learn: [
      'HF (3 to 30 MHz) carries shortwave broadcasters, long-distance ham contacts and time stations.',
      'The RTL-SDR V4 tunes HF directly. There\'s no direct-sampling mode to set and no upconverter to buy.',
      'The little dipole is far too short for HF. Run 10 to 20 m of wire outdoors through a 9:1 balun to the SDR, as high as you can, well clear of power lines.',
      'Below 10 MHz is better at night; above 10 MHz is better by day.',
      'Ottawa\'s CHU time station transmits on 3.330, 7.850 and 14.670 MHz with a voice announcement every minute in English and French.'
    ],
    mission: 'Hear CHU Canada and log which frequency came in best at what time of day.',
    done: 'CHU logged with frequency and time.',
    terms: ['hf', 'balun'] },

  { id: 'R7', b: 'radio', phase: 6, t: 'Basic certificate', mins: 600, xp: 50, req: ['R1'],
    why: 'Listening is open to anyone. Transmitting on ham bands needs ISED\'s Basic Qualification.',
    learn: [
      'The exam is 100 multiple-choice questions drawn from a public question bank. 70% passes.',
      '80% or better earns Basic with Honours, which adds the HF bands below 30 MHz.',
      'Practise with ISED\'s exam generator until you score well every time. Many clubs run courses; search for one near Brandon.',
      'Accredited examiners give the real exam; ISED lists how to find one.',
      'Manitoba call signs start with VE4 or VA4.'
    ],
    links: [['ISED exam generator', 'https://ised-isde.canada.ca/site/amateur-radio-operator-certificate-services/en/amateur-radio-exam-generator'], ['Accredited examiners', 'https://ised-isde.canada.ca/site/amateur-radio-operator-certificate-services/node/4']],
    mission: 'Score 80% or better on three practice exams in a row, then book the real one.',
    done: 'Three practice scores of 80% or more logged.',
    terms: ['callsign', 'basicqual'] }
];

/* Parts. phase 0 = gadget bench (outside the deck budget). price null = unknown. approx = estimate. */
const PARTS = [
  { id: 'arduino', short: 'Arduino kit', phase: 0, name: 'Arduino starter kit', price: null, where: 'Already ordered', dflt: 'ordered', eta: '2026-11-06', note: 'Arriving Friday. Add what you paid.' },
  { id: 'pi-kit', short: 'Pi kit', phase: 1, name: 'Raspberry Pi 5 Aluminum Starter Kit, 4 GB', price: 227.95, where: 'PiShop.ca', url: 'https://www.pishop.ca/product/raspberry-pi-5-aluminum-starter-kit-4gb/', note: 'Pi, 27 W supply, 64 GB card with the OS loaded, micro-HDMI cable, fanless case. The 2 GB kit is $184.45.' },
  { id: 'cord', short: 'monitor cord', phase: 1, name: 'Canadian power cord for the HP monitor\'s power brick', price: 10, approx: true, where: 'Canadian Tire, Staples or Amazon.ca', note: 'The brick takes 100 to 240 V, so only the cord changes. Match the socket on the brick: three-lobed cloverleaf (C5) or figure-8 (C7).' },
  { id: 'keyboard', short: 'keyboard', phase: 1, name: 'Logitech K400 Plus keyboard and trackpad', price: 40, approx: true, where: 'Amazon.ca or local', url: 'https://www.amazon.ca/s?k=logitech+k400+plus', note: 'Goes on sale often.' },
  { id: 'sdr', short: 'SDR', phase: 2, name: 'RTL-SDR Blog V4 with dipole antenna kit', price: 75, approx: true, where: 'Amazon.ca', url: 'https://www.amazon.ca/s?k=rtl-sdr+blog+v4+dipole', note: 'Buy the kit with the telescoping dipole. It tunes shortwave directly, so no upconverter later.' },
  { id: 'solder', short: 'soldering kit', phase: 5, name: 'Soldering iron kit and a practice board', price: 55, approx: true, where: 'Canadian Tire, Princess Auto or Amazon.ca', note: 'A temperature-controlled iron with a stand, rosin-core solder and brass wool, plus a learn-to-solder kit. Using the makerspace bench instead? Mark this arrived once you\'re a member.' },
  { id: 'membership', short: 'membership', phase: 3, name: 'Creation Nation membership, 2 months', price: 100, where: '440 Rosser Ave, Brandon', url: 'https://cnm.bnrc.ca/about-us/', note: '$50/month plus tax.' },
  { id: 'calipers', short: 'calipers', phase: 3, name: 'Digital calipers', price: 25, approx: true, where: 'Local hardware store', note: 'For measuring the screen, Pi and case.' },
  { id: 'case', short: 'Nanuk case', phase: 3, name: 'NANUK-R 910 hard case', price: 96.95, where: 'nanuk.com', url: 'https://nanuk.com/en-ca/collections/910', note: 'Made in Canada. Interior 336 × 234 × 104 mm. A Pelican 1150 also works.' },
  { id: 'screen', short: '7-inch screen', phase: 3, name: '7-inch HDMI display, 1024 × 600 IPS', price: 85, approx: true, where: 'PiShop.ca or Amazon.ca', url: 'https://www.pishop.ca/product-category/raspberry-pi/raspberry-pi-screens/', note: 'Measure it before designing the bracket.' },
  { id: 'hdmi2', short: 'second HDMI cable', phase: 3, name: 'Second micro-HDMI to HDMI cable', price: 12, approx: true, where: 'PiShop.ca or Amazon.ca', note: 'Runs the 7-inch as a status screen beside the HP monitor.' },
  { id: 'standoffs', short: 'standoffs', phase: 3, name: 'M2.5 brass standoff and screw kit', price: 15, approx: true, where: 'Amazon.ca or PiShop.ca' },
  { id: 'filament', short: 'filament', phase: 3, name: 'PETG filament, 1 kg', price: 30, approx: true, where: 'Makerspace or online', note: 'Ask the makerspace first; some sell by the gram. PETG over PLA because PLA softens near 60 °C.' },
  { id: 'alu', short: 'aluminum sheet', phase: 3, name: 'Aluminum sheet, 1.5 to 2 mm, about 30 × 25 cm', price: 25, approx: true, where: 'Local metal supplier or offcuts', note: '5052 or 6061.' },
  { id: 'sma', short: 'SMA ports', phase: 3, name: 'SMA bulkhead pigtails ×3', price: 15, approx: true, where: 'Amazon.ca', note: 'Antenna ports through the panel.' },
  { id: 'usbpanel', short: 'panel USB', phase: 3, name: 'Panel-mount USB extensions ×2', price: 20, approx: true, where: 'Amazon.ca' },
  { id: 'toggles', short: 'toggles', phase: 3, name: 'Mini toggle switches ×3', price: 10, approx: true, where: 'Amazon.ca or local' },
  { id: 'ups', short: 'UPS board', phase: 4, name: 'Pi 5 UPS board for 18650 cells, 5 V 5 A out', price: 60, approx: true, where: 'Amazon.ca or PiShop.ca', note: 'The Geekworm X1200 is one example. It must supply 5 A.' },
  { id: 'cells', short: '18650 cells', phase: 4, name: '18650 cells ×2, named brand', price: 35, approx: true, where: 'Reputable Canadian battery seller', note: 'Molicel, Samsung, Sony/Murata or LG. Not marketplace no-names.' },
  { id: 'charger', short: 'charger', phase: 4, name: 'Smart Li-ion charger', price: 30, approx: true, where: 'Local or online' },
  { id: 'mesh', short: 'Meshtastic nodes', phase: 5, name: 'Meshtastic nodes ×2 (Heltec V3)', price: 90, approx: true, where: 'Amazon.ca', note: 'One for the deck, one for your pocket.' },
  { id: 'esp32', short: 'ESP32', phase: 5, name: 'ESP32 dev board', price: 15, approx: true, where: 'Amazon.ca or PiShop.ca' },
  { id: 'longwire', short: 'long-wire antenna', phase: 6, name: 'HF long-wire antenna and 9:1 balun', price: 45, approx: true, where: 'Amazon.ca or ham supplier', note: 'For shortwave.' },
  { id: 'ht', short: 'handheld radio', phase: 6, name: '2 m / 70 cm handheld radio', price: 70, approx: true, where: 'Ham supplier', note: 'Only once you hold a call sign.' }
];

/* Codex terms. from = node that teaches it. */
const TERMS = [
  ['sbc', 'SBC', 'Single-board computer. A whole computer on one small board, like the Raspberry Pi.', 'L1'],
  ['rpios', 'Raspberry Pi OS', 'The free Linux version made for the Pi. Debian underneath.', 'L1'],
  ['microsd', 'microSD card', 'The Pi\'s hard drive. Swap cards and you swap the whole system.', 'L1'],
  ['hdmi', 'HDMI', 'The video cable standard TVs use. The Pi 5 has two micro-HDMI ports.', 'L1'],
  ['terminal', 'Terminal', 'A window where you type commands instead of clicking. Also called the shell or command line.', 'L2'],
  ['home', 'Home folder (~)', 'Your own folder, /home/yourname. The ~ symbol is shorthand for it.', 'L2'],
  ['path', 'Path', 'A file\'s address in the folder tree, like /home/marshall/deck/notes.txt.', 'L2'],
  ['editor', 'Text editor', 'A program for editing plain text. nano is the simple one that runs in the terminal.', 'L3'],
  ['sudo', 'sudo', '"Superuser do." Runs one command with administrator rights. Read before you run.', 'L4'],
  ['apt', 'apt', 'The package manager. Installs, updates and removes software from Raspberry Pi\'s servers.', 'L4'],
  ['permissions', 'Permissions', 'Read, write and execute rights on a file, set for the owner, group and everyone.', 'L5'],
  ['script', 'Script', 'A file of commands that runs top to bottom. Bash or Python, usually.', 'L5'],
  ['ssh', 'SSH', 'Secure shell. Drive another computer\'s terminal over the network.', 'L6'],
  ['hostname', 'Hostname', 'A computer\'s name on the network. Yours will be deck, reachable as deck.local.', 'L6'],
  ['python', 'Python', 'A readable programming language, already on the Pi. Good for logging and automation.', 'L7'],
  ['imager', 'Raspberry Pi Imager', 'Free tool that writes a fresh operating system onto a microSD card.', 'L8'],
  ['arduino', 'Arduino', 'A family of small programmable boards for gadgets. Runs one program, no operating system.', 'E1'],
  ['sketch', 'Sketch', 'What Arduino calls a program.', 'E1'],
  ['flashing', 'Flashing', 'Copying a program or firmware onto a board\'s memory.', 'E1'],
  ['breadboard', 'Breadboard', 'A plastic board of linked holes for building circuits without solder.', 'E2'],
  ['led', 'LED', 'Light-emitting diode. Lights up, works one way round, needs a resistor.', 'E2'],
  ['resistor', 'Resistor', 'A part that limits current. Its value in ohms is printed as coloured bands.', 'E2'],
  ['ground', 'Ground (GND)', 'The 0 V reference every circuit returns to.', 'E2'],
  ['voltage', 'Voltage (V)', 'Electrical push, in volts. The Pi and Arduino logic runs on 5 V or 3.3 V.', 'E3'],
  ['current', 'Current (I)', 'Electrical flow, in amps. Too much is what burns parts out.', 'E3'],
  ['ohms', 'Ohm\'s law', 'V = I × R. Voltage equals current times resistance.', 'E3'],
  ['watt', 'Watt (W)', 'Power: volts × amps. How hot things get and how fast batteries drain.', 'E3'],
  ['pullup', 'Pull-up', 'A resistor that holds an input pin HIGH until a switch connects it to ground.', 'E4'],
  ['digital', 'Digital', 'Two states only: HIGH or LOW, on or off.', 'E4'],
  ['analog', 'Analog', 'A range of values. Arduino reads 0 to 5 V as 0 to 1023.', 'E5'],
  ['serial', 'Serial', 'Sending data one bit at a time over a wire, like USB. How boards talk to computers.', 'E5'],
  ['baud', 'Baud rate', 'Serial speed. Both ends must match; 9600 is the common default.', 'E5'],
  ['solder', 'Solder', 'Low-melting metal that joins parts electrically.', 'E7'],
  ['flux', 'Flux', 'Cleans metal as you solder so it flows and bonds. Usually inside the solder wire.', 'E7'],
  ['mah', 'mAh', 'Milliamp-hours: battery capacity at its voltage. 3,000 mAh is 3 A for one hour.', 'E8'],
  ['buck', 'Buck converter', 'A small board that steps voltage down, like battery voltage to 5 V.', 'E8'],
  ['ups', 'UPS board', 'Battery board that powers the Pi and charges at the same time, so unplugging doesn\'t crash it.', 'E8'],
  ['cell18650', '18650 cell', 'A cylindrical lithium-ion cell, 18 mm × 65 mm. Powerful, and a fire risk if abused.', 'E9'],
  ['esp32', 'ESP32', 'An Arduino-style board with Wi-Fi and Bluetooth built in. Runs at 3.3 V.', 'E10'],
  ['makerspace', 'Makerspace', 'A shared workshop with tools you can\'t justify owning. Yours is Creation Nation.', 'C1'],
  ['cad', 'CAD', 'Computer-aided design: drawing parts in 3D on screen.', 'C2'],
  ['stl', 'STL', 'The standard file format for 3D models headed to a printer.', 'C2'],
  ['slicer', 'Slicer', 'Software that turns a 3D model into layer-by-layer printer instructions.', 'C3'],
  ['infill', 'Infill', 'The internal pattern inside a print. More infill, stronger and slower.', 'C3'],
  ['petg', 'PLA and PETG', 'Printer plastics. PLA is easy but softens near 60 °C; PETG handles about 80 °C.', 'C3'],
  ['tolerance', 'Tolerance', 'Allowed size error. Printed fits need 0.2 to 0.5 mm of clearance.', 'C4'],
  ['standoff', 'Standoff', 'A threaded post that holds a board off a surface.', 'C5'],
  ['sma', 'SMA connector', 'Small screw-on antenna connector used on SDRs and LoRa boards. Bulkhead versions mount through a panel.', 'C6'],
  ['strain', 'Strain relief', 'Securing a cable so tugs land on the clamp, not the connector.', 'C8'],
  ['frequency', 'Frequency', 'How many times a radio wave repeats per second, in hertz (Hz, kHz, MHz).', 'R1'],
  ['wavelength', 'Wavelength', 'Length of one wave. Metres = 300 ÷ MHz.', 'R1'],
  ['band', 'Band', 'A range of frequencies: HF 3 to 30 MHz, VHF 30 to 300, UHF 300 to 3,000.', 'R1'],
  ['amfm', 'AM and FM', 'Two ways to put sound on a wave: vary its strength (AM) or its frequency (FM).', 'R1'],
  ['sdr', 'SDR', 'Software-defined radio. Software does the tuning and decoding a radio\'s circuits used to.', 'R2'],
  ['rtlsdr', 'RTL-SDR', 'Cheap USB SDR dongle family. Yours is the RTL-SDR Blog V4.', 'R2'],
  ['waterfall', 'Waterfall', 'A scrolling display of signal strength across frequencies. Signals show as bright streaks.', 'R2'],
  ['dipole', 'Dipole', 'Antenna with two equal arms. Each arm is a quarter wavelength: 75 ÷ MHz metres.', 'R3'],
  ['adsb', 'ADS-B', 'Aircraft broadcasts of position, altitude and callsign on 1090 MHz.', 'R3'],
  ['repeater', 'Repeater', 'A hilltop or tower station that rebroadcasts ham signals to extend their range.', 'R4'],
  ['lora', 'LoRa', 'Long-range, low-power radio method for small, slow messages.', 'R5'],
  ['meshtastic', 'Meshtastic', 'Free firmware that turns LoRa boards into an off-grid text-messaging mesh.', 'R5'],
  ['hf', 'HF / shortwave', '3 to 30 MHz. Bounces off the ionosphere and travels thousands of kilometres.', 'R6'],
  ['balun', 'Balun', 'A transformer that matches a wire antenna to the radio. 9:1 for a long wire.', 'R6'],
  ['callsign', 'Call sign', 'Your licensed station ID. Manitoba prefixes are VE4 and VA4.', 'R7'],
  ['basicqual', 'Basic Qualification', 'ISED\'s entry ham certificate. 70% passes; 80% adds HF (Basic with Honours).', 'R7']
].map(([id, t, d, from]) => ({ id, t, d, from }));

const COMMANDS = [
  ['Moving around', [
    ['pwd', 'Print the folder you\'re in', 'L2'],
    ['ls', 'List files here', 'L2'],
    ['ls -l', 'List with permissions, sizes and dates', 'L5'],
    ['cd name', 'Move into a folder', 'L2'],
    ['cd ..', 'Move up one folder', 'L2'],
    ['cd ~', 'Go to your home folder', 'L2'],
    ['mkdir -p a/b', 'Make folders, parents included', 'L2']
  ]],
  ['Files', [
    ['nano file', 'Edit a file (Ctrl+O save, Ctrl+X quit)', 'L3'],
    ['cat file', 'Print a file', 'L3'],
    ['cp a b', 'Copy a to b', 'L3'],
    ['cp -r folder dest', 'Copy a whole folder', 'L8'],
    ['mv a b', 'Move or rename', 'L3'],
    ['rm file', 'Delete for good, no trash', 'L3'],
    ['touch file', 'Make an empty file', 'L3']
  ]],
  ['System', [
    ['sudo apt update', 'Refresh the package list', 'L4'],
    ['sudo apt full-upgrade', 'Install all updates', 'L4'],
    ['sudo apt install name', 'Install a program', 'L4'],
    ['htop', 'Live CPU and memory monitor (q quits)', 'L4'],
    ['df -h', 'Free space on the card', 'L4'],
    ['free -h', 'Memory in use', 'L4'],
    ['vcgencmd measure_temp', 'Chip temperature', 'L7'],
    ['watch -n 5 command', 'Rerun a command every 5 seconds', 'L10'],
    ['tail -f file', 'Follow a file as new lines arrive (Ctrl+C stops)', 'L10'],
    ['sudo reboot', 'Restart', 'L4'],
    ['sudo shutdown -h now', 'Shut down cleanly', 'L4']
  ]],
  ['Hardware', [
    ['lsusb', 'List connected USB devices', 'R2'],
    ['ls /dev/tty*', 'Find serial ports, like an Arduino', 'E6'],
    ['dmesg | tail', 'Last system messages; useful right after plugging something in', 'R2'],
    ['rtl_test', 'Check the SDR is detected (Ctrl+C stops)', 'R2']
  ]],
  ['Remote and scripts', [
    ['ssh you@deck.local', 'Log in to the deck from another computer', 'L6'],
    ['hostname -I', 'Show the deck\'s IP address', 'L6'],
    ['exit', 'Leave an SSH session', 'L6'],
    ['chmod +x file', 'Make a script runnable', 'L5'],
    ['./script.sh', 'Run a script in this folder', 'L5'],
    ['python3 file.py', 'Run a Python file', 'L7']
  ]],
  ['Keys', [
    ['Tab', 'Finish a file or command name', 'L2'],
    ['Up arrow', 'Bring back an earlier command', 'L2'],
    ['Ctrl+C', 'Stop whatever is running', 'L4'],
    ['clear', 'Clear the screen', 'L2']
  ]]
];

const SAFETY = [
  ['Phase 1 and the Arduino kit', 'Nothing here can hurt you. Both run on 5 V USB power; the worst outcome of a wiring mistake is a dead $10 board.'],
  ['Static', 'Touch something grounded before handling bare boards, and hold them by the edges. A carpet shuffle in a dry Manitoba winter is enough to kill a chip.'],
  ['Power supplies', 'Use the kit\'s 27 W supply, not a phone charger. A weak supply corrupts the SD card and starves USB ports. Shut down before pulling the card.'],
  ['Shorts', 'Never set a running board on anything metal. A scrap of plywood or the kit box is a fine bench.'],
  ['Soldering', 'The iron sits at 300 °C or more. Use a stand, ventilate, keep fluids away, and wash your hands after leaded solder.'],
  ['Aluminum work', 'Eye protection, clamp the sheet, and deburr every edge. Cut aluminum leaves razor slivers.'],
  ['18650 batteries', 'The one real hazard. Named-brand cells from a reputable Canadian seller only; no torn wraps; a protected board; never solder to a cell; first charge where you can watch it; warm is fine, hot means unplug. Store and carry away from the forge.'],
  ['In the shop', 'Scale and grinder dust conduct electricity. The deck lives in the shop only once the case is sealed and the Pi sits behind a filtered vent.'],
  ['Radio', 'Listening is legal. Transmitting on ham bands needs your certificate. Always attach an antenna before powering a LoRa board.'],
  ['Antennas outdoors', 'Keep every wire well clear of power lines, and take outdoor antennas down or disconnect them before a thunderstorm.']
];
