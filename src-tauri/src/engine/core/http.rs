use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use reqwest::{header, Client, StatusCode};
use sha1::Sha1;
use sha2::{Digest, Sha256, Sha512};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

const ATTEMPTS: u32 = 3;
const DEFAULT_PARALLEL: usize = 16;

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    /// Files downloaded at once, 1–32.
    pub parallel: usize,
    /// Total download speed in KB/s for all files together; 0 is no limit.
    pub kbps: u64,
}

static PARALLEL: AtomicUsize = AtomicUsize::new(0);
static KBPS: AtomicU64 = AtomicU64::new(0);

fn limits_path() -> PathBuf {
    crate::engine::core::paths::root().join("network.json")
}

fn load_limits() {
    if PARALLEL.load(Ordering::Relaxed) != 0 {
        return;
    }
    let saved: Option<Limits> = std::fs::read(limits_path()).ok().and_then(|b| serde_json::from_slice(&b).ok());
    let l = saved.unwrap_or(Limits { parallel: DEFAULT_PARALLEL, kbps: 0 });
    KBPS.store(l.kbps, Ordering::Relaxed);
    PARALLEL.store(l.parallel.clamp(1, 32), Ordering::Relaxed);
}

pub fn limits() -> Limits {
    load_limits();
    Limits { parallel: PARALLEL.load(Ordering::Relaxed), kbps: KBPS.load(Ordering::Relaxed) }
}

pub fn set_limits(l: Limits) -> Result<(), String> {
    let l = Limits { parallel: l.parallel.clamp(1, 32), kbps: l.kbps.min(10_000_000) };
    std::fs::create_dir_all(crate::engine::core::paths::root()).map_err(|e| e.to_string())?;
    std::fs::write(limits_path(), serde_json::to_vec(&l).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    PARALLEL.store(l.parallel, Ordering::Relaxed);
    KBPS.store(l.kbps, Ordering::Relaxed);
    Ok(())
}

/// How many files `download_all` fetches at once.
pub fn parallel() -> usize {
    limits().parallel
}

/// Leaky bucket shared by every download, so the limit holds for all of them together.
async fn throttle(bytes: u64) {
    let kbps = KBPS.load(Ordering::Relaxed);
    if kbps == 0 {
        return;
    }
    static BUCKET: Mutex<Option<(Instant, f64)>> = Mutex::new(None);
    let rate = (kbps * 1024) as f64;
    let wait = {
        let mut bucket = BUCKET.lock().unwrap();
        let now = Instant::now();
        let (then, debt) = bucket.unwrap_or((now, 0.0));
        let debt = (debt - now.duration_since(then).as_secs_f64() * rate).max(0.0) + bytes as f64;
        *bucket = Some((now, debt));
        // Let a quarter second of data through without waiting, so small files are not slowed down.
        (debt - rate / 4.0).max(0.0) / rate
    };
    if wait > 0.0 {
        tokio::time::sleep(Duration::from_secs_f64(wait)).await;
    }
}

pub fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent(concat!("Kromvia/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build HTTP client")
    })
}

pub async fn get_json<T: serde::de::DeserializeOwned>(url: &str) -> Result<T, String> {
    get_json_query(url, &[]).await
}

pub async fn get_json_query<T: serde::de::DeserializeOwned>(url: &str, query: &[(&str, &str)]) -> Result<T, String> {
    let resp = client().get(url).query(query).send().await.map_err(|e| format!("{url}: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("{url}: HTTP {status}"));
    }
    resp.json().await.map_err(|e| format!("{url}: {e}"))
}

#[derive(Debug, Clone)]
pub enum Hash {
    Sha1(String),
    Sha256(String),
    Sha512(String),
}

pub struct Download<'a> {
    pub url: &'a str,
    pub dest: &'a Path,
    pub hash: Option<Hash>,
    pub size: Option<u64>,
}

pub async fn download(
    d: &Download<'_>,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> Result<(), String> {
    if let Some(dir) = d.dest.parent() {
        fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    }
    let part = part_path(d.dest);
    let mut last_err = String::new();

    for attempt in 0..ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(1 << (attempt - 1))).await;
        }
        match fetch(d, &part, cancel, &mut on_progress).await {
            Ok(()) => {}
            Err(Fail::Fatal(e)) => return Err(e),
            Err(Fail::Retry(e)) => {
                last_err = e;
                continue;
            }
        }
        if let Err(e) = verify(&part, d.size, d.hash.as_ref()).await {
            let _ = fs::remove_file(&part).await;
            last_err = e;
            continue;
        }
        return fs::rename(&part, d.dest).await.map_err(|e| e.to_string());
    }
    Err(format!("{}: {last_err}", d.url))
}

enum Fail {
    Retry(String),
    Fatal(String),
}

async fn fetch(
    d: &Download<'_>,
    part: &Path,
    cancel: &AtomicBool,
    on_progress: &mut impl FnMut(u64, Option<u64>),
) -> Result<(), Fail> {
    let have = fs::metadata(part).await.map(|m| m.len()).unwrap_or(0);
    let mut req = client().get(d.url);
    if have > 0 {
        req = req.header(header::RANGE, format!("bytes={have}-"));
    }
    let resp = req.send().await.map_err(|e| Fail::Retry(e.to_string()))?;
    let status = resp.status();

    let resumed = status == StatusCode::PARTIAL_CONTENT;
    if !status.is_success() {
        let msg = format!("HTTP {status}");
        let retryable = status.is_server_error()
            || status == StatusCode::TOO_MANY_REQUESTS
            || status == StatusCode::REQUEST_TIMEOUT
            || status == StatusCode::RANGE_NOT_SATISFIABLE;
        if status == StatusCode::RANGE_NOT_SATISFIABLE {
            let _ = fs::remove_file(part).await;
        }
        return Err(if retryable { Fail::Retry(msg) } else { Fail::Fatal(msg) });
    }

    let mut done = if resumed { have } else { 0 };
    let total = resp.content_length().map(|n| n + done).or(d.size);
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed)
        .truncate(!resumed)
        .open(part)
        .await
        .map_err(|e| Fail::Fatal(e.to_string()))?;

    on_progress(done, total);
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            drop(file);
            let _ = fs::remove_file(part).await;
            return Err(Fail::Fatal("cancelled".into()));
        }
        let chunk = chunk.map_err(|e| Fail::Retry(e.to_string()))?;
        file.write_all(&chunk).await.map_err(|e| Fail::Fatal(e.to_string()))?;
        throttle(chunk.len() as u64).await;
        done += chunk.len() as u64;
        on_progress(done, total);
    }
    file.flush().await.map_err(|e| Fail::Fatal(e.to_string()))
}

async fn verify(path: &Path, size: Option<u64>, hash: Option<&Hash>) -> Result<(), String> {
    if let Some(size) = size {
        let got = fs::metadata(path).await.map_err(|e| e.to_string())?.len();
        if got != size {
            return Err(format!("size mismatch: expected {size}, got {got}"));
        }
    }
    let Some(hash) = hash else { return Ok(()) };
    let path = path.to_path_buf();
    let hash = hash.clone();
    tokio::task::spawn_blocking(move || verify_hash_blocking(&path, &hash))
        .await
        .map_err(|e| e.to_string())?
}

pub fn verify_hash_blocking(path: &Path, hash: &Hash) -> Result<(), String> {
    let (got, want) = match hash {
        Hash::Sha1(want) => (hash_file::<Sha1>(path)?, want),
        Hash::Sha256(want) => (hash_file::<Sha256>(path)?, want),
        Hash::Sha512(want) => (hash_file::<Sha512>(path)?, want),
    };
    if got.eq_ignore_ascii_case(want) {
        Ok(())
    } else {
        Err(format!("hash mismatch: expected {want}, got {got}"))
    }
}

pub fn sha1_file(path: &Path) -> Result<String, String> {
    hash_file::<Sha1>(path)
}

pub fn sha512_file(path: &Path) -> Result<String, String> {
    hash_file::<Sha512>(path)
}

fn hash_file<D: Digest>(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = D::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest.file_name().unwrap_or_default().to_os_string();
    name.push(".part");
    dest.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_hashes() {
        let dir = std::env::temp_dir().join(format!("kromvia-http-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.txt");
        std::fs::write(&f, b"abc").unwrap();

        let sha1 = "a9993e364706816aba3e25717850c26c9cd0d89d";
        let sha256 = "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD";
        assert!(verify_hash_blocking(&f, &Hash::Sha1(sha1.into())).is_ok());
        assert!(verify_hash_blocking(&f, &Hash::Sha256(sha256.into())).is_ok());
        assert!(verify_hash_blocking(&f, &Hash::Sha1("00".into())).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn part_path_appends_suffix() {
        assert_eq!(part_path(Path::new("/x/jre.tar.gz")), Path::new("/x/jre.tar.gz.part"));
    }
}
