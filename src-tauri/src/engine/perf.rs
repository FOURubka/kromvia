use serde_json::{json, Value};

use crate::engine::core::{http, paths};
use crate::engine::instances;
use crate::engine::metrics::Run;

const MIN_SECONDS: u64 = 120;

fn flag() -> std::path::PathBuf {
    paths::root().join("perf-reports")
}

pub fn enabled() -> bool {
    !std::fs::read_to_string(flag()).is_ok_and(|s| s.trim() == "off")
}

pub fn set_enabled(on: bool) -> Result<(), String> {
    std::fs::create_dir_all(paths::root()).map_err(|e| e.to_string())?;
    std::fs::write(flag(), if on { "on" } else { "off" }).map_err(|e| e.to_string())
}

pub fn projects(instance_id: &str) -> Vec<String> {
    let mut out: Vec<String> = crate::engine::content::list(instance_id)
        .unwrap_or_default()
        .into_iter()
        .filter(|f| f.folder == "mods" && f.enabled)
        .filter_map(|f| f.project_id)
        .filter(|p| p.len() == 8 && p.bytes().all(|b| b.is_ascii_alphanumeric()))
        .collect();
    out.sort();
    out.dedup();
    out
}

fn hardware() -> (String, u64) {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();
    let cpu = sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default();
    (cpu, (sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0).round() as u64)
}

pub async fn send(instance_id: &str, run: &Run) -> Result<(), String> {
    if run.seconds < MIN_SECONDS {
        return Ok(());
    }
    let inst = instances::get(instance_id)?;
    let (cpu, ram_gb) = tokio::task::spawn_blocking(hardware).await.map_err(|e| e.to_string())?;
    let body = json!({
        "launcher": env!("CARGO_PKG_VERSION"),
        "os": std::env::consts::OS,
        "gpu": run.gpu,
        "cpu": cpu,
        "ramGb": ram_gb,
        "mc": inst.mc_version,
        "loader": inst.loader.as_ref().map(|l| l.kind),
        "projects": projects(instance_id),
        "fpsAvg": run.fps_avg,
        "fpsLow": run.fps_low,
        "seconds": run.seconds,
    });
    let resp = http::client().post(format!("{}/perf", crate::engine::social::base())).json(&body).send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("perf report rejected ({})", resp.status()))
    }
}

pub fn my_gpu(instance_id: &str) -> String {
    crate::engine::metrics::list(instance_id).iter().rev().find(|r| !r.gpu.is_empty()).map(|r| r.gpu.clone()).unwrap_or_default()
}

pub async fn insight(instance_id: &str, project: &str) -> Result<Value, String> {
    let inst = instances::get(instance_id)?;
    let gpu = my_gpu(instance_id);
    let mine = projects(instance_id).join(",");
    http::get_json_query(
        &format!("{}/perf/insight", crate::engine::social::base()),
        &[("mod", project), ("gpu", &gpu), ("mc", &inst.mc_version), ("with", &mine)],
    )
    .await
}
