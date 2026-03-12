use serde::{Deserialize, Serialize};
use std::process::Command;

#[cfg(not(target_os = "ios"))]
use std::{
    io::Read,
    net::TcpListener,
    process::{Child, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

#[derive(Clone, Serialize)]
pub struct EngineStatus {
    pub installed: bool,
    pub running: bool,
    pub pid: Option<u32>,
    pub version: Option<String>,
    pub raw: String,
}

fn run_openclaw(args: &[&str]) -> Result<(String, String, bool), String> {
    // Use login shell to ensure PATH includes nvm, cargo, etc.
    let cmd_str = format!("openclaw {}", args.join(" "));
    let output = Command::new("sh")
        .args(["-lc", &cmd_str])
        .output()
        .map_err(|e| format!("Failed to run openclaw: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok((stdout, stderr, output.status.success()))
}

#[tauri::command]
pub fn engine_status() -> Result<EngineStatus, String> {
    // Check if openclaw is installed
    let installed = Command::new("sh")
        .args(["-lc", "which openclaw"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !installed {
        return Ok(EngineStatus {
            installed: false,
            running: false,
            pid: None,
            version: None,
            raw: "openclaw not found in PATH".to_string(),
        });
    }

    // Get version
    let version = run_openclaw(&["--version"]).ok().and_then(|(out, _, ok)| {
        if ok {
            Some(out.trim().to_string())
        } else {
            None
        }
    });

    // Get gateway status
    let (stdout, stderr, success) = run_openclaw(&["gateway", "status"])?;
    let raw = if success {
        stdout.clone()
    } else {
        format!("{}{}", stdout, stderr)
    };

    // Parse running state — look for common indicators
    let combined = format!("{}{}", stdout.to_lowercase(), stderr.to_lowercase());
    let running = combined.contains("running")
        || combined.contains("pid")
        || (success && !combined.contains("not running") && !combined.contains("stopped"));

    // Try to extract PID
    let pid = raw
        .split_whitespace()
        .find_map(|word| {
            word.trim_matches(|c: char| !c.is_ascii_digit())
                .parse::<u32>()
                .ok()
        })
        .filter(|&p| p > 100); // Filter out small numbers that aren't PIDs

    Ok(EngineStatus {
        installed,
        running,
        pid,
        version,
        raw: raw.trim().to_string(),
    })
}

#[tauri::command]
pub fn engine_start() -> Result<String, String> {
    let (stdout, stderr, success) = run_openclaw(&["gateway", "start"])?;
    if success {
        Ok(stdout.trim().to_string())
    } else {
        Err(format!("{}{}", stdout, stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn engine_stop() -> Result<String, String> {
    let (stdout, stderr, success) = run_openclaw(&["gateway", "stop"])?;
    if success {
        Ok(stdout.trim().to_string())
    } else {
        Err(format!("{}{}", stdout, stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn engine_restart() -> Result<String, String> {
    let (stdout, stderr, success) = run_openclaw(&["gateway", "restart"])?;
    if success {
        Ok(stdout.trim().to_string())
    } else {
        Err(format!("{}{}", stdout, stderr).trim().to_string())
    }
}

#[derive(Clone, Serialize)]
pub struct GatewayConfig {
    pub url: String,
    pub password: String,
}

#[cfg(not(target_os = "ios"))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelConfig {
    pub destination: String,
    pub ssh_port: Option<u16>,
    pub local_port: Option<u16>,
    pub remote_port: Option<u16>,
    pub identity_path: Option<String>,
}

#[cfg(not(target_os = "ios"))]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelStatus {
    pub active: bool,
    pub pid: Option<u32>,
    pub local_url: Option<String>,
    pub config: Option<SshTunnelConfig>,
}

#[cfg(not(target_os = "ios"))]
struct ActiveSshTunnel {
    child: Child,
    config: SshTunnelConfig,
    local_url: String,
}

#[cfg(not(target_os = "ios"))]
#[derive(Default)]
pub struct SshTunnelManager {
    tunnel: Mutex<Option<ActiveSshTunnel>>,
}

#[cfg(not(target_os = "ios"))]
impl Drop for SshTunnelManager {
    fn drop(&mut self) {
        if let Ok(mut tunnel) = self.tunnel.lock() {
            if let Some(active) = tunnel.as_mut() {
                let _ = stop_child(&mut active.child);
            }
            *tunnel = None;
        }
    }
}

#[cfg(not(target_os = "ios"))]
fn stop_child(child: &mut Child) -> Result<(), String> {
    match child.try_wait() {
        Ok(Some(_)) => Ok(()),
        Ok(None) => {
            child
                .kill()
                .map_err(|e| format!("Failed to stop SSH tunnel: {}", e))?;
            let _ = child.wait();
            Ok(())
        }
        Err(e) => Err(format!("Failed to inspect SSH tunnel state: {}", e)),
    }
}

#[cfg(not(target_os = "ios"))]
fn refresh_tunnel_slot(slot: &mut Option<ActiveSshTunnel>) {
    let should_clear = match slot.as_mut() {
        Some(active) => active
            .child
            .try_wait()
            .map(|status| status.is_some())
            .unwrap_or(true),
        None => false,
    };
    if should_clear {
        *slot = None;
    }
}

#[cfg(not(target_os = "ios"))]
fn tunnel_status_from_slot(slot: &Option<ActiveSshTunnel>) -> SshTunnelStatus {
    match slot.as_ref() {
        Some(active) => SshTunnelStatus {
            active: true,
            pid: Some(active.child.id()),
            local_url: Some(active.local_url.clone()),
            config: Some(active.config.clone()),
        },
        None => SshTunnelStatus {
            active: false,
            pid: None,
            local_url: None,
            config: None,
        },
    }
}

#[cfg(not(target_os = "ios"))]
fn normalize_tunnel_config(config: SshTunnelConfig) -> Result<SshTunnelConfig, String> {
    let destination = config.destination.trim();
    if destination.is_empty() {
        return Err("SSH destination is required".to_string());
    }

    let identity_path = config
        .identity_path
        .as_ref()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
        .map(|path| path.to_string());

    Ok(SshTunnelConfig {
        destination: destination.to_string(),
        ssh_port: Some(config.ssh_port.unwrap_or(22)),
        local_port: Some(config.local_port.unwrap_or(28789)),
        remote_port: Some(config.remote_port.unwrap_or(18789)),
        identity_path,
    })
}

#[cfg(not(target_os = "ios"))]
fn build_local_url(local_port: u16) -> String {
    format!("ws://127.0.0.1:{}", local_port)
}

#[cfg(not(target_os = "ios"))]
fn pick_available_local_port(preferred_port: u16) -> Result<u16, String> {
    const MAX_PORT_SEARCH: u16 = 24;

    for offset in 0..=MAX_PORT_SEARCH {
        let candidate = preferred_port.saturating_add(offset);
        if candidate == 0 {
            continue;
        }

        if let Ok(listener) = TcpListener::bind(("127.0.0.1", candidate)) {
            drop(listener);
            return Ok(candidate);
        }
    }

    Err(format!(
        "No available local tunnel ports found near {}",
        preferred_port
    ))
}

#[cfg(not(target_os = "ios"))]
#[tauri::command]
pub fn ssh_tunnel_status(state: tauri::State<SshTunnelManager>) -> Result<SshTunnelStatus, String> {
    let mut tunnel = state
        .tunnel
        .lock()
        .map_err(|_| "Failed to access SSH tunnel state".to_string())?;
    refresh_tunnel_slot(&mut tunnel);
    Ok(tunnel_status_from_slot(&tunnel))
}

#[cfg(not(target_os = "ios"))]
#[tauri::command]
pub fn ssh_tunnel_stop(state: tauri::State<SshTunnelManager>) -> Result<SshTunnelStatus, String> {
    let mut tunnel = state
        .tunnel
        .lock()
        .map_err(|_| "Failed to access SSH tunnel state".to_string())?;
    if let Some(active) = tunnel.as_mut() {
        stop_child(&mut active.child)?;
    }
    *tunnel = None;
    Ok(tunnel_status_from_slot(&tunnel))
}

#[cfg(not(target_os = "ios"))]
#[tauri::command]
pub fn ssh_tunnel_start(
    config: SshTunnelConfig,
    state: tauri::State<SshTunnelManager>,
) -> Result<SshTunnelStatus, String> {
    let mut config = normalize_tunnel_config(config)?;
    let ssh_port = config.ssh_port.unwrap_or(22);
    let requested_local_port = config.local_port.unwrap_or(28789);
    let local_port = pick_available_local_port(requested_local_port)?;
    let remote_port = config.remote_port.unwrap_or(18789);
    let local_url = build_local_url(local_port);
    config.local_port = Some(local_port);

    let mut tunnel = state
        .tunnel
        .lock()
        .map_err(|_| "Failed to access SSH tunnel state".to_string())?;

    if let Some(active) = tunnel.as_mut() {
        stop_child(&mut active.child)?;
    }
    *tunnel = None;

    let forward_spec = format!("127.0.0.1:{}:127.0.0.1:{}", local_port, remote_port);
    let mut command = Command::new("ssh");
    command
        .args(["-NT", "-L", &forward_spec])
        .args(["-o", "ExitOnForwardFailure=yes"])
        .args(["-o", "ServerAliveInterval=30"])
        .args(["-o", "ServerAliveCountMax=3"])
        .args(["-o", "BatchMode=yes"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    if ssh_port != 22 {
        command.args(["-p", &ssh_port.to_string()]);
    }

    if let Some(identity_path) = config.identity_path.as_deref() {
        command.args(["-i", identity_path]);
    }

    command.arg(&config.destination);

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to start SSH tunnel: {}", e))?;

    thread::sleep(Duration::from_millis(500));
    if let Some(status) = child
        .try_wait()
        .map_err(|e| format!("Failed to inspect SSH tunnel: {}", e))?
    {
        let mut stderr = String::new();
        if let Some(mut reader) = child.stderr.take() {
            let _ = reader.read_to_string(&mut stderr);
        }
        let details = stderr.trim();
        if !details.is_empty() {
            return Err(details.to_string());
        }
        return Err(format!(
            "SSH tunnel exited immediately with status {}",
            status
        ));
    }

    *tunnel = Some(ActiveSshTunnel {
        child,
        config,
        local_url,
    });

    Ok(tunnel_status_from_slot(&tunnel))
}

#[tauri::command]
pub fn engine_gateway_config() -> Result<GatewayConfig, String> {
    // Read ~/.openclaw/openclaw.json for gateway port and password
    let home = std::env::var("HOME").unwrap_or_default();
    let config_path = std::path::PathBuf::from(&home).join(".openclaw/openclaw.json");

    if !config_path.exists() {
        return Err("Config not found".to_string());
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;

    // Extract port (default 18789) and password
    let port = config.get("port").and_then(|v| v.as_u64()).unwrap_or(18789);

    let password = config
        .get("auth")
        .and_then(|a| a.get("password"))
        .and_then(|p| p.as_str())
        .unwrap_or("");

    Ok(GatewayConfig {
        url: format!("ws://127.0.0.1:{}", port),
        password: password.to_string(),
    })
}
