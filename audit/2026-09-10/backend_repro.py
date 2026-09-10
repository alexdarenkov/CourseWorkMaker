import io, base64, pathlib
import httpx
from unittest.mock import patch
from app.ai.matplotlib_exec import _check_ast
from app.convert import images
from app.ai import web_images
from app.convert.gost import build_docx
from app.convert.models import GostSettings
from PIL import Image
from docx import Document
# Безопасный маркер только в каталоге аудита: никаких пользовательских файлов.
p=pathlib.Path('/tmp/cwm-audit/ast-marker.txt')
p.parent.mkdir(parents=True, exist_ok=True)
code=f"import io\nio.open({str(p)!r}, 'w').write('audit marker')"
print('AST accepts filesystem access:', _check_ast(code) is None)
if _check_ast(code) is None:
 exec(code)
 print('Controlled marker written:',p.read_text()=='audit marker')
# Настоящая обработка редиректов httpx, все ответы в памяти, сети нет.
OriginalClient=httpx.Client
for mod,func in [(images,images._fetch_url),(web_images,web_images.fetch_image_data_url)]:
 visited=[];checked=[]
 def handler(req):
  visited.append(str(req.url))
  if req.url.host=='public.example':
   return httpx.Response(302,headers={'location':'http://127.0.0.1/internal'})
  return httpx.Response(200,headers={'content-type':'image/png'},content=b'\x89PNG\r\n\x1a\naudit')
 def client(**kw):return OriginalClient(transport=httpx.MockTransport(handler),**kw)
 def check(host):checked.append(host);return False
 with patch.object(mod,'_is_private_host',check),patch.object(mod.httpx,'Client',client):
  result=func('https://public.example/image')
 print(mod.__name__,{'checked':checked,'visited':visited,'accepted':result is not None})
# Реальный DOCX c изображением 300x300 px / 300 dpi.
buf=io.BytesIO();Image.new('RGB',(300,300),'white').save(buf,format='PNG',dpi=(300,300))
data=base64.b64encode(buf.getvalue()).decode()
doc=Document(io.BytesIO(build_docx('![test](asset:test)',GostSettings(title_page=False,toc=False),{'asset:test':data})))
print('Image width mm:',{'docx':round(doc.inline_shapes[0].width.mm,2),'preview_formula':300/96*25.4})
print('Repro dependencies:', {n:__import__(n).__version__ for n in ['httpx','pydantic','docx']})
from app.convert.md_parser import parse_markdown,parse_inline
print('Backend empty edge table columns:',parse_markdown('||B||\n|---|---|---|\n|1|2|3|')[0].rows)
print('Backend bold formula:',parse_inline('**$x^2$**'))
# Лимит размера проверяется ПОСЛЕ полного чтения ответа.
for mod,func in [(images,images._fetch_url),(web_images,web_images.fetch_image_data_url)]:
 count=[0]
 class Stream(httpx.SyncByteStream):
  def __iter__(self):
   for _ in range(4):count[0]+=4;yield b'1234'
 def handler(req):return httpx.Response(200,headers={'content-type':'image/png'},stream=Stream())
 def client(**kw):return OriginalClient(transport=httpx.MockTransport(handler),**kw)
 with patch.object(mod,'_is_private_host',lambda _:False),patch.object(mod.httpx,'Client',client),patch.object(mod,'MAX_IMAGE_BYTES',8):
  result=func('https://public.example/image')
 print(mod.__name__,'limit=8, bytes consumed=',count[0],'rejected=',result is None)
