use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Serialize)]
pub struct FileEntry {
    pub path: String,        // relative to root
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[derive(Clone, Serialize)]
pub struct GitInfo {
    pub branch: String,
    pub is_repo: bool,
    pub status: Vec<GitFileStatus>,
}

#[derive(Clone, Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,  // "M", "A", "D", "??"
}

fn should_ignore(name: &str) -> bool {
    matches!(name,
        ".git" | "node_modules" | ".next" | ".turbo" | "target" |
        ".DS_Store" | "dist" | ".cache" | "__pycache__" | ".vercel" |
        ".swc" | "coverage" | ".nyc_output" | ".parcel-cache"
    )
}

fn walk_dir(root: &Path, dir: &Path, entries: &mut Vec<FileEntry>, depth: u32) {
    if depth > 12 { return }

    let Ok(read_dir) = fs::read_dir(dir) else { return };
    let mut items: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
    items.sort_by(|a, b| {
        let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        b_dir.cmp(&a_dir).then(a.file_name().cmp(&b.file_name()))
    });

    for entry in items {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".env.example" && name != ".gitignore" {
            if should_ignore(&name) { continue }
        }
        if should_ignore(&name) { continue }

        let path = entry.path();
        let rel = path.strip_prefix(root).unwrap_or(&path);
        let rel_str = rel.to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let size = if !is_dir { entry.metadata().ok().map(|m| m.len()) } else { None };

        entries.push(FileEntry {
            path: rel_str,
            name: name.clone(),
            is_dir,
            size,
        });

        if is_dir {
            walk_dir(root, &path, entries, depth + 1);
        }
    }
}

fn run_git(dir: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git error: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(stderr.trim().to_string())
    }
}

// ─── Tauri Commands ─────────────────────────────────────────

#[tauri::command]
pub fn local_read_tree(root: String) -> Result<Vec<FileEntry>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("Not a directory: {}", root));
    }
    let mut entries = Vec::new();
    walk_dir(&root_path, &root_path, &mut entries, 0);
    Ok(entries)
}

#[tauri::command]
pub fn local_read_file(root: String, path: String) -> Result<String, String> {
    let full = PathBuf::from(&root).join(&path);
    fs::read_to_string(&full)
        .map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn local_read_file_base64(root: String, path: String) -> Result<String, String> {
    use base64::Engine as _;
    let full = PathBuf::from(&root).join(&path);
    let bytes = fs::read(&full)
        .map_err(|e| format!("Failed to read {}: {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
pub fn local_write_file(root: String, path: String, content: String) -> Result<(), String> {
    let full = PathBuf::from(&root).join(&path);
    // Create parent dirs if needed
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dirs: {}", e))?;
    }
    fs::write(&full, &content)
        .map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn local_git_info(root: String) -> Result<GitInfo, String> {
    // Check if it's a git repo
    let git_dir = PathBuf::from(&root).join(".git");
    if !git_dir.exists() {
        return Ok(GitInfo {
            branch: String::new(),
            is_repo: false,
            status: vec![],
        });
    }

    // Get current branch
    let branch = run_git(&root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_default()
        .trim()
        .to_string();

    // Get status
    let status_output = run_git(&root, &["status", "--porcelain"])
        .unwrap_or_default();

    let status: Vec<GitFileStatus> = status_output
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let status_code = line.get(0..2).unwrap_or("??").trim().to_string();
            let file_path = line.get(3..).unwrap_or("").to_string();
            GitFileStatus { path: file_path, status: status_code }
        })
        .collect();

    Ok(GitInfo { branch, is_repo: true, status })
}

#[tauri::command]
pub fn local_git_diff(root: String, path: String) -> Result<String, String> {
    run_git(&root, &["diff", "--", &path])
}

#[tauri::command]
pub fn local_git_commit(root: String, message: String, paths: Vec<String>) -> Result<String, String> {
    // Stage files
    for p in &paths {
        run_git(&root, &["add", "--", p])?;
    }
    // Commit
    run_git(&root, &["commit", "-m", &message])
}

#[tauri::command]
pub fn local_git_branches(root: String) -> Result<Vec<String>, String> {
    let output = run_git(&root, &["branch", "--format=%(refname:short)"])?;
    Ok(output.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

#[tauri::command]
pub fn local_git_checkout(root: String, branch: String) -> Result<String, String> {
    run_git(&root, &["checkout", &branch])
        .or_else(|_| run_git(&root, &["checkout", "-b", &branch]))
}
