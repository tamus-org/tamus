use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tamus_core::{Command, Project, Session, Snapshot};
use tauri::{Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct AppState {
    session: Arc<Mutex<Option<Session>>>,
    allow_close: AtomicBool,
}
fn with_session<T>(
    state: &AppState,
    f: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Не удалось получить доступ к проекту.")?;
    f(guard.as_mut().ok_or("Проект ещё не открыт.")?)
}
fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Операция недоступна в этом окне.".into())
    }
}

#[tauri::command]
fn project_initialize(
    window: WebviewWindow,
    state: State<'_, AppState>,
    project: Project,
) -> Result<Snapshot, String> {
    main_window(&window)?;
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Ошибка состояния проекта.")?;
    if guard.is_none() {
        *guard = Some(Session::new(project)?);
    }
    Ok(guard.as_ref().ok_or("Проект не создан.")?.snapshot())
}
#[tauri::command]
fn project_execute(
    window: WebviewWindow,
    state: State<'_, AppState>,
    expected_revision: String,
    command: Command,
) -> Result<Snapshot, String> {
    main_window(&window)?;
    with_session(&state, |s| s.execute(&expected_revision, command))
}
#[tauri::command]
fn project_replace(
    window: WebviewWindow,
    state: State<'_, AppState>,
    expected_revision: String,
    project: Project,
) -> Result<Snapshot, String> {
    main_window(&window)?;
    with_session(&state, |s| s.replace(&expected_revision, project, None))
}
#[tauri::command]
fn project_undo(
    window: WebviewWindow,
    state: State<'_, AppState>,
    expected_revision: String,
) -> Result<Snapshot, String> {
    main_window(&window)?;
    with_session(&state, |s| s.undo(&expected_revision))
}
#[tauri::command]
fn project_redo(
    window: WebviewWindow,
    state: State<'_, AppState>,
    expected_revision: String,
) -> Result<Snapshot, String> {
    main_window(&window)?;
    with_session(&state, |s| s.redo(&expected_revision))
}

#[tauri::command]
async fn project_open(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    expected_revision: String,
    locale: Option<String>,
) -> Result<Option<Snapshot>, String> {
    main_window(&window)?;
    let session = state.session.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .set_title(if locale.as_deref() == Some("en") {
                "Open Tamus project"
            } else {
                "Открыть проект Tamus"
            })
            .add_filter(
                if locale.as_deref() == Some("en") {
                    "Tamus project (.tamus.json)"
                } else {
                    "Проект Tamus (.tamus.json)"
                },
                &["json"],
            )
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        let project = tamus_core::read_project(&path)?;
        let mut guard = session.lock().map_err(|_| "Ошибка состояния проекта.")?;
        Ok(Some(guard.as_mut().ok_or("Проект не открыт.")?.replace(
            &expected_revision,
            project,
            Some(path),
        )?))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn project_save(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    expected_revision: String,
    save_as: bool,
    locale: Option<String>,
) -> Result<Option<Snapshot>, String> {
    main_window(&window)?;
    let session = state.session.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let current = {
            let guard = session.lock().map_err(|_| "Ошибка состояния проекта.")?;
            guard.as_ref().ok_or("Проект не открыт.")?.snapshot()
        };
        let path = if !save_as && current.path.is_some() {
            std::path::PathBuf::from(current.path.ok_or("Отсутствует путь проекта.")?)
        } else {
            let default_name: String = current
                .project
                .name
                .chars()
                .map(|c| {
                    if c.is_control() || r#"/\:*?"<>|"#.contains(c) {
                        '_'
                    } else {
                        c
                    }
                })
                .collect();
            let Some(file) = app
                .dialog()
                .file()
                .set_title(if locale.as_deref() == Some("en") {
                    "Save Tamus project"
                } else {
                    "Сохранить проект Tamus"
                })
                .add_filter(
                    if locale.as_deref() == Some("en") {
                        "Tamus project (.tamus.json)"
                    } else {
                        "Проект Tamus (.tamus.json)"
                    },
                    &["json"],
                )
                .set_file_name(format!("{default_name}.tamus.json"))
                .blocking_save_file()
            else {
                return Ok(None);
            };
            let mut path = file.into_path().map_err(|e| e.to_string())?;
            if !path.to_string_lossy().to_lowercase().ends_with(".json") {
                path.set_extension("tamus.json");
            }
            path
        };
        let mut guard = session.lock().map_err(|_| "Ошибка состояния проекта.")?;
        Ok(Some(
            guard
                .as_mut()
                .ok_or("Проект не открыт.")?
                .save(&expected_revision, &path)?,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn project_close_window(window: WebviewWindow, state: State<'_, AppState>) -> Result<(), String> {
    main_window(&window)?;
    state.allow_close.store(true, Ordering::Relaxed);
    window.close().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if !state.allow_close.load(Ordering::Relaxed) {
                    let dirty = with_session(&state, |s| Ok(s.snapshot().dirty)).unwrap_or(false);
                    if dirty {
                        api.prevent_close();
                        let _ = window.emit("project-close-requested", ());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            project_initialize,
            project_execute,
            project_replace,
            project_undo,
            project_redo,
            project_open,
            project_save,
            project_close_window
        ])
        .run(tauri::generate_context!())
        .expect("Не удалось запустить Tamus");
}
