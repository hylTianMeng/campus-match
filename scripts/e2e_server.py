"""Run API against a disposable database; never touch the developer's data."""

import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

backend = Path(__file__).resolve().parents[1] / "backend"
with tempfile.TemporaryDirectory(prefix="campuscrew-e2e-") as temp:
    env = {
        **os.environ,
        "DATABASE_PATH": str(Path(temp) / "test.sqlite3"),
        "SEED_PASSWORD": "CampusCrew-Dev-2026",
        "ALLOWED_ORIGINS": "http://127.0.0.1:5174",
    }
    subprocess.run([sys.executable, "-m", "app.seed"], cwd=backend, env=env, check=True)
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8001",
        ],
        cwd=backend,
        env=env,
    )

    def stop(*_):
        process.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        process.wait()
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
