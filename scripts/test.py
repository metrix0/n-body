import json
import math
import os
import random
import struct
import subprocess
from pathlib import Path

def dataset(n, seed=42, coincident=False):
    rng = random.Random(seed)
    values = []
    for _ in range(n):
        values.extend([0.0] * 6 if coincident else [rng.uniform(-1, 1) for _ in range(6)])
    return struct.pack("<i", n) + struct.pack("<" + "f" * len(values), *values)

def run(exe, data, *args):
    return subprocess.run([str(Path("build") / exe), *args], input=data, capture_output=True, timeout=120)

def check():
    cases = 0
    for n in (1, 2, 3, 17, 63, 128):
        for same in (False, True):
            data = dataset(n, coincident=same)
            original = run("original", data)
            seq = run("sequential", data)
            assert original.returncode == seq.returncode == 0, (original.stderr, seq.stderr)
            assert original.stdout == seq.stdout, ("reference mismatch", n)
            for p in (1, 2, 4, 8):
                result = run("parallel", data, "--threads", str(p))
                assert result.returncode == 0, result.stderr
                assert result.stdout == seq.stdout, ("parallel mismatch", n, p)
                assert len(result.stdout) == n * 24
                assert all(math.isfinite(x) for x in struct.unpack("<" + "f" * (6*n), result.stdout))
                info = json.loads(result.stderr)
                assert info["threads"] == p and info["seconds"] > 0
                cases += 1
    for steps in (1, 3, 25):
        data = dataset(31, seed=steps)
        seq = run("sequential", data, "--steps", str(steps))
        par = run("parallel", data, "--steps", str(steps), "--threads", "4")
        assert seq.returncode == par.returncode == 0 and seq.stdout == par.stdout
        cases += 1
    invalid = (b"", struct.pack("<i", -1), struct.pack("<i", 0),
               struct.pack("<i", 1000001), dataset(3)[:-1], dataset(3) + b"x",
               struct.pack("<i6f", 1, math.nan, 0, 0, 0, 0, 0))
    for exe in ("sequential", "parallel"):
        for data in invalid:
            assert run(exe, data).returncode != 0, exe
            cases += 1
        for args in (("--steps", "0"), ("--steps", "-1"), ("--steps", "2x"), ("--oops", "3"), ("--steps",)):
            assert run(exe, dataset(1), *args).returncode != 0
            cases += 1
    report = {"passed": cases, "reference": "byte-for-byte", "threads": [1, 2, 4, 8]}
    Path("results").mkdir(exist_ok=True)
    Path("results/validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))

if __name__ == "__main__":
    check()
