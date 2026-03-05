mod engine;
mod local_fs;
mod terminal;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager,
};
use terminal::TerminalState;

const LOCALHOST_PORT: u16 = 3080;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut ctx = tauri::generate_context!();

    // Rewrite the frontend URL so Tauri treats localhost as the app origin.
    // This enables IPC on the HTTP origin (needed for YouTube embeds + Spotify PKCE)
    // while keeping assets embedded in the binary via the localhost plugin.
    let localhost_url: url::Url = format!("http://127.0.0.1:{}", LOCALHOST_PORT)
        .parse()
        .unwrap();
    ctx.config_mut().build.frontend_dist =
        Some(tauri::utils::config::FrontendDist::Url(localhost_url));

    tauri::Builder::default()
        .plugin(
            tauri_plugin_localhost::Builder::new(LOCALHOST_PORT)
                .host("127.0.0.1")
                .build(),
        )
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(TerminalState::new())
        .setup(|app| {
            // ── Native Menu Bar ─────────────────────────────────
            let app_menu = SubmenuBuilder::new(app, "Knot Code")
                .item(&PredefinedMenuItem::about(app, Some("About Knot Code"), None)?)
                .separator()
                .item(&PredefinedMenuItem::services(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, None)?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            // File menu
            let save_item = MenuItemBuilder::new("Save")
                .id("file_save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let save_all_item = MenuItemBuilder::new("Save All")
                .id("file_save_all")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let close_tab_item = MenuItemBuilder::new("Close Tab")
                .id("file_close_tab")
                .accelerator("CmdOrCtrl+W")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&save_item)
                .item(&save_all_item)
                .separator()
                .item(&close_tab_item)
                .build()?;

            // Edit menu
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            // View menu
            let toggle_explorer = MenuItemBuilder::new("Toggle Explorer")
                .id("view_explorer")
                .accelerator("CmdOrCtrl+B")
                .build(app)?;
            let toggle_agent = MenuItemBuilder::new("Toggle Agent")
                .id("view_agent")
                .accelerator("CmdOrCtrl+J")
                .build(app)?;
            let toggle_terminal = MenuItemBuilder::new("Toggle Terminal")
                .id("view_terminal")
                .accelerator("CmdOrCtrl+`")
                .build(app)?;
            let toggle_engine = MenuItemBuilder::new("Toggle Gateway Engine")
                .id("view_engine")
                .accelerator("CmdOrCtrl+Shift+E")
                .build(app)?;
            let quick_open = MenuItemBuilder::new("Quick Open")
                .id("view_quick_open")
                .accelerator("CmdOrCtrl+P")
                .build(app)?;
            let zoom_in = MenuItemBuilder::new("Zoom In")
                .id("view_zoom_in")
                .accelerator("CmdOrCtrl+=")
                .build(app)?;
            let zoom_out = MenuItemBuilder::new("Zoom Out")
                .id("view_zoom_out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?;
            let zoom_reset = MenuItemBuilder::new("Actual Size")
                .id("view_zoom_reset")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;
            let fullscreen_item = PredefinedMenuItem::fullscreen(app, None)?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&toggle_explorer)
                .item(&toggle_agent)
                .item(&toggle_terminal)
                .item(&toggle_engine)
                .separator()
                .item(&quick_open)
                .separator()
                .item(&zoom_in)
                .item(&zoom_out)
                .item(&zoom_reset)
                .separator()
                .item(&fullscreen_item)
                .build()?;

            // Window menu
            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::maximize(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            // Help menu
            let docs_item = MenuItemBuilder::new("Documentation")
                .id("help_docs")
                .build(app)?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&docs_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;

            // ── Menu Event Handler ──────────────────────────────
            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let id = event.id().0.as_str();
                let window = app_handle.get_webview_window("main");
                if let Some(win) = window {
                    match id {
                        "file_save" => { let _ = win.emit("menu-action", "save"); }
                        "file_save_all" => { let _ = win.emit("menu-action", "save-all"); }
                        "file_close_tab" => { let _ = win.emit("menu-action", "close-tab"); }
                        "view_explorer" => { let _ = win.emit("menu-action", "toggle-explorer"); }
                        "view_agent" => { let _ = win.emit("menu-action", "toggle-agent"); }
                        "view_terminal" => { let _ = win.emit("menu-action", "toggle-terminal"); }
                        "view_engine" => { let _ = win.emit("menu-action", "toggle-engine"); }
                        "view_quick_open" => { let _ = win.emit("menu-action", "quick-open"); }
                        "view_zoom_in" => { let _ = win.eval("document.body.style.zoom = String(parseFloat(getComputedStyle(document.body).zoom || '1') + 0.1)"); }
                        "view_zoom_out" => { let _ = win.eval("document.body.style.zoom = String(Math.max(0.5, parseFloat(getComputedStyle(document.body).zoom || '1') - 0.1))"); }
                        "view_zoom_reset" => { let _ = win.eval("document.body.style.zoom = '1'"); }
                        "help_docs" => { let _ = win.emit("menu-action", "open-docs"); }
                        _ => {}
                    }
                }
            });

            // ── Window Vibrancy (macOS) ─────────────────────────
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::apply_vibrancy;
                let window = app.get_webview_window("main").unwrap();
                apply_vibrancy(&window, window_vibrancy::NSVisualEffectMaterial::Sidebar, None, None)
                    .ok(); // Don't panic if vibrancy fails
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Terminal commands
            terminal::create_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal,
            terminal::kill_all_terminals,
            // Engine commands
            engine::engine_status,
            engine::engine_start,
            engine::engine_stop,
            engine::engine_restart,
            engine::engine_gateway_config,
            // Local filesystem commands
            local_fs::local_read_tree,
            local_fs::local_read_file,
            local_fs::local_read_file_base64,
            local_fs::local_write_file,
            local_fs::local_delete_path,
            local_fs::local_git_info,
            local_fs::local_git_diff,
            local_fs::local_git_commit,
            local_fs::local_git_branches,
            local_fs::local_git_checkout,
            local_fs::local_git_add,
            local_fs::local_git_unstage,
            local_fs::local_git_discard,
            local_fs::local_git_discard_staged,
            local_fs::local_git_undo_commit,
            local_fs::local_git_remote_url,
            local_fs::local_git_push,
            local_fs::local_git_sync,
            local_fs::local_git_save,
            local_fs::local_git_clean_branches,
            local_fs::local_git_log,
            local_fs::local_git_has_upstream,
            local_fs::local_git_ahead_behind,
            local_fs::local_secret_set,
            local_fs::local_secret_get,
            local_fs::local_secret_delete,
        ])
        .run(ctx)
        .expect("error while running tauri application");
}
