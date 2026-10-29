//! 桌面壳：读写 Markdown、列出目录、系统菜单。
//! 前端不直接碰磁盘。Mac 和 Windows 共用下面的命令；菜单按系统分开组装。
//!
//! 双击 .md 时，Mac 走 `RunEvent::Opened`，Windows 把路径放在启动参数里。
//! 页面还没监听事件时，路径先留在 `PendingOpen`，前端进来再取走。

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

/// 系统要求打开、但前端还没收下的文件。
struct PendingOpen(Mutex<Option<String>>);

fn is_markdown_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt")
}

/// 侧栏里跳过的名字：点开头是隐藏文件，其余是依赖和构建产物。
fn should_skip_name(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "target" | "dist")
}

/// 传给前端的目录项。serde 用 camelCase，要和 `src/FolderSidebar.tsx` 的字段一致。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntryDto {
    name: String,
    path: String,
    is_dir: bool,
    is_markdown: bool,
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntryDto>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err("不是文件夹".into());
    }

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if should_skip_name(&name) {
            continue;
        }

        let full = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let is_markdown = is_markdown_path(&full.to_string_lossy());
        // 只留文件夹和笔记，避免侧栏被图片、锁文件刷满。
        if is_dir || is_markdown {
            entries.push(DirEntryDto {
                name,
                path: full.to_string_lossy().into_owned(),
                is_dir,
                is_markdown,
            });
        }
    }

    // 文件夹在前，同组按名字排，不区分大小写（Windows 资源管理器也是这样）。
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
fn read_markdown(path: String) -> Result<String, String> {
    if !is_markdown_path(&path) {
        return Err("只支持 .md / .markdown / .txt".into());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| {
        // Windows 记事本另存时可能不是 UTF-8。
        if e.kind() == std::io::ErrorKind::InvalidData {
            "文件不是 UTF-8".into()
        } else {
            e.to_string()
        }
    })?;
    // 去掉 Windows 记事本常见的 BOM，避免正文开头多一个看不见的字符。
    Ok(text.trim_start_matches('\u{feff}').to_string())
}

#[tauri::command]
fn write_markdown(path: String, contents: String) -> Result<(), String> {
    if !is_markdown_path(&path) {
        return Err("只支持 .md / .markdown / .txt".into());
    }
    // 原样写入编辑器给出的文本（一般是 LF）。Mac / Windows 的 Markdown 工具都能读。
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

fn file_menu(app: &tauri::AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    // CmdOrCtrl：Mac 是 ⌘，Windows 是 Ctrl。
    let new_item = MenuItem::with_id(app, "new", "新建", true, Some("CmdOrCtrl+N"))?;
    let open_item = MenuItem::with_id(app, "open", "打开…", true, Some("CmdOrCtrl+O"))?;
    let open_folder_item = MenuItem::with_id(
        app,
        "open_folder",
        "打开文件夹…",
        true,
        Some("Shift+CmdOrCtrl+O"),
    )?;
    let save_item = MenuItem::with_id(app, "save", "保存", true, Some("CmdOrCtrl+S"))?;
    let save_as_item =
        MenuItem::with_id(app, "save_as", "另存为…", true, Some("Shift+CmdOrCtrl+S"))?;

    // Mac 的「退出」在应用菜单里。Windows 没有应用菜单，退出放在文件菜单底部。
    #[cfg(target_os = "macos")]
    {
        return Submenu::with_items(
            app,
            "文件",
            true,
            &[
                &new_item,
                &open_item,
                &open_folder_item,
                &PredefinedMenuItem::separator(app)?,
                &save_item,
                &save_as_item,
            ],
        );
    }

    #[cfg(not(target_os = "macos"))]
    {
        Submenu::with_items(
            app,
            "文件",
            true,
            &[
                &new_item,
                &open_item,
                &open_folder_item,
                &PredefinedMenuItem::separator(app)?,
                &save_item,
                &save_as_item,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, Some("退出"))?,
            ],
        )
    }
}

fn edit_menu(app: &tauri::AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    // 用系统剪切板，Mac / Windows 的撤销、复制、粘贴行为一致。
    Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )
}

/// 关于、隐藏、退出。这些预定义项只在 macOS 上有意义。
#[cfg(target_os = "macos")]
fn macos_app_menu(app: &tauri::AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    Submenu::with_items(
        app,
        "showMD",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
}

/// 已存在的 .md / .markdown / .txt。启动参数里其它字符串（例如 `--`）忽略。
fn markdown_file(path: &std::path::Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let text = path.to_string_lossy();
    if is_markdown_path(&text) {
        Some(text.into_owned())
    } else {
        None
    }
}

/// Windows 双击文件、或命令行 `showMD note.md`：路径在 argv 里。
fn launch_file_from_args() -> Option<String> {
    std::env::args_os().skip(1).find_map(|arg| {
        let text = arg.to_string_lossy();
        if text.starts_with('-') {
            return None;
        }
        markdown_file(std::path::Path::new(text.as_ref()))
    })
}

/// 记下路径并通知前端。窗口已在时把它带到前台。
fn queue_open(app: &tauri::AppHandle, path: String) {
    if let Some(state) = app.try_state::<PendingOpen>() {
        *state.0.lock().unwrap() = Some(path.clone());
    }
    let _ = app.emit("open_path", &path);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 前端启动时取走待打开的文件。只取一次，避免和 `open_path` 事件各开一遍。
#[tauri::command]
fn take_pending_open(state: tauri::State<PendingOpen>) -> Option<String> {
    state.0.lock().unwrap().take()
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let file_menu = file_menu(app)?;
    let edit_menu = edit_menu(app)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = macos_app_menu(app)?;
        return Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu]);
    }

    #[cfg(not(target_os = "macos"))]
    {
        Menu::with_items(app, &[&file_menu, &edit_menu])
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpen(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            read_markdown,
            write_markdown,
            list_dir,
            take_pending_open
        ])
        .setup(|app| {
            app.set_menu(build_menu(app.handle())?)?;
            if let Some(path) = launch_file_from_args() {
                queue_open(app.handle(), path);
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            // 「退出」由系统菜单项自己处理，不用再发给前端。
            let id = event.id().as_ref();
            if matches!(id, "new" | "open" | "open_folder" | "save" | "save_as") {
                let _ = app.emit(id, ());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running showMD");

    app.run(|app_handle, event| {
        // Mac：访达双击、拖到程序图标，系统发 Opened，不走 argv。
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            if let Some(path) = urls.into_iter().find_map(|url| {
                url.to_file_path()
                    .ok()
                    .as_deref()
                    .and_then(markdown_file)
            }) {
                queue_open(app_handle, path);
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}
