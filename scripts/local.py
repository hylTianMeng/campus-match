"""Manage the macOS local preview and run the project's test suites."""

import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / '.run'
PYTHON = ROOT / 'backend/.venv/bin/python'
NODE = RUN / 'bin/node'
NPM = RUN / 'bin/npm'
ENV = {**os.environ, 'PATH': str(RUN / 'bin') + os.pathsep + os.environ.get('PATH', '')}
SERVICES = {
    'backend': {
        'command': [str(PYTHON), '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
        'cwd': ROOT / 'backend',
        'url': 'http://127.0.0.1:8000/api/health',
    },
    'frontend': {
        'command': [str(NODE), str(ROOT / 'frontend/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
        'cwd': ROOT / 'frontend',
        'url': 'http://127.0.0.1:5173/',
    },
}


def run(command, cwd):
    subprocess.run(command, cwd=cwd, env=ENV, check=True)


def owned_pid(name):
    path = RUN / (name + '.pid')
    if not path.exists():
        return None
    pid = int(path.read_text().strip())
    result = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True)
    expected = SERVICES[name]['command']
    # Check the executable and service arguments before acting on a saved PID.
    if result.returncode == 0 and all(part in result.stdout for part in expected[:3]):
        return pid
    path.unlink(missing_ok=True)
    return None


def ready(url):
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url, timeout=2) as response:
            return response.status == 200
    except (urllib.error.URLError, OSError):
        return False


def start():
    RUN.mkdir(exist_ok=True)
    (RUN / 'logs').mkdir(exist_ok=True)
    if not owned_pid('frontend'):
        run([str(NPM), 'run', 'build'], ROOT / 'frontend')
    started = []
    try:
        for name, config in SERVICES.items():
            if owned_pid(name):
                if not ready(config['url']):
                    raise RuntimeError(f'{name} 进程存在但健康检查失败，请检查 .run/logs/{name}.log')
                print(f'{name} 已运行 {config["url"]}')
                continue
            if ready(config['url']):
                raise RuntimeError(f'{config["url"]} 已被其他服务占用')
            with (RUN / 'logs' / (name + '.log')).open('ab') as log:
                process = subprocess.Popen(config['command'], cwd=config['cwd'], env=ENV,
                                           stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                           start_new_session=True)
            (RUN / (name + '.pid')).write_text(str(process.pid))
            started.append(name)
            for _ in range(60):
                if process.poll() is not None:
                    raise RuntimeError(f'{name} 启动失败，请检查 .run/logs/{name}.log')
                if ready(config['url']):
                    print(f'{name} 已启动 {config["url"]}')
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError(f'{name} 启动超时')
    except Exception:
        for name in reversed(started):
            stop_service(name)
        raise


def stop_service(name):
    pid = owned_pid(name)
    if pid:
        os.killpg(pid, signal.SIGTERM)
        for _ in range(50):
            if not owned_pid(name):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError(f'{name} 尚未停止，请检查日志与进程 {pid}')
        print(f'{name} 已停止')
    (RUN / (name + '.pid')).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'stop', 'status', 'test'])
    args = parser.parse_args()
    if args.action == 'start':
        start()
    elif args.action == 'stop':
        for name in reversed(SERVICES):
            stop_service(name)
    elif args.action == 'status':
        for name, config in SERVICES.items():
            print(json.dumps({'service': name, 'pid': owned_pid(name), 'healthy': ready(config['url']), 'url': config['url']}, ensure_ascii=False))
    else:
        run([str(PYTHON), '-m', 'pytest', '-q'], ROOT / 'backend')
        run([str(NPM), 'run', 'build'], ROOT / 'frontend')
        run([str(NPM), 'run', 'test:e2e'], ROOT / 'frontend')


if __name__ == '__main__':
    main()
