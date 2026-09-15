"""Small watchdog tests; no benchmark or DuckDB workload is launched."""

import subprocess
import sys
import unittest
from unittest.mock import patch

from run_bounded import run_bounded


class WatchdogTests(unittest.TestCase):
    command = [sys.executable, "-c", "import time; time.sleep(60)"]

    def test_sampling_failure_stops_live_worker(self):
        for error in [FileNotFoundError("ps"), ValueError("bad RSS"),
                      subprocess.TimeoutExpired("ps", 1)]:
            with self.subTest(error=error), patch("run_bounded.sample_rss", side_effect=error):
                result = run_bounded(self.command, timeout_seconds=5)
            self.assertEqual(result["status"], "measurement-failed")
            self.assertIsNone(result["peakRssBytes"])
            self.assertIsNotNone(result["measurementError"])
            self.assertNotEqual(result["exitCode"], 0)
            self.assertLess(result["elapsedSeconds"], 5)

    def test_memory_stop(self):
        with patch("run_bounded.sample_rss", return_value=1024):
            result = run_bounded(self.command, max_rss_bytes=512)
        self.assertEqual(result["status"], "memory-limited")
        self.assertEqual(result["peakRssBytes"], 1024)

    def test_time_stop(self):
        with patch("run_bounded.sample_rss", return_value=1024):
            result = run_bounded(self.command, timeout_seconds=0.05)
        self.assertEqual(result["status"], "time-limited")
        self.assertLess(result["elapsedSeconds"], 1)

    def test_completed_worker(self):
        result = run_bounded([sys.executable, "-c", "import time; time.sleep(.1); print('done')"])
        self.assertEqual(result["status"], "completed")
        self.assertGreater(result["rssSamples"], 0)
        self.assertEqual(result["stdout"], "done")


if __name__ == "__main__":
    unittest.main()
