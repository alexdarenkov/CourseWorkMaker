# Поток: экспорт в DOCX

Кнопка «Скачать» в шапке. Конвертация серверная (см. `overview.md`, почему
не client-side). Правила сборки документа — спеки `gost-layout.md`,
`pagination.md`, `markdown-dialect.md`.

```mermaid
sequenceDiagram
  actor U as Пользователь
  participant E as EditorPage
  participant B as backend :8000
  participant Ext as Внешние URL

  U->>E: «Скачать .docx»
  Note over E: Сбор полезной нагрузки:<br/>markdown + settings + assets<br/>(mermaid уже отрендерен в PNG c pHYs,<br/>titleLogo добавлен явно)
  E->>B: POST /api/convert/docx<br/>Authorization: Bearer
  B->>B: JWT-проверка (get_current_user_id, SEC-1)
  B->>B: md_parser.parse → блочная модель
  B->>Ext: скачать http(s)-картинки<br/>(SSRF-фильтр, ≤10 МБ — SEC-4)
  B->>B: gost.build(): стили, TOC-поле,<br/>формулы → pandoc → OMML (omml.py, кэш)
  B-->>E: файл .docx (Content-Disposition)
  E-->>U: скачивание в браузере
```

## Что важно знать

- **Ассеты передаются явно.** Картинки не лежат в markdown — там ссылки
  `asset:<key>`, а PNG-данные идут в поле `assets`. Логотип титульника —
  ассет вне markdown, его добавляет `download()` (GL-9).
- **Каждая формула гоняется через pandoc** (`markdown→docx`, извлекается
  `<m:oMath>`) с кэшем — MD-7.
- **DOCX — единственный серверный формат экспорта.** Постраничный паритет с
  превью сверяется по DOCX, открытому в Word/LibreOffice (`pagination.md`,
  «Верификация»). Экспорт в PDF (через LibreOffice) убран 2026-07-18 —
  пользователь при необходимости сохраняет PDF из Word.
- Экспорт синхронный; тяжёлые документы с десятками формул укладываются за счёт
  кэша OMML (генерация ИИ, в отличие от экспорта, — отдельные async-джобы, AI-4).
