# Поток: экспорт в DOCX / PDF

Кнопка «Скачать» в шапке. Конвертация серверная (см. `overview.md`, почему
не client-side). Правила сборки документа — спеки `gost-layout.md`,
`pagination.md`, `markdown-dialect.md`.

```mermaid
sequenceDiagram
  actor U as Пользователь
  participant E as EditorPage
  participant G as gateway :8080
  participant C as converter :8001
  participant LO as LibreOffice
  participant Ext as Внешние URL

  U->>E: «Скачать .docx»
  Note over E: Сбор полезной нагрузки:<br/>markdown + settings + assets<br/>(mermaid уже отрендерен в PNG c pHYs,<br/>titleLogo/titleCustom добавлены явно)
  E->>G: POST /api/convert/docx<br/>Authorization: Bearer
  G->>G: JWT-проверка, вырезать клиентские X-User-*,<br/>подставить X-User-Id (SEC-1)
  G->>C: POST /convert/docx (rewrite пути)
  C->>C: md_parser.parse → блочная модель
  C->>Ext: скачать http(s)-картинки<br/>(SSRF-фильтр, ≤10 МБ — SEC-4)
  C->>C: gost.build(): стили, TOC-поле,<br/>формулы → pandoc → OMML (omml.py, кэш)
  C-->>G: файл .docx
  G-->>E: файл (Content-Disposition)
  E-->>U: скачивание в браузере

  opt Экспорт в PDF
    E->>G: POST /api/convert/pdf (то же тело)
    G->>C: POST /convert/pdf
    C->>C: gost.build() → .docx
    C->>LO: docx → pdf (pdf.py: Basic-макрос<br/>обновляет поле содержания)
    C-->>E: файл .pdf (через gateway)
  end
```

## Что важно знать

- **Ассеты передаются явно.** Картинки не лежат в markdown — там ссылки
  `asset:<key>`, а PNG-данные идут в поле `assets`. Логотип титульника и
  titleCustom — ассеты вне markdown, их добавляет `download()` (GL-9/GL-10).
- **Каждая формула гоняется через pandoc** (`markdown→docx`, извлекается
  `<m:oMath>`) с кэшем — MD-7.
- **PDF — это DOCX + LibreOffice.** Поле содержания заполняется реальными
  номерами страниц макросом; профиль LibreOffice готовится при сборке образа.
  Именно этот PDF — эталон для сверки постраничного паритета с превью
  (`pagination.md`, «Верификация»).
- Таймаут ответа gateway — 120 с; большие документы с десятками формул
  укладываются за счёт кэша OMML.
