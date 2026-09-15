"""Run one feasibility worker with elapsed-time and whole-process RSS limits."""

import argparse
import json
import os
import platform
import subprocess
import time


parser = argparse.ArgumentParser()
parser.add_argument("--timeout-seconds", type=float, default=600)
parser.add_argument("--max-rss-bytes", type=int, default=8 * 1024**3)
parser.add_argument("command", nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ["--"] else args.command
if not command:
    parser.error("a worker command is required after --")

started = time.monotonic()
process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
peak_rss = 0
status = "completed"
while process.poll() is None:
    elapsed = time.monotonic() - started
    try:
        rss = int(
            subprocess.check_output(
                ["ps", "-o", "rss=", "-p", str(process.pid)], text=True
            ).strip()
            or "0"
        ) * 1024
        peak_rss = max(peak_rss, rss)
    except (subprocess.CalledProcessError, ValueError):
        pass
    if peak_rss >= args.max_rss_bytes:
        status = "memory-limited"
        process.terminate()
        break
    if elapsed >= args.timeout_seconds:
        status = "time-limited"
        process.terminate()
        break
    time.sleep(0.25)

try:
    stdout, stderr = process.communicate(timeout=10)
except subprocess.TimeoutExpired:
    process.kill()
    stdout, stderr = process.communicate()
elapsed = time.monotonic() - started
if status == "completed" and process.returncode != 0:
    status = "failed"
result = {
    "status": status,
    "elapsedSeconds": elapsed,
    "peakRssBytes": peak_rss,
    "exitCode": process.returncode,
    "command": command,
    "stdout": stdout.strip(),
    "stderr": stderr.strip(),
    "host": {
        "platform": platform.platform(),
        "machine": platform.machine(),
        "logicalCpuCount": os.cpu_count(),
    },
    "limits": {
        "timeoutSeconds": args.timeout_seconds,
        "maxRssBytes": args.max_rss_bytes,
    },
}
print(json.dumps(result, indent=2))
