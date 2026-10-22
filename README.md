<div align="center">
  <img src="https://github.com/user-attachments/assets/dad69bf4-8d80-4604-abcc-67c804c743e6" alt="Tamus" width="128" height="128" />

  # Tamus

  A desktop editor for IDEF0 and DFD process models built with Tauri 2, Svelte 5 and Rust. Tamus is based on research into Ramus capabilities: function decomposition, data flows, classifiers and working with multiple diagram levels.

  🌐 **English** | [Русский](README.ru.md)
  
</div>

> [!WARNING]
> The project is in beta: bugs and unstable behavior are possible.

## Features

- **IDEF0** — A-0 context, nested diagrams, I/C/O/M arrows and inheritance of parent block interfaces.
- **DFD** — processes, external entities, data stores, directed flows and process decomposition.
- **Editor** — placement, movement and resizing of blocks, grid, zoom, automatic orthogonal arrow routing and context menus.
- **Diagram sheet** — Ramus-style frame and title blocks, author, dates, notes, node, context, background color, block fill and text.
- **Classifiers** — create and edit items, search, sort and attach reference objects to flows. Available in advanced mode.
- **Project management** — multiple models, function tree, tabs, properties inspector, undo/redo of the last 100 changes and confirmation before losing changes.
- **Russian and English interface** — switch without restarting; language and advanced mode are saved locally.
- **Dark and light theme** — switch without restarting; themes are saved locally.

## Interface demo
<p align="center">
      <img src="https://github.com/user-attachments/assets/034d0678-0dab-483f-b24f-fe7b90dda101" alt="Interface demo" width="900">      
</p>

## Installation

Download Tamus for your OS: Windows, macOS and Linux are available on [<img align="center" height="60" alt="GitHub" src="https://github.com/user-attachments/assets/1a481370-4323-40e8-94b8-0106b9fc5363" />](https://github.com/tamus-org/tamus/releases)

## Run from source
<details>
<summary>Details</summary>

You need **Node.js 20.19+**, npm and, for the desktop app, stable Rust with the Tauri 2 system dependencies for your OS. Desktop environment requirements are described in the [Tauri guide](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/tamus-org/tamus.git
cd tamus/tamus-app
npm ci
```

### Browser preview

```bash
npm run dev
```

Open [localhost:1420](http://localhost:1420/). The port is fixed; if it is busy, stop the other dev server.

Browser mode lets you use the editor without Rust or a system WebView. Save downloads a JSON file and, when possible, updates the local copy in the browser. Use the downloaded file to transfer the project. Tauri window controls are disabled in the preview.

### Desktop app

```bash
npm run tauri dev
```

Tauri starts the frontend itself. You do not need a separate `npm run dev` on the same port for this command. In desktop mode, state, history, validation and file operations are handled by the Rust core; opening and saving use native dialogs.

### Build

```bash
# Frontend only
npm run build

# App and installation packages for the current platform
npm run tauri build
```

Frontend output is written to `tamus-app/build/`, standard desktop build output to `tamus-app/src-tauri/target/release/`, and packages to its `bundle/` subdirectory. When `CARGO_TARGET_DIR` is set, the Cargo output path changes.

A frontend build and core tests do not confirm that the native app works. The desktop build and its behavior must be tested on the target OS with system dependencies installed.

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

The `tamus-core` crate is tested separately from Tauri and does not require GTK/WebKit.

For browser scenarios, start `npm run dev` in another terminal, then run:

```bash
npx playwright install chromium
npm run test:ui
npm run test:idef0
npm run test:ramus
npm run test:shell
npm run test:i18n
```

The scenarios cover editing, classifiers, interface inheritance, DFD, appearance, menus, localization, undo/redo and project save/open. Screenshots are written to `.artifacts/`.

Set `PLAYWRIGHT_CHANNEL=msedge` to use an installed Edge browser, `TAMUS_URL` to set the server URL, and `PLAYWRIGHT_MODULE` to specify an external Playwright module. Environment variable syntax depends on your shell.
</details>

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
│   └── scripts/                  # End-to-end browser checks
└── LICENSE
```

## Technology stack

| Category | Stack |
| --- | --- |
| Programming language | Rust, TypeScript |
| UI framework | Svelte 5, SvelteKit, Tauri 2 |
| Libraries | Serde, Tauri API, Playwright |

## Project contributors

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

## License
Tamus is distributed under the [GNU GPL-3.0](LICENSE) license.
