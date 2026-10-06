# Как проверять конвертер

Проверки пишем по принятым правилам, а не по случайному выводу текущего кода.

## Для каждого правила

1. Небольшой Markdown-пример и настройки.
2. Ожидаемый текст, номер, стиль или расположение.
3. Обычный случай и граница: пустой текст, длинный блок, выключенная настройка.
4. Проверка DOCX и превью, если правило общее.

Например: при `autoNumber=false` таблица с подписью «Результаты» должна иметь
подпись «Результаты», без номера. Проверяем обе стороны одним и тем же примером.

## Где тесты

- Чтение Markdown: `frontend/tests/lib/markdown.test.ts`,
  `services/backend/tests/convert/test_converter.py`.
- Оформление: `frontend/tests/lib/gostRender.test.ts`,
  `services/backend/tests/convert/test_gost_layout.py`.
- Согласованные изменения оформления: `frontend/tests/lib/formattingUpdates.test.ts`,
  `frontend/tests/lib/mathWrap.test.ts`,
  `services/backend/tests/convert/test_formatting_updates.py`.
- Формулы, изображения и сохранность: `services/backend/tests/convert/test_mvp_regressions.py`,
  `frontend/tests/lib/imageParity.test.ts`.
- Разбиение текста: `frontend/tests/lib/splitHtml.test.ts`.
- UI: `frontend/tests/components/`, `frontend/tests/pages/`.
- Сохранность черновика при смене темы: `frontend/tests/components/AppHeader.test.tsx`.
- Production HTTP, заголовки, обработка ошибок и экспорт: `scripts/release_smoke.py`.
- Доступность общих компонентов: `frontend/tests/components/uiAccessibility.test.tsx`; визуальный каталог `/ui-test.html` на dev-сервере.
- API и ограничения: `services/backend/tests/test_mvp_api.py`, `test_limits.py` в той же папке.

Эти файлы существуют, но их наличие не означает полного покрытия новых правил.
Добавляя проверку, указываем в PR раздел спеки и имя теста. Имена старых тестов
ради новой документации не меняем.

## Что проверять вручную

- Реальные поля, шрифты и переносы страниц в Chrome и Word/LibreOffice.
- Содержание после обновления полей.
- Длинные таблицы, формулы, подписи и листинги.
- Перенос длинной формулы в dev harness `?doc=mathwrap`.
- Отсутствие потерянного или повторённого текста.
- Native Undo/Redo в Chrome: вставить таблицу, отменить и повторить; отдельно
  проверить Ctrl/Cmd+B, Ctrl/Cmd+I и Tab. Предшествующий текст должен сохраниться.

Тесты фронтенда в happy-dom не измеряют реальную раскладку. DOCX проверяем
по тексту и свойствам документа, не побайтным сравнением ZIP-файлов.
Команды запуска — в [AGENTS.md](../../AGENTS.md).

В PR записываем версию кода, команды, браузер/редактор, результат и пропуски.
