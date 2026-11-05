"""Power-bench daemon: keep the S3 port open for SECS, log everything to
LOGFILE, and send every line appended to CMDFILE (e.g. `echo '!sleep' >> cmd`).

Usage: benchd.py PORT LOGFILE CMDFILE SECS

Lets a long measurement run in the background while commands are issued at
the right moment (a tap, an unplug). Opens with DTR/RTS released, as bench.py.
"""
import serial, sys, time

port, out, cmdfile, secs = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
open(cmdfile, "w").close()
s = serial.Serial()
s.port, s.timeout, s.dtr, s.rts = port, 0.1, False, False
s.open()
sent = 0
end = time.time() + secs
with open(out, "ab") as f:
    while time.time() < end:
        data = s.read(4096)
        if data:
            f.write(data); f.flush()
        with open(cmdfile, "rb") as c:
            c.seek(sent)
            new = c.read()
        if new.endswith(b"\n"):
            s.write(new)
            sent += len(new)
            f.write(b">> " + new); f.flush()
