# Архитектура: стиль кода

Соглашения по языкам. Общие принципы: минимальные изменения, достаточные
для задачи; следуй стилю редактируемого файла; комментарии и сообщения об
ошибках — на русском. Существующую логику тестов не менять — исправлять
только поломки от изменения интерфейсов.

## TypeScript / React

- Строгий TypeScript (`tsconfig.json`), функциональные компоненты, хуки.
- Tailwind CSS; кастомные CSS-переменные — в `index.css`.
- Светлая/тёмная тема — класс `.dark` (`darkMode: 'class'` в tailwind.config.js).

## Python

- Python 3.12, FastAPI + Pydantic 2; единый монолит `services/backend`,
  модули `auth`/`documents`/`convert`/`ai` + `app/main.py`.
- В Pydantic-моделях ОТВЕТОВ — camelCase-алиасы для совместимости с фронтендом
  (напр. `updatedAt`); валидация возвращает `422` с русскими сообщениями.
- БД — SQLAlchemy 2 (`Mapped`/`mapped_column`), портируемые типы (`Uuid`,
  `DateTime(timezone=True)`) — прод на PostgreSQL, тесты на SQLite.
- Приватные маршруты требуют `Depends(get_current_user_id)` (SEC-1).
- Таймауты и лимиты размеров встроены в ручки; внешние процессы
  (pandoc, matplotlib-подпроцесс) вызываются с таймаутами (SEC-7).
