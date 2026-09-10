import pathlib,shutil,pytest
src=pathlib.Path(__file__).resolve().parents[2] / 'services/backend/tests/ai'
dst=pathlib.Path('/tmp/cwm-audit/ai-tests');dst.mkdir(exist_ok=True)
for name in ['test_files.py','test_figures.py','test_sandbox.py']:
 shutil.copy2(src/name,dst/name)
raise SystemExit(pytest.main([str(dst),'-q','--confcutdir='+str(dst),'-p','no:cacheprovider','-k','not test_run_matplotlib']))
