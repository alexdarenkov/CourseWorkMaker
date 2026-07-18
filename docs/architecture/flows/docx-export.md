# Поток: экспорт в DOCX

Кнопка «Скачать» в шапке. Конвертация серверная (см. `overview.md`, почему
не client-side). Правила сборки документа — спеки `gost-layout.md`,
`pagination.md`, `markdown-dialect.md`.

```mermaid
sequenceDiagram
  actor U as Пользователь
  participant E as EditorPage
  participant G as gateway :8080
  participant C as converter :8001
  participant Ext as Внешние URL

  U->>E: «Скачать .docx»
  Note over E: Сбор полезной нагрузки:<br/>markdown + settings + assets<br/>(mermaid уже отрендерен в PNG c pHYs,<br/>titleLogo добавлен явно)
  E->>G: POST /api/convert/docx<br/>Authorization: Bearer
  G->>G: JWT-проверка, вырезать клиентские X-User-*,<br/>подставить X-User-Id (SEC-1)
  G->>C: POST /convert/docx (rewrite пути)
  C->>C: md_parser.parse → блочная модель
  C->>Ext: скачать http(s)-картинки<br/>(SSRF-фильтр, ≤10 МБ — SEC-4)
  C->>C: gost.build(): стили, TOC-поле,<br/>формулы → pandoc → OMML (omml.py, кэш)
  C-->>G: файл .docx
  G-->>E: файл (Content-Disposition)
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
- Таймаут ответа gateway — 120 с; большие документы с десятками формул
  укладываются за счёт кэша OMML.
