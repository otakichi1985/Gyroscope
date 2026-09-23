use tauri::AppHandle;

pub fn log(app: &AppHandle, msg: &str) {
    #[cfg(debug_assertions)]
    {
        let path = crate::paths::effective_data_dir(app).join("dev-exit.log");
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            use std::io::Write;
            let _ = writeln!(f, "{ts} | {msg}");
        }
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (app, msg);
    }
}
