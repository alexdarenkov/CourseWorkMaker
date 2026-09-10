import pathlib,shutil,pytest
src=pathlib.Path(__file__).resolve().parents[2] / 'services/backend/tests/convert'
dst=pathlib.Path('/tmp/cwm-audit/convert-tests')
shutil.copytree(src,dst,dirs_exist_ok=True)
raise SystemExit(pytest.main([str(dst),'-q','--confcutdir='+str(dst),'-p','no:cacheprovider']))
