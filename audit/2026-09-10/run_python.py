import sys, pathlib, runpy
cache = pathlib.Path.home() / '.cache/uv/archive-v0'
sys.path.extend(str(p) for p in cache.iterdir() if p.is_dir())
sys.path.append(str(pathlib.Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages'))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'services/backend'))
target=sys.argv.pop(1)
runpy.run_path(target, run_name='__main__')
