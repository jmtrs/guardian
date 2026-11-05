"""Drive the Guardian bring-up console: send commands, print output.

Usage: console.py [--reset] PORT ["[secs=]cmd" ...]

Opening the port does NOT reset the board: DTR/RTS are left as the OS asserts
them on open (both high), which the auto-reset circuit ignores. Lowering them
one at a time (pyserial updates DTR, then RTS) passes through RTS=1/DTR=0,
which pulls EN low and reboots the ESP32 (and drops the modem rail).

--reset pulses EN on purpose: DTR low with RTS held high, then back.
"""
import sys, time, serial

args = sys.argv[1:]
reset = "--reset" in args
args = [a for a in args if a != "--reset"]
port, cmds = args[0], args[1:]
s = serial.Serial()
s.port, s.baudrate, s.timeout = port, 115200, 0.1
s.open()  # lines untouched: no reset
if reset:
    s.dtr = False; time.sleep(0.1); s.dtr = True

def pump(seconds):
    end = time.time() + seconds
    while time.time() < end:
        data = s.read(4096)
        if data:
            sys.stdout.write(data.decode("utf-8", "replace")); sys.stdout.flush()

pump(4 if reset else 0.5)
for c in cmds:
    wait = 3.0
    if "=" in c and c.split("=")[0].isdigit():
        wait, c = float(c.split("=")[0]), c.split("=", 1)[1]
    s.write((c + "\r").encode()); pump(wait)
s.close()
