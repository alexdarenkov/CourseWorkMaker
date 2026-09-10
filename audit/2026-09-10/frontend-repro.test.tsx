import { act, renderHook } from '../../frontend/node_modules/@testing-library/react/dist/index.js'
import { useDocPersistence } from '../../frontend/src/hooks/useDocPersistence'
import { useAiJob } from '../../frontend/src/hooks/useAiJob'
import { addRawAsset, getAsset } from '../../frontend/src/lib/assets'
import { DEFAULT_SETTINGS } from '../../frontend/src/lib/settings'
import { savePersisted, loadPersisted } from '../../frontend/src/lib/storage'
vi.mock('../../frontend/src/api/index.ts',()=>({aiApi:{job:vi.fn(),cancel:vi.fn()}}))
import {aiApi} from '../../frontend/src/api'
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
test('REPRO: ошибка квоты сопровождается сообщением об успешном сохранении',()=>{
 savePersisted({md:'old',s:DEFAULT_SETTINGS})
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new DOMException('quota','QuotaExceededError')})
 const showToast=vi.fn()
 const {result}=renderHook(()=>useDocPersistence({stateRef:{current:{md:'new',settings:DEFAULT_SETTINGS}},showToast}))
 act(()=>result.current.manualSave())
 expect(showToast).toHaveBeenCalledWith('Документ сохранён')
 expect(loadPersisted().md).toBe('old')
})
test('REPRO: удаление ссылки и сохранение уничтожают изображение для Undo',()=>{
 const key=addRawAsset('data:image/png;base64,YQ==')
 const stateRef={current:{md:`![x](${key})`,settings:DEFAULT_SETTINGS}}
 const {result}=renderHook(()=>useDocPersistence({stateRef,showToast:vi.fn()}))
 stateRef.current.md='';act(()=>result.current.persistNow())
 stateRef.current.md=`![x](${key})` // Undo текста после автосохранения
 expect(getAsset(key)).toBeNull()
})
function setupAi(){
 const deps={userTouched:{current:false},taRef:{current:null},setMd:vi.fn(),onMdChange:vi.fn(),schedulePaginate:vi.fn(),showToast:vi.fn()}
 const hook=renderHook(()=>useAiJob(deps))
 return {deps,hook}
}
const running={id:'j1',status:'running',stage:'test',progress:.5,markdown:null,error:null}
test('REPRO: старый ответ running перезаписывает уже полученный done',async()=>{
 vi.useFakeTimers();vi.mocked(aiApi.job).mockReset()
 const {deps,hook}=setupAi();let resolveOld:any
 vi.mocked(aiApi.job).mockImplementationOnce(()=>new Promise(r=>{resolveOld=r})).mockResolvedValueOnce({...running,status:'done',markdown:'FINAL'} as any)
 act(()=>hook.result.current.trackAiJob('j1','ok','generate'))
 await act(()=>vi.advanceTimersByTimeAsync(1400))
 expect(deps.onMdChange).toHaveBeenCalledWith('FINAL')
 await act(async()=>resolveOld({...running,partial:'OLD'}))
 expect(deps.setMd).toHaveBeenLastCalledWith('OLD')
 expect(hook.result.current.aiActive).toBe(true)
 expect(vi.getTimerCount()).toBe(0)
})
test('REPRO: постоянный 404 оставляет задачу активной и продолжает запросы',async()=>{
 vi.useFakeTimers();vi.mocked(aiApi.job).mockReset().mockRejectedValue(Object.assign(new Error('not found'),{status:404}))
 const {hook}=setupAi();act(()=>hook.result.current.trackAiJob('missing','ok','generate'))
 await act(()=>vi.advanceTimersByTimeAsync(7000))
 expect(aiApi.job).toHaveBeenCalledTimes(10)
 expect(hook.result.current.aiActive).toBe(true)
})
test('REPRO: partial при ошибке ИИ не передаётся в путь сохранения',async()=>{
 vi.useFakeTimers();vi.mocked(aiApi.job).mockReset().mockResolvedValueOnce({...running,partial:'draft'} as any).mockResolvedValueOnce({...running,status:'error',partial:'draft',error:'test'} as any)
 const {deps,hook}=setupAi();act(()=>hook.result.current.trackAiJob('j1','ok','generate'))
 await act(()=>vi.advanceTimersByTimeAsync(1400))
 expect(deps.setMd).toHaveBeenCalledWith('draft')
 expect(deps.onMdChange).not.toHaveBeenCalled()
})
import {parseMD,inline} from '../../frontend/src/lib/markdown'
test('REPRO: preview сохраняет пустые крайние столбцы и формулу внутри bold',()=>{
 const table=parseMD('||B||\n|---|---|---|\n|1|2|3|')[0]
 expect(table.type).toBe('table')
 expect((table as any).rows[0]).toEqual(['','B',''])
 expect(inline('**$x^2$**')).toContain('katex')
})
