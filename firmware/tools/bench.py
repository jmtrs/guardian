"""Drive the ESP32-S3 power bench: send "secs=line" steps, log and print.

Usage: bench.py PORT LOGFILE ["[secs=]line" ...]

The S3's native USB (USB-Serial-JTAG) reboots into DOWNLOAD mode if it sees
DTR/RTS asserted on open, so both are released before opening. Lines go to
the device under test through the bench bridge; lines starting with '~' are
bench commands ('~reset' restarts the charge count).
"""
import sys, time, serial

port, out, steps = sys.argv[1], sys.argv[2], sys.argv[3:]
s = serial.Serial()
s.port, s.timeout, s.dtr, s.rts = port, 0.1, False, False
s.open()
with open(out, "ab") as f:
    def pump(secs):
        end = time.time() + secs
        while time.time() < end:
            data = s.read(4096)
            if data:
                f.write(data); f.flush()
                sys.stdout.write(data.decode(errors="replace")); sys.stdout.flush()
    for step in steps:
        secs, _, line = step.partition("=")
        if line:
            s.write(line.encode() + b"\n")
        pump(float(secs))
