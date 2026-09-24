mod native;
mod shortcut;
mod store;

use shortcut::{DoubleTap, Trigger};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicI32, AtomicI64, Ordering},
        Mutex, OnceLock,
    },
    time::Duration,
};
use store::{Entry, Payload, Result, Settings, Store};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

static APP: OnceLock<AppHandle> = OnceLock::new();

struct AppState {
    store: Mutex<Store>,
    last_change: AtomicI64,
    target_pid: AtomicI32,
    using_entry: AtomicBool,
    shortcut_suspended: AtomicBool,
    double_tap: Mutex<Option<DoubleTap>>,
    active_shortcut: Mutex<Option<String>>,
    shortcut_pending: AtomicBool,
}
fn shortcut_suspended(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .shortcut_suspended
        .load(Ordering::SeqCst)
        && app.get_webview_window("main").is_some_and(|window| {
            window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
        })
}
fn toggle_panel(app: &AppHandle) {
    if shortcut_suspended(app) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
            let _ = hide_to_tray(app);
        } else {
            show(app);
        }
    }
}
extern "C" fn on_key(code: u16, down: i32, repeat: i32, modified: i32, time: u64) {
    let Some(app) = APP.get() else {
        return;
    };
    let state = app.state::<AppState>();
    let fire = if let Ok(mut guard) = state.double_tap.lock() {
        if let Some(detector) = guard.as_mut() {
            if shortcut_suspended(app) {
                detector.reset();
                false
            } else {
                detector.event(code, down != 0, repeat != 0, modified != 0, time)
            }
        } else {
            false
        }
    } else {
        false
    };
    if fire {
        toggle_panel(app);
    }
}
#[tauri::command]
fn suspend_shortcut(state: State<AppState>, suspended: bool) {
    state.shortcut_suspended.store(suspended, Ordering::SeqCst);
    if let Ok(mut detector) = state.double_tap.lock() {
        if let Some(detector) = detector.as_mut() {
            detector.reset();
        }
    }
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    entries: Vec<Entry>,
    total: usize,
    pinned: usize,
    settings: Settings,
}

fn snapshot_inner(state: &AppState, query: &str, filter: &str) -> Result<Snapshot> {
    let db = state.store.lock().map_err(|e| e.to_string())?;
    let (total, pinned) = db.counts()?;
    Ok(Snapshot {
        entries: db.list(query, filter)?,
        total,
        pinned,
        settings: db.settings()?,
    })
}
#[tauri::command]
fn snapshot(state: State<AppState>, query: String, filter: String) -> Result<Snapshot> {
    snapshot_inner(&state, &query, &filter)
}
#[tauri::command]
fn entry_content(state: State<AppState>, id: i64) -> Result<Payload> {
    state.store.lock().map_err(|e| e.to_string())?.content(id)
}
#[tauri::command]
fn delete_entry(app: AppHandle, state: State<AppState>, id: i64) -> Result<()> {
    state.store.lock().map_err(|e| e.to_string())?.delete(id)?;
    let _ = app.emit("history-changed", ());
    Ok(())
}
#[tauri::command]
fn clear_history(app: AppHandle, state: State<AppState>) -> Result<()> {
    state.store.lock().map_err(|e| e.to_string())?.clear()?;
    let _ = app.emit("history-changed", ());
    Ok(())
}
#[tauri::command]
fn toggle_pin(app: AppHandle, state: State<AppState>, id: i64) -> Result<()> {
    state.store.lock().map_err(|e| e.to_string())?.pin(id)?;
    let _ = app.emit("history-changed", ());
    Ok(())
}
async fn on_main<T: Send + 'static>(
    app: &AppHandle,
    f: impl FnOnce() -> T + Send + 'static,
) -> Result<T> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())
}
fn show(app: &AppHandle) {
    let app = app.clone();
    let handle = app.clone();
    let _ = handle.run_on_main_thread(move || {
        let state = app.state::<AppState>();
        let pid = native::frontmost_pid();
        if pid > 0 && pid != std::process::id() as i32 {
            state.target_pid.store(pid, Ordering::SeqCst);
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            let _ = window.emit("panel-opened", ());
        }
    });
}
#[tauri::command]
fn hide_window(app: AppHandle) -> Result<()> {
    hide_to_tray(&app)
}
fn hide_to_tray(app: &AppHandle) -> Result<()> {
    suspend_shortcut(app.state::<AppState>(), false);
    let _ = app.emit("panel-hidden", ());
    app.get_webview_window("main")
        .ok_or("窗口不存在")?
        .hide()
        .map_err(|e| e.to_string())
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveOutcome {
    shortcut_active: bool,
    message: Option<String>,
}
#[tauri::command]
async fn accessibility_status(app: AppHandle) -> Result<bool> {
    on_main(&app, native::trusted).await
}
#[tauri::command]
async fn open_accessibility(app: AppHandle) -> Result<()> {
    on_main(&app, native::open_accessibility).await
}
#[tauri::command]
async fn save_settings(app: AppHandle, settings: Settings) -> Result<SaveOutcome> {
    let handle = app.clone();
    on_main(&app, move || save_settings_main(&handle, settings)).await?
}
fn save_settings_main(handle: &AppHandle, settings: Settings) -> Result<SaveOutcome> {
    settings.validate()?;
    let trigger = Trigger::parse(&settings.shortcut)?;
    let state = handle.state::<AppState>();
    let mut db = state.store.lock().map_err(|e| e.to_string())?;
    let mut active = state.active_shortcut.lock().map_err(|e| e.to_string())?;
    // Persist the requested preference even before the user grants Accessibility access.
    // Keep the last working shortcut active until the replacement can be installed.
    if matches!(trigger, Trigger::Double(_)) && !native::trusted() {
        db.save_settings(&settings)?;
        state.shortcut_pending.store(true, Ordering::SeqCst);
        state
            .last_change
            .store(native::change_count(), Ordering::SeqCst);
        let _ = handle.emit("history-changed", ());
        return Ok(SaveOutcome {
            shortcut_active: false,
            message: Some(
                "设置已保存。双击快捷键尚未启用，请为 Clipset 开启辅助功能权限；授权后会自动启用。"
                    .into(),
            ),
        });
    }
    let old_trigger = active
        .as_deref()
        .and_then(|value| Trigger::parse(value).ok());
    let old_chord = match &old_trigger {
        Some(Trigger::Chord(chord)) => Some(*chord),
        _ => None,
    };
    let new_chord = match &trigger {
        Trigger::Chord(chord) => Some(*chord),
        _ => None,
    };
    let old_registered =
        old_chord.is_some_and(|chord| handle.global_shortcut().is_registered(chord));
    let changed = active.as_deref() != Some(settings.shortcut.as_str());
    let mut registered_new = false;
    // Acquire the replacement before releasing the current shortcut.
    match &trigger {
        Trigger::Double(_) => native::start_key_monitor(on_key)?,
        Trigger::Chord(chord) if changed || !old_registered => {
            handle
                .global_shortcut()
                .register(*chord)
                .map_err(|e| format!("快捷键被占用或不可用：{e}"))?;
            registered_new = true;
        }
        _ => {}
    }
    if changed && old_registered {
        if let Err(error) = handle.global_shortcut().unregister(old_chord.unwrap()) {
            if registered_new {
                let _ = handle.global_shortcut().unregister(new_chord.unwrap());
            }
            if !matches!(old_trigger, Some(Trigger::Double(_))) {
                native::stop_key_monitor();
            }
            return Err(format!("旧快捷键释放失败：{error}"));
        }
    }
    if let Err(error) = db.save_settings(&settings) {
        if changed && old_registered {
            let _ = handle.global_shortcut().register(old_chord.unwrap());
        }
        if registered_new {
            let _ = handle.global_shortcut().unregister(new_chord.unwrap());
        }
        if !matches!(old_trigger, Some(Trigger::Double(_))) {
            native::stop_key_monitor();
        }
        return Err(error);
    }
    if let Ok(mut detector) = state.double_tap.lock() {
        *detector = match trigger {
            Trigger::Double(key) => Some(DoubleTap::new(key)),
            Trigger::Chord(_) => {
                native::stop_key_monitor();
                None
            }
        };
    }
    *active = Some(settings.shortcut.clone());
    state.shortcut_pending.store(false, Ordering::SeqCst);
    state
        .last_change
        .store(native::change_count(), Ordering::SeqCst);
    let _ = handle.emit("history-changed", ());
    Ok(SaveOutcome {
        shortcut_active: true,
        message: None,
    })
}
fn activate_pending_shortcut(app: &AppHandle) {
    let state = app.state::<AppState>();
    if !state.shortcut_pending.load(Ordering::SeqCst) || !native::trusted() {
        return;
    }
    // Retry once when access is granted; explicit Save can retry a platform registration error.
    state.shortcut_pending.store(false, Ordering::SeqCst);
    let settings = state
        .store
        .lock()
        .map_err(|e| e.to_string())
        .and_then(|db| db.settings());
    match settings.and_then(|settings| save_settings_main(app, settings)) {
        Ok(_) => {
            let _ = app.emit("shortcut-ready", ());
        }
        Err(error) => {
            let _ = app.emit(
                "capture-error",
                format!("快捷键启用失败：{error}。请重新保存设置。"),
            );
        }
    }
}
#[tauri::command]
async fn use_entry(app: AppHandle, id: i64, action: String) -> Result<()> {
    if action != "copy" && action != "paste" {
        return Err("未知操作".into());
    }
    if app
        .state::<AppState>()
        .using_entry
        .swap(true, Ordering::SeqCst)
    {
        return Err("正在处理上一条记录".into());
    }
    let result = perform_use(&app, id, &action).await;
    app.state::<AppState>()
        .using_entry
        .store(false, Ordering::SeqCst);
    if result.is_err() {
        show(&app);
    }
    result
}
async fn perform_use(app: &AppHandle, id: i64, action: &str) -> Result<()> {
    let state = app.state::<AppState>();
    let payload = state.store.lock().map_err(|e| e.to_string())?.content(id)?;
    let target = state.target_pid.load(Ordering::SeqCst);
    if action == "paste" {
        if !on_main(app, native::trusted).await? {
            return Err("直接粘贴需要辅助功能权限，请在偏好设置中授权；也可以先使用复制".into());
        }
        if target <= 0 || target == std::process::id() as i32 {
            return Err("请先在目标应用中放置光标，再用全局快捷键调起 Clipset".into());
        }
    }
    let handle = app.clone();
    on_main(app, move || {
        native::write(&payload)?;
        handle
            .state::<AppState>()
            .last_change
            .store(native::change_count(), Ordering::SeqCst);
        Ok::<(), String>(())
    })
    .await??;
    hide_window(app.clone())?;
    if action == "copy" {
        if target > 0 && target != std::process::id() as i32 {
            let _ = on_main(app, move || native::activate(target)).await;
        }
        return Ok(());
    }
    if !on_main(app, move || native::activate(target)).await? {
        return Err("原应用已关闭，内容已复制，可以手动粘贴".into());
    }
    // Wait for actual focus and released hotkey modifiers instead of relying on one blind delay.
    for _ in 0..40 {
        tokio::time::sleep(Duration::from_millis(50)).await;
        let ready = on_main(app, move || {
            native::frontmost_pid() == target && native::modifiers_released()
        })
        .await?;
        if ready {
            tokio::time::sleep(Duration::from_millis(80)).await;
            if on_main(app, move || native::paste(target)).await? {
                return Ok(());
            }
        }
    }
    Err("未能切回原应用，内容已复制。请松开快捷键后重试，或手动粘贴".into())
}
fn poll_clipboard(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.using_entry.load(Ordering::SeqCst) {
        return;
    }
    let pid = native::frontmost_pid();
    if pid > 0 && pid != std::process::id() as i32 {
        state.target_pid.store(pid, Ordering::SeqCst);
    }
    let count = native::change_count();
    if state.last_change.swap(count, Ordering::SeqCst) == count {
        return;
    }
    let result = (|| -> Result<bool> {
        let mut db = state.store.lock().map_err(|e| e.to_string())?;
        let settings = db.settings()?;
        if settings.paused {
            return Ok(false);
        }
        if let Some(payload) = native::read() {
            db.insert(&payload, &native::frontmost_name(), settings.history_limit)?;
            return Ok(true);
        }
        Ok(false)
    })();
    match result {
        Ok(true) => {
            let _ = app.emit("history-changed", ());
        }
        Err(error) => {
            let _ = app.emit("capture-error", error);
        }
        _ => {}
    }
}
fn configure_tray(tray: &tauri::tray::TrayIcon) -> tauri::Result<()> {
    tray.with_inner_tray_icon(|inner| {
        if let Some(item) = inner.ns_status_item() {
            native::configure_status_item(&*item as *const _ as *mut std::ffi::c_void);
        }
    })
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_panel(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let path = app.path().app_data_dir()?;
            std::fs::create_dir_all(&path)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
            }
            let store =
                Store::open(&path.join("history.sqlite3")).map_err(std::io::Error::other)?;
            let settings = store.settings().map_err(std::io::Error::other)?;
            app.manage(AppState {
                store: Mutex::new(store),
                last_change: AtomicI64::new(native::change_count()),
                target_pid: AtomicI32::new(0),
                using_entry: AtomicBool::new(false),
                shortcut_suspended: AtomicBool::new(false),
                double_tap: Mutex::new(None),
                active_shortcut: Mutex::new(None),
                shortcut_pending: AtomicBool::new(false),
            });
            let _ = APP.set(app.handle().clone());
            // setup runs after Tao has applied its startup activation policy. Use the
            // AppHandle runtime API here; App::set_activation_policy is too late.
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;
            let open = MenuItem::with_id(app, "open", "打开 Clipset", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Clipset", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let tray = TrayIconBuilder::with_id("clipset-tray")
                .icon(tauri::include_image!("icons/tray-icon.png"))
                .icon_as_template(false)
                .tooltip("Clipset · 剪贴板")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            configure_tray(&tray)?;
            let registration =
                Trigger::parse(&settings.shortcut).and_then(|trigger| match trigger {
                    Trigger::Chord(chord) => app
                        .global_shortcut()
                        .register(chord)
                        .map_err(|e| e.to_string()),
                    Trigger::Double(key) => {
                        native::start_key_monitor(on_key)?;
                        *app.state::<AppState>()
                            .double_tap
                            .lock()
                            .map_err(|e| e.to_string())? = Some(DoubleTap::new(key));
                        Ok(())
                    }
                });
            if registration.is_ok() {
                *app.state::<AppState>()
                    .active_shortcut
                    .lock()
                    .map_err(|e| std::io::Error::other(e.to_string()))? =
                    Some(settings.shortcut.clone());
            } else if matches!(Trigger::parse(&settings.shortcut), Ok(Trigger::Double(_)))
                && !native::trusted()
            {
                app.state::<AppState>()
                    .shortcut_pending
                    .store(true, Ordering::SeqCst);
            }
            app.manage(StartupError(
                registration
                    .err()
                    .map(|error| {
                        format!("全局快捷键不可用：{error}。可从菜单栏打开偏好设置并重新保存。")
                    })
                    .unwrap_or_default(),
            ));
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(500));
                let app = handle.clone();
                if handle
                    .run_on_main_thread(move || {
                        poll_clipboard(&app);
                        activate_pending_shortcut(&app);
                    })
                    .is_err()
                {
                    break;
                }
            });
            show(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = hide_to_tray(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            entry_content,
            delete_entry,
            clear_history,
            toggle_pin,
            hide_window,
            accessibility_status,
            open_accessibility,
            save_settings,
            use_entry,
            startup_error,
            suspend_shortcut
        ])
        .build(tauri::generate_context!())
        .expect("无法启动 Clipset")
        .run(|app, event| {
            // A window close/implicit macOS termination must not stop this menu-bar utility.
            // Explicit menu Quit uses app.exit(0), which supplies an exit code.
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = &event
            {
                api.prevent_exit();
                let _ = hide_to_tray(app);
            }
            if let tauri::RunEvent::Exit = event {
                native::stop_key_monitor();
            }
            if let tauri::RunEvent::Reopen { .. } = event {
                show(app);
            }
        });
}
struct StartupError(String);
#[tauri::command]
fn startup_error(state: State<StartupError>) -> String {
    state.0.clone()
}
