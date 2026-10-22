# Разработка Tamus

[English](README.md) | **Русский**

[Описание проекта, возможности и инструкция пользователя](../README.ru.md) находятся в корневом README. Все команды ниже выполняются из этого каталога, `tamus-app/`.

## Подготовка и запуск

Нужны Node.js 20.19+ и npm. Для desktop-режима дополнительно требуются стабильный Rust и системные зависимости Tauri 2 для вашей ОС.

```bash
npm ci
npm run dev
```

Браузерный предпросмотр: [localhost:1420](http://localhost:1420/). Для запуска через Tauri остановите отдельный Vite-сервер и выполните:

```bash
npm run tauri dev
```

Tauri сам запускает Vite. Браузерный режим использует отдельный reducer и скачивание JSON; desktop принимает изменения через Rust с проверкой ревизии и использует нативные диалоги файлов.

## Основные команды

| Команда                | Назначение                                     |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Vite на порту 1420                             |
| `npm run tauri dev`    | Настольное приложение в режиме разработки      |
| `npm run build`        | Статический frontend в `build/`                |
| `npm run tauri build`  | Нативная сборка и установочные пакеты          |
| `npm run check`        | Проверка Svelte и TypeScript                   |
| `npm test`             | Тесты модели проекта и локализации             |
| `npm run format`       | Форматирование frontend, тестов и конфигурации |
| `npm run format:check` | Проверка форматирования                        |

## Rust-ядро

`tamus-core` не зависит от Tauri/GTK и проверяется отдельно:

```bash
cargo test --manifest-path src-tauri/crates/tamus-core/Cargo.toml
cargo clippy --manifest-path src-tauri/crates/tamus-core/Cargo.toml --all-targets -- -D warnings
```

Общие сценарии из `fixtures/` исполняются TypeScript и Rust. Проверяются валидация, атомарность команд, иерархия диаграмм, оформление, ссылки потоков, история и сохранение файлов.

## Браузерные проверки

При работающем `npm run dev` в другом терминале:

```bash
npx playwright install chromium
npm run test:ui
npm run test:idef0
npm run test:ramus
npm run test:shell
npm run test:i18n
```

Для установленного Edge используйте переменную `PLAYWRIGHT_CHANNEL=msedge`. `TAMUS_URL` меняет адрес сервера; `PLAYWRIGHT_MODULE` задаёт путь к внешнему Playwright. Скриншоты сохраняются в `.artifacts/`.

Тесты браузера не проверяют нативное управление окном и системные файловые диалоги: эти действия нужно проверять отдельным запуском desktop-приложения.

## Документация

- [Архитектура и план переноса](../docs/TAURI_SVELTE_PROJECT.md).
- [Текущая реализация IDEF0](../docs/IMPLEMENTED_IDEF0.md).
- [DFD, оформление и расширенный режим](../docs/DFD_AND_APPEARANCE.md).
- [Переводы и i18n](../docs/I18N.md).

Правила игнорирования собраны в корневом [`.gitignore`](../.gitignore). `package-lock.json`, оба `Cargo.lock`, исходные иконки и тестовые файлы следует коммитить; зависимости и результаты сборок пересоздаются локально.
