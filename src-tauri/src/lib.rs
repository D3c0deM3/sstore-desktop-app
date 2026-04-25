mod local_db;

use local_db::{ApiRequest, ApiResponse, DesktopHealth};

#[tauri::command]
fn desktop_health(app: tauri::AppHandle) -> Result<DesktopHealth, String> {
    local_db::ensure_database(&app)
}

#[tauri::command]
fn local_api(app: tauri::AppHandle, request: ApiRequest) -> Result<ApiResponse, String> {
    local_db::handle_api(&app, request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![desktop_health, local_api])
        .run(tauri::generate_context!())
        .expect("error while running SStore desktop app");
}
