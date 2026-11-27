use std::path::Path;

pub fn open_path(path: impl AsRef<Path>) -> Result<(), String> {
    let path = path.as_ref();
    #[cfg(target_os = "linux")]
    if std::env::var_os("APPDIR").is_some() {
        path.metadata().map_err(|e| e.to_string())?;
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(path);
        for (key, value) in host_env() {
            match value {
                Some(v) => cmd.env(key, v),
                None => cmd.env_remove(key),
            };
        }
        let mut child = cmd.spawn().map_err(|e| e.to_string())?;
        std::thread::spawn(move || child.wait());
        return Ok(());
    }
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
pub fn host_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    for (key, value) in host_env() {
        match value {
            Some(v) => cmd.env(key, v),
            None => cmd.env_remove(key),
        };
    }
    cmd
}

#[cfg(target_os = "linux")]
pub fn register_scheme(apps_dir: &Path, scheme: &str) {
    let Some(bin) = std::env::current_exe().ok().and_then(|b| b.file_name().map(|n| n.to_string_lossy().into_owned())) else { return };
    let _ = host_command("update-desktop-database").arg(apps_dir).status();
    let _ = host_command("xdg-mime").args(["default", &format!("{bin}-handler.desktop"), &format!("x-scheme-handler/{scheme}")]).status();
}

pub fn host_env() -> Vec<(String, Option<String>)> {
    let Ok(appdir) = std::env::var("APPDIR") else { return Vec::new() };
    let mut out = vec![("APPDIR".to_string(), None), ("APPIMAGE".to_string(), None)];
    for (key, value) in std::env::vars() {
        if !value.contains(&appdir) || key == "APPDIR" || key == "APPIMAGE" {
            continue;
        }
        let kept = value.split(':').filter(|p| !p.is_empty() && !p.starts_with(&appdir)).collect::<Vec<_>>().join(":");
        out.push((key, (!kept.is_empty()).then_some(kept)));
    }
    out
}
