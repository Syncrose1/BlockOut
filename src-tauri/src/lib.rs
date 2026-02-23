#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Handle deep links for OAuth callbacks
            #[cfg(any(windows, target_os = "macos"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;

                // Listen for deep link events
                app.listen("deep-link://new-url", |event| {
                    let url = event.payload();
                    println!("Deep link received: {}", url);
                    // The URL will contain the OAuth code, which the frontend can read from localStorage
                    // The frontend is already listening for the code in the URL
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
