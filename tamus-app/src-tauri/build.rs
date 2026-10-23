fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "project_initialize",
            "project_execute",
            "project_replace",
            "project_undo",
            "project_redo",
            "project_open",
            "project_open_path",
            "project_save",
            "project_close_window",
            "ramus_read_file",
            "ramus_write_file",
        ]),
    ))
    .expect("Failed to build Tamus application permissions");
}
