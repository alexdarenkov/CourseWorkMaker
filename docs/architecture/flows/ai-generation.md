# Поток: ИИ-генерация отчёта

Самый насыщенный сценарий системы: асинхронный job, стриминг через поллинг,
отмена. Поведение — спека `ai-agent.md` (AI-1..AI-11); здесь — как части
взаимодействуют во времени. Это же — главная зона гонок (см. внизу).

```mermaid
sequenceDiagram
  actor U as Пользователь
  participant AC as AiConsole
  participant EP as EditorPage
  participant G as gateway
  participant M as ai-service main.py
  participant J as jobs.py (фон)
  participant LLM as Polza.ai

  U->>AC: промпт + Enter
  AC->>AC: validatePrompt: локальные регэкспы (AI-9)
  AC->>M: POST /analyze-prompt (через gateway)
  M->>LLM: fast-модель, t=0, строгий JSON
  LLM-->>M: вердикт + извлечённые параметры
  M-->>AC: {ok, тема, target_pages, include_*}
  Note over AC: fail-open: сбой → пропускаем.<br/>Тогглы ⚙ подстраиваются, тост
  AC->>G: POST /api/ai/generate (options + files[])
  G->>M: JWT ok → /generate
  M->>J: создать job → {jobId}
  J-->>AC: jobId

  par Фоновая генерация (J)
    J->>LLM: план (строгий JSON) → normalize_outline
    loop каждый раздел плана
      J->>LLM: _write_section через llm.astream
      LLM--)J: чанки → on_chunk (троттлинг 0,4 с)
      J->>J: job.partial = готовые разделы + черновик
    end
    J->>LLM: самопроверка «нормоконтролёром» (t=0)
    J->>J: линт структуры + исправляющий вызов (AI-8)
    J->>J: matplotlib-скрипты → песочница (SEC-5) → asset:fig-N
    J->>J: job.status = done, result = md + assets
  and Поллинг (EP, каждые 700 мс)
    loop пока job жив
      EP->>M: GET /jobs/{id}
      M-->>EP: {status, progress, partial}
      EP->>EP: partial → прямо в редактор, автоскролл
    end
  end

  alt Успех
    EP->>EP: итоговый md в редактор, ассеты в хранилище
  else Отмена
    U->>M: POST /jobs/{id}/cancel
    EP->>EP: уже написанные разделы (partial) ОСТАЮТСЯ в редакторе
  end
```

## Правка (режим «Правка» в консоли)

Короче генерации: локальная `validatePrompt` → `POST /edit` → job →
результат применяется в редактор СРАЗУ (AI-6, без diff-просмотра и без
истории откатов). Дальше пользователь правит текст руками.

## Зоны гонок (для аудита)

Это места, где проще всего сломать поведение; при изменениях проверять руками:

1. **Пользователь печатает во время стриминга** — partial перезаписывает
   редактор каждые 700 мс.
2. **Переключение/создание документа во время генерации** — job продолжает
   жить и пишет partial уже в НОВЫЙ документ.
3. **Отмена в момент прихода чанка** — partial фиксируется в редакторе
   (`onMdChange`), поллинг останавливается.
4. **Два окна/вкладки** — job один, поллят оба, редакторы разные.
