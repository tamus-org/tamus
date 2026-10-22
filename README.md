# Tamus

**English** | [Русский](README.ru.md)

A desktop editor for **IDEF0 and DFD** process models, built with **Tauri 2, Svelte 5 and Rust**. Tamus draws on an analysis of Ramus features, including function decomposition, data flows, classifiers and navigation across diagram levels.

The project is under active development. The editor supports saving projects, while the full set of Ramus features is still being implemented.

## Features

- **IDEF0:** A-0 context diagrams, nested diagrams, I/C/O/M arrows and interfaces inherited from the parent block.
- **DFD:** processes, external entities, data stores, directed flows and process decomposition.
- **Editor:** block placement, movement and resizing, grid, zoom, automatic orthogonal arrow routing and context menus.
- **Diagram sheets:** Ramus-style frames and title blocks, author, dates, notes, node, context, background color, block fill and text colors.
- **Classifiers:** create and edit items, search, sort and attach reference objects to flows. Available in advanced mode.
- **Projects:** multiple models, a function tree, tabs, a properties inspector, undo/redo for the last 100 changes and confirmation before discarding unsaved changes.
- **English and Russian interface:** switch languages without restarting; language and advanced mode preferences are stored locally.

The current file format is **`.tamus.json`**. It stores diagram structure, geometry, appearance, title block fields and object references. This is a temporary Tamus-specific format; Ramus `.rsf` files cannot be opened yet.

## Quick start

You need **Node.js 20.19+** and npm. The desktop app also requires stable Rust and the Tauri 2 system dependencies for your OS. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for desktop environment setup.

```bash
git clone https://github.com/tamus-org/tamus.git
cd tamus/tamus-app
npm ci
```

### Browser preview

```bash
npm run dev
```

Open [localhost:1420](http://localhost:1420/). The port is fixed; stop any other dev server using it.

Browser preview lets you use the editor without Rust or a system WebView. Save downloads a JSON file and, when possible, updates a local browser copy. Use the downloaded file to transfer your project. Tauri window controls are disabled in browser preview.

### Desktop app

```bash
npm run tauri dev
```

Tauri starts the frontend automatically. Do not run a separate `npm run dev` on the same port. In desktop mode, the Rust core handles state, history, validation and file operations; opening and saving use native file dialogs.

### Build

```bash
# Frontend only
npm run build

# App and installation packages for the current platform
npm run tauri build
```

Frontend output goes to `tamus-app/build/`. Standard desktop build output goes to `tamus-app/src-tauri/target/release/`, with installation packages in its `bundle/` subdirectory. Setting `CARGO_TARGET_DIR` changes the Cargo output location.

A successful frontend build or core test run does not verify the native app. Build and test the desktop app on the target OS with its system dependencies installed.

## First steps

1. Open the sample project or create your own through File → New project.
2. Create a model and choose IDEF0 or DFD.
3. Place blocks and connect them with arrows. Double-click an object to open its properties.
4. Ctrl/⌘+click a function or process to open its decomposition. When creating one, choose a layout and 2–20 activities; Parent returns to the level above.
5. Enable Settings → Advanced mode to access classifiers. To switch from the default Russian interface, open Настройки → Язык интерфейса → English.
6. Save your work as `.tamus.json`. An example file is available at [example.tamus.json](tamus-app/fixtures/example.tamus.json).

| Shortcut           | Action                                   |
| ------------------ | ---------------------------------------- |
| Z / X / C / N      | Select / block or process / arrow / grid |
| E / D              | External entity / data store in DFD      |
| Ctrl/⌘+N / O / S   | New project / open / save                |
| Ctrl/⌘+Shift+S     | Save as                                  |
| Ctrl/⌘+Z / Shift+Z | Undo / redo                              |
| Ctrl/⌘+K           | Search project                           |
| Escape             | Cancel drawing or close a menu           |

Tool shortcuts work in the editor without intercepting text input in form fields. In DFD, only processes support decomposition, and each flow must connect to at least one process.

## Checks

Run all commands below from `tamus-app/`:

```bash
npm run check
npm test
npm run format:check
npm run build

cargo test --manifest-path src-tauri/crates/tamus-core/Cargo.toml
cargo clippy --manifest-path src-tauri/crates/tamus-core/Cargo.toml --all-targets -- -D warnings
```

The `tamus-core` crate is tested independently of Tauri and does not require GTK/WebKit.

For browser scenarios, start `npm run dev` in another terminal, then run:

```bash
npx playwright install chromium
npm run test:ui
npm run test:idef0
npm run test:ramus
npm run test:shell
npm run test:i18n
```

These scenarios cover editing, classifiers, inherited interfaces, DFD, appearance, menus, localization, undo/redo and project save/open. Screenshots are written to `.artifacts/`.

Set `PLAYWRIGHT_CHANNEL=msedge` to use an installed Edge browser, `TAMUS_URL` to change the server URL, or `PLAYWRIGHT_MODULE` to specify an external Playwright module. Environment variable syntax depends on your shell.

## Repository structure

```text
tamus/
├── README.md                      # English project overview
├── README.ru.md                   # Russian project overview
├── docs/                          # Specification and implementation notes
├── tamus-app/
│   ├── src/routes/                # Main window and user actions
│   ├── src/lib/components/        # Dialogs and shared components
│   ├── src/lib/features/          # Diagram editor and geometry
│   ├── src/lib/domain/            # Project format, validation and browser reducer
│   ├── src/lib/i18n/              # Translation catalog and language switching
│   ├── src/lib/services/          # Desktop/preview transport
│   ├── src-tauri/src/             # Tauri commands and native dialogs
│   ├── src-tauri/crates/tamus-core/ # State, commands, history and files
│   ├── fixtures/                 # Shared test scenarios and examples
│   ├── tests/                    # Model and localization tests
│   └── scripts/                  # Browser integration checks
└── LICENSE
```

## Documentation and limitations

- [Target architecture and migration plan](docs/TAURI_SVELTE_PROJECT.md) (Russian) — a design specification; some features described there are not implemented yet.
- [Implemented IDEF0 features](docs/IMPLEMENTED_IDEF0.md) (Russian).
- [DFD, appearance and interface modes](docs/DFD_AND_APPEARANCE.md) (Russian).
- [Localization and adding translations](docs/I18N.md) (Russian).
- [App developer guide](tamus-app/README.md) ([Russian version](tamus-app/README.ru.md)).

RSF/IDL/YAML import, DFDS, shared-flow branching and merging, tunnels, manual arrow bend editing, full ICOM balancing checks, complex attributes, matrices, reports, printing/PDF and network mode are not available yet. Change history is stored in memory; a persistent crash recovery journal has not been implemented.

## Files in Git

The shared [`.gitignore`](.gitignore) excludes dependencies, Node/Rust/Tauri build output, caches, logs, browser test output, local environment settings and user `.tamus.json` exports outside the fixture directory. `.env.example`, `.env.sample` and `.env.template` files can be committed.

Keep source code, documentation, icons, test fixtures, `package-lock.json` and `Cargo.lock` in Git. Ignore rules do not delete local files or stop tracking files that have already been committed.

## License

The project license text is available in [LICENSE](LICENSE).
