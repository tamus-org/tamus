# Tamus development

**English** | [Русский](README.ru.md)

See the root README for the [project overview, features and user guide](../README.md). Run all commands below from this directory, `tamus-app/`.

## Setup and development

You need Node.js 20.19+ and npm. Desktop mode also requires stable Rust and the Tauri 2 system dependencies for your OS.

```bash
npm ci
npm run dev
```

Browser preview is available at [localhost:1420](http://localhost:1420/). To run through Tauri, stop the separate Vite server and run:

```bash
npm run tauri dev
```

Tauri starts Vite automatically. Browser mode uses a separate reducer and JSON downloads; desktop mode applies changes through Rust with revision checks and native file dialogs.

## Main commands

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Vite on port 1420                        |
| `npm run tauri dev`    | Desktop app in development mode          |
| `npm run build`        | Static frontend in `build/`              |
| `npm run tauri build`  | Native build and installation packages   |
| `npm run check`        | Svelte and TypeScript checks             |
| `npm test`             | Project model and localization tests     |
| `npm run format`       | Format frontend, tests and configuration |
| `npm run format:check` | Check formatting                         |

## Rust core

`tamus-core` does not depend on Tauri/GTK and can be tested independently:

```bash
cargo test --manifest-path src-tauri/crates/tamus-core/Cargo.toml
cargo clippy --manifest-path src-tauri/crates/tamus-core/Cargo.toml --all-targets -- -D warnings
```

Shared scenarios in `fixtures/` run in both TypeScript and Rust. They cover validation, command atomicity, diagram hierarchy, appearance, flow references, history and file persistence.

## Browser checks

With `npm run dev` running in another terminal:

```bash
npx playwright install chromium
npm run test:ui
npm run test:idef0
npm run test:ramus
npm run test:shell
npm run test:i18n
```

Set `PLAYWRIGHT_CHANNEL=msedge` to use an installed Edge browser. `TAMUS_URL` changes the server URL, and `PLAYWRIGHT_MODULE` specifies an external Playwright module. Screenshots are saved in `.artifacts/`.

Browser tests do not exercise native window controls or system file dialogs. Test those through a separate desktop app run.

## Documentation

The detailed implementation documents are currently in Russian:

- [Architecture and migration plan](../docs/TAURI_SVELTE_PROJECT.md).
- [Current IDEF0 implementation](../docs/IMPLEMENTED_IDEF0.md).
- [DFD, appearance and advanced mode](../docs/DFD_AND_APPEARANCE.md).
- [Translations and i18n](../docs/I18N.md).

Ignore rules are maintained in the root [`.gitignore`](../.gitignore). Commit `package-lock.json`, both `Cargo.lock` files, source icons and test fixtures; dependencies and build output are recreated locally.
