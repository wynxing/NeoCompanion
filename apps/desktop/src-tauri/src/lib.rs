use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{LogicalSize, Manager, Size, WindowEvent};

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_wallpaper::init());

    builder
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("NeoCompanion")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, TrayIconEvent::DoubleClick { .. }) {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_size(Size::Logical(LogicalSize {
                    width: 320.0,
                    height: 540.0,
                }));
                let _ = window.set_resizable(false);
                let _ = window.set_skip_taskbar(true);
                let _ = window.set_always_on_top(true);

                window.on_window_event(|event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        // Keep the app lightweight during v1; closing exits instead of hiding.
                    }
                });
            }

            if let Some(window) = app.get_webview_window("panel") {
                let _ = window.hide();
                let panel = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = panel.hide();
                    }
                });
            }

            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.hide();
                let settings = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = settings.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running NeoCompanion");
}
