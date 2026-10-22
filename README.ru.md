<div align="center">
  <img src="https://github.com/user-attachments/assets/dad69bf4-8d80-4604-abcc-67c804c743e6" alt="Tamus" width="128" height="128" />

  # Tamus

  Настольный редактор моделей процессов IDEF0 и DFD на Tauri 2, Svelte 5 и Rust. Tamus создаётся на основе исследования возможностей Ramus: декомпозиции функций, потоков данных, классификаторов и работы с несколькими уровнями диаграмм.

  🌐 [English](README.md) | **Русский**
  
</div>

> [!WARNING]
> Проект в бета-тестировании: возможны ошибки и нестабильная работа.

## Возможности

- **IDEF0** — контекст A-0, вложенные диаграммы, стрелки I/C/O/M и наследование интерфейсов родительского блока.
- **DFD** — процессы, внешние сущности, хранилища данных, направленные потоки и декомпозиция процессов.
- **Редактор** — размещение, перемещение и изменение размера блоков, сетка, масштабирование, автоматическая ортогональная трассировка стрелок и контекстные меню.
- **Лист диаграммы** — рамка и штампы в стиле Ramus, автор, даты, замечания, узел, контекст, цвет фона, заливка и текст блоков.
- **Классификаторы** — создание и редактирование элементов, поиск, сортировка и присоединение справочных объектов к потокам. Доступны в расширенном режиме.
- **Работа с проектом** — несколько моделей, дерево функций, вкладки, инспектор свойств, отмена/повтор последних 100 изменений и подтверждение перед потерей изменений.
- **Русский и английский интерфейс** — переключение без перезапуска; язык и расширенный режим сохраняются локально.
- **Темная и светла тема** — переключение без перезапуска; темы сохраняются локально.

## Демонстрация интерфейса
<p align="center">
      <img src="https://github.com/user-attachments/assets/034d0678-0dab-483f-b24f-fe7b90dda101" alt="Демонстрация интерфейса" width="900">      
</p>

## Установка приложения

Скачайте Tamus для своей ОС: Windows, macOS и Linux доступны в[<img align="center" height="60" alt="GitHub" src="https://github.com/user-attachments/assets/1a481370-4323-40e8-94b8-0106b9fc5363" />](https://github.com/tamus-org/tamus/releases)

## Самостоятельный запуск
<details>
<summary>Подробнее</summary>

Нужны **Node.js 20.19+**, npm и, для настольного приложения, стабильный Rust с системными зависимостями Tauri 2 для выбранной ОС. Требования к desktop-окружению приведены в [руководстве Tauri](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/tamus-org/tamus.git
cd tamus/tamus-app
npm ci
```

### Предпросмотр в браузере

```bash
npm run dev
```

Откройте [localhost:1420](http://localhost:1420/). Порт фиксирован; если он занят, остановите другой dev-сервер.

Браузерный режим позволяет работать с редактором без Rust и системного WebView. «Сохранить» скачивает JSON и по возможности обновляет локальную копию в браузере. Для переноса проекта используйте скачанный файл. Кнопки управления окном Tauri в предпросмотре отключены.

### Настольное приложение

```bash
npm run tauri dev
```

Tauri сам запускает frontend. Отдельный `npm run dev` на том же порту для этой команды не нужен. В desktop-режиме состояние, история, валидация и файловые операции выполняются ядром Rust; открытие и сохранение используют нативные диалоги.

### Сборка

```bash
# Только frontend
npm run build

# Приложение и установочные пакеты для текущей платформы
npm run tauri build
```

Frontend записывается в `tamus-app/build/`, результаты обычной desktop-сборки — в `tamus-app/src-tauri/target/release/`, пакеты — в его подкаталог `bundle/`. При заданном `CARGO_TARGET_DIR` путь результатов Cargo меняется.

Сборка frontend и тесты ядра не подтверждают работоспособность нативного приложения. Desktop-сборку и её поведение нужно проверять на целевой ОС с установленными системными зависимостями.

## Проверки

Все команды ниже выполняются из `tamus-app/`:

```bash
npm run check
npm test
npm run format:check
npm run build

cargo test --manifest-path src-tauri/crates/tamus-core/Cargo.toml
cargo clippy --manifest-path src-tauri/crates/tamus-core/Cargo.toml --all-targets -- -D warnings
```

Ядро `tamus-core` проверяется отдельно от Tauri и не требует GTK/WebKit.

Для браузерных сценариев запустите `npm run dev` в другом терминале, затем:

```bash
npx playwright install chromium
npm run test:ui
npm run test:idef0
npm run test:ramus
npm run test:shell
npm run test:i18n
```

Сценарии проверяют редактирование, классификаторы, наследование интерфейсов, DFD, оформление, меню, локализацию, undo/redo и сохранение/открытие проектов. Скриншоты попадают в `.artifacts/`.

Переменная `PLAYWRIGHT_CHANNEL=msedge` позволяет использовать установленный Edge, `TAMUS_URL` задаёт адрес сервера, `PLAYWRIGHT_MODULE` — путь к внешнему Playwright. Синтаксис задания переменных зависит от оболочки.
</details>

## Структура репозитория

```text
tamus/
├── README.md                      # Описание проекта на английском
├── README.ru.md                   # Описание проекта на русском
├── docs/                          # Спецификация и описание реализации
├── tamus-app/
│   ├── src/routes/                # Основное окно и пользовательские действия
│   ├── src/lib/components/        # Диалоги и общие компоненты
│   ├── src/lib/features/          # Редактор и геометрия диаграмм
│   ├── src/lib/domain/            # Формат проекта, валидация и browser reducer
│   ├── src/lib/i18n/              # Словарь и переключение языка
│   ├── src/lib/services/          # Desktop/preview transport
│   ├── src-tauri/src/             # Tauri-команды и нативные диалоги
│   ├── src-tauri/crates/tamus-core/ # Состояние, команды, история и файлы
│   ├── fixtures/                 # Общие тестовые сценарии и примеры
│   ├── tests/                    # Тесты модели и локализации
│   └── scripts/                  # Сквозные браузерные проверки
└── LICENSE
```

## Стек технологий

| Категория | Стек |
| --- | --- |
| Язык программирования | Rust, TypeScript |
| UI-фреймворк | Svelte 5, SvelteKit, Tauri 2 |
| Библиотеки | Serde, Tauri API, Playwright |

## Участники проекта

<a href="https://github.com/tamus-org/tamus/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=tamus-org/tamus&max=300&columns=15" />
</a>

<br>

<a href="https://star-history.com/#tamus-org/tamus&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=tamus-org/tamus&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=tamus-org/tamus&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=tamus-org/tamus&type=Date" />
 </picture>
</a>

## Лицензия
Tamus распространяется под лицензией [GNU GPL-3.0](LICENSE).
