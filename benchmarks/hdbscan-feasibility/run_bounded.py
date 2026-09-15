"""Run one feasibility worker with elapsed-time and sampled whole-process RSS limits."""

import argparse
import json
import math
import os
import platform
import subprocess
import tempfile
import time


def sample_rss(pid, timeout):
    # ps includes the worker's in-process DuckDB native allocations. A failed
    # sample is never zero RSS: the caller stops if the worker is still alive.
    value = subprocess.check_output(
        ["ps", "-o", "rss=", "-p", str(pid)], text=True, timeout=timeout
    ).strip()
    rss = int(value) * 1024
    if rss <= 0:
        raise ValueError(f"Invalid RSS sample: {value!r}")
    return rss


def run_bounded(command, timeout_seconds=600, max_rss_bytes=8 * 1024**3):
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0 or max_rss_bytes <= 0:
        raise ValueError("Time and RSS limits must be positive and finite.")
    started = time.monotonic()
    peak_rss = 0
    samples = 0
    measurement_error = None
    status = "completed"
    # Files avoid pipe backpressure deadlocking a verbose worker while polling.
    with tempfile.TemporaryFile(mode="w+t") as stdout_file, tempfile.TemporaryFile(mode="w+t") as stderr_file:
        process = subprocess.Popen(command, stdout=stdout_file, stderr=stderr_file, text=True)
        try:
            while process.poll() is None:
                remaining = timeout_seconds - (time.monotonic() - started)
                if remaining <= 0:
                    status = "time-limited"
                    break
                try:
                    peak_rss = max(peak_rss, sample_rss(process.pid, min(2, remaining)))
                    samples += 1
                except (OSError, subprocess.SubprocessError, ValueError) as error:
                    # Exiting between poll and ps is normal. A live process with
                    # an unreadable RSS must not continue without its memory cap.
                    if process.poll() is None:
                        status = "measurement-failed"
                        measurement_error = f"{type(error).__name__}: {error}"
                    break
                if peak_rss >= max_rss_bytes:
                    status = "memory-limited"
                    break
                remaining = timeout_seconds - (time.monotonic() - started)
                if remaining <= 0:
                    status = "time-limited"
                    break
                time.sleep(min(0.25, remaining))
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        stdout_file.seek(0)
        stderr_file.seek(0)
        stdout, stderr = stdout_file.read(), stderr_file.read()
    elapsed = time.monotonic() - started
    if status == "completed" and process.returncode != 0:
        status = "failed"
    if samples == 0 and status == "completed":
        status = "measurement-failed"
        measurement_error = "Worker exited before any valid RSS sample."
    return {
        "status": status,
        "elapsedSeconds": elapsed,
        "peakRssBytes": peak_rss if samples else None,
        "rssSamples": samples,
        "rssSamplingIntervalSeconds": 0.25,
        "measurementError": measurement_error,
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
            "timeoutSeconds": timeout_seconds,
            "maxRssBytes": max_rss_bytes,
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout-seconds", type=float, default=600)
    parser.add_argument("--max-rss-bytes", type=int, default=8 * 1024**3)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("a worker command is required after --")
    result = run_bounded(command, args.timeout_seconds, args.max_rss_bytes)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["status"] == "completed" else 1)
