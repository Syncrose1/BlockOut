use std::sync::Arc;
use std::time::Duration;
use axum::{extract::Query, response::Html, routing::get, Router};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tauri::{AppHandle, Manager};
use tokio::sync::{mpsc, Mutex};

#[derive(Debug, Deserialize)]
struct OAuthCallback {
    code: String,
}

#[derive(Debug, Clone, Serialize)]
struct OAuthCodeEvent {
    code: String,
}

static OAUTH_SENDER: tokio::sync::OnceCell<mpsc::Sender<String>> = tokio::sync::OnceCell::const_new();

// Start a temporary HTTP server to receive OAuth callback
// Returns the port number immediately, emits 'oauth-code' event when code is received
#[tauri::command]
async fn start_oauth_server(app_handle: AppHandle) -> Result<u16, String> {
    // Always use port 8765 for consistency with Dropbox redirect URI
    let port = 8765u16;
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    
    // Try to bind to the port
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => return Err(format!("Failed to bind to port {}: {}. Make sure no other app is using this port.", port, e)),
    };
    
    // Channel to receive the OAuth code
    let (tx, mut rx) = mpsc::channel::<String>(1);
    
    // Store sender in global so handler can access it
    let _ = OAUTH_SENDER.set(tx).await;
    
    // Build the router with app_handle for emitting events
    let app = Router::new()
        .route("/", get(oauth_handler))
        .layer(axum::extract::Extension(app_handle));
    
    println!("OAuth server started on http://{}", addr);
    
    // Run server in background
    tokio::spawn(async move {
        let result = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                // Shut down after 60 seconds or when we receive a code
                let _ = tokio::time::sleep(Duration::from_secs(60)).await;
            })
            .await;
        
        if let Err(e) = result {
            eprintln!("OAuth server error: {}", e);
        }
    });
    
    // Also spawn a task to listen for the code and emit event
    tokio::spawn(async move {
        match tokio::time::timeout(Duration::from_secs(60), rx.recv()).await {
            Ok(Some(code)) => {
                println!("OAuth code received, emitting event");
                let _ = app_handle.emit("oauth-code", OAuthCodeEvent { code });
            }
            _ => {
                println!("OAuth timeout or channel closed");
            }
        }
    });
    
    Ok(port)
}

// Handler for OAuth callback
async fn oauth_handler(
    Query(params): Query<OAuthCallback>,
    axum::extract::Extension(app_handle): axum::extract::Extension<AppHandle>,
) -> Html<String> {
    println!("Received OAuth callback with code: {}", &params.code[..params.code.len().min(10)]);
    
    // Emit the code event immediately
    let _ = app_handle.emit("oauth-code", OAuthCodeEvent { code: params.code.clone() });
    
    // Return success page
    Html(
        r#"
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>BlockOut - Authorization Successful</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .container {
                    text-align: center;
                    padding: 40px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    backdrop-filter: blur(10px);
                    max-width: 400px;
                }
                h1 { margin: 0 0 16px 0; font-size: 28px; }
                p { margin: 0; font-size: 16px; opacity: 0.9; line-height: 1.5; }
                .checkmark {
                    font-size: 64px;
                    margin-bottom: 24px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="checkmark">✓</div>
                <h1>Authorization Successful!</h1>
                <p>You can now close this browser tab and return to BlockOut.<br>Your Dropbox account has been connected.</p>
            </div>
        </body>
        </html>
        "#.to_string()
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![start_oauth_server])
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
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}