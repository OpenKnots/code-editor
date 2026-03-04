use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

pub struct TerminalState {
    sessions: Arc<Mutex<HashMap<u32, TerminalSession>>>,
    next_id: Mutex<u32>,
}

struct TerminalSession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

unsafe impl Sync for TerminalSession {}

impl TerminalState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            next_id: Mutex::new(1),
        }
    }
}

#[derive(Clone, Serialize)]
struct TerminalOutput {
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalExit {
    id: u32,
    code: i32,
}

#[tauri::command]
pub fn create_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cols: Option<u16>,
    rows: Option<u16>,
    cwd: Option<String>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();

    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // login shell for proper PATH

    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    cmd.cwd(cwd.unwrap_or(home));

    // Inherit common env vars
    for key in &["HOME", "USER", "SHELL", "TERM", "LANG", "PATH", "EDITOR",
                 "NVM_DIR", "CARGO_HOME", "RUSTUP_HOME"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let mut next_id = state.next_id.lock().unwrap();
    let id = *next_id;
    *next_id += 1;

    let sessions = Arc::clone(&state.sessions);
    let app_clone = app.clone();
    let output_event = format!("terminal-output-{}", id);
    let exit_event_name = format!("terminal-exit-{}", id);
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&output_event, TerminalOutput { data });
                }
                Err(_) => break,
            }
        }
        let code = sessions
            .lock()
            .ok()
            .and_then(|mut s| {
                s.get_mut(&id).and_then(|session| {
                    session.child.wait().ok().map(|status| status.exit_code() as i32)
                })
            })
            .unwrap_or(0);

        // Clean up the session
        if let Ok(mut s) = sessions.lock() {
            s.remove(&id);
        }

        let _ = app_clone.emit(&exit_event_name, TerminalExit { id, code });
    });

    state.sessions.lock().unwrap().insert(id, TerminalSession {
        writer: Box::new(writer),
        master: pair.master,
        child,
    });

    log::info!("Created terminal session {}", id);
    Ok(id)
}

#[tauri::command]
pub fn write_terminal(
    state: State<'_, TerminalState>,
    id: u32,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("Terminal session not found")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, TerminalState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&id).ok_or("Terminal session not found")?;
    session.master.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn kill_terminal(
    state: State<'_, TerminalState>,
    id: u32,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if sessions.remove(&id).is_some() {
        log::info!("Killed terminal session {}", id);
    }
    Ok(())
}
