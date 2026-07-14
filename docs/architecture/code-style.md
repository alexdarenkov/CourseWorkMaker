# Архитектура: стиль кода

Соглашения по языкам. Общие принципы: минимальные изменения, достаточные
для задачи; следуй стилю редактируемого файла; комментарии и сообщения об
ошибках — на русском. Существующую логику тестов не менять — исправлять
только поломки от изменения интерфейсов.

## TypeScript / React

- Строгий TypeScript (`tsconfig.json`), функциональные компоненты, хуки.
- Tailwind CSS; кастомные CSS-переменные — в `index.css`.
- Светлая/тёмная тема — класс `.dark` (`darkMode: 'class'` в tailwind.config.js).

## Java

- Java 21, records, современные API.
- Пакеты `com.courseworkmaker.<service>.*`; слои `controller` → `service` →
  `repo` → `entity`; DTO в `dto` (records + Jakarta Validation), исключения
  в `exception`.
- UUID первичные ключи, `OffsetDateTime` для временных меток.
- Валидация возвращает `422` с русскими сообщениями.
- `@Transactional` на методах записи.

## Python

- Python 3.12, FastAPI + Pydantic 2.
- В Pydantic-моделях — camelCase-алиасы для совместимости с фронтендом.
- Таймауты и лимиты размеров встроены в ручки; внешние процессы
  (pandoc, LibreOffice) вызываются с таймаутами (SEC-7).
