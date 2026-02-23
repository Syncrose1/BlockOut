use std::sync::Arc;
use std::time::Duration;
use axum::{extract::Query, response::Html, routing::get, Router};
use serde::Deserialize;
use std::net::SocketAddr;
use tokio::sync::{mpsc, Mutex};
use tokio::time::timeout;

#[derive(Debug, Deserialize)]
struct OAuthCallback {
    code: String,
}

// Start a temporary HTTP server to receive OAuth callback
// Returns the authorization code once received, or times out after 60 seconds
#[tauri::command]
async fn start_oauth_server() -> Result<Option<String>, String> {
    // Find an available port
    let port = find_available_port().await.ok_or("Could not find available port")?;
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    
    // Channel to receive the OAuth code
    let (tx, mut rx) = mpsc::channel::<String>(1);
    let tx = Arc::new(Mutex::new(Some(tx)));
    
    // Build the router
    let app = Router::new()
        .route("/", get(oauth_handler))
        .layer(axum::extract::Extension(tx));
    
    // Start the server
    let listener = tokio::net::TcpListener::bind(&addr).await
        .map_err(|e| format!("Failed to bind to port {}: {}", port, e))?;
    
    println!("OAuth server started on http://{}", addr);
    
    // Run server with timeout
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                // Shut down when we receive a code or timeout
                let _ = tokio::time::sleep(Duration::from_secs(60)).await;
            })
            .await
    });
    
    // Wait for the code with timeout
    let result = timeout(Duration::from_secs(60), rx.recv()).await;
    
    // Ensure server shuts down
    let _ = server_handle.await;
    
    match result {
        Ok(Some(code)) => {
            println!("OAuth code received successfully");
            Ok(Some(code))
        }
        Ok(None) => {
            println!("Channel closed without receiving code");
            Ok(None)
        }
        Err(_) => {
            println!("OAuth server timed out after 60 seconds");
            Ok(None)
        }
    }
}

// Handler for OAuth callback
async fn oauth_handler(
    Query(params): Query<OAuthCallback>,
    Extension(tx): axum::extract::Extension<Arc<Mutex<Option<mpsc::Sender<String>>>>>,
) -> Html<String> {
    println!("Received OAuth callback with code: {}", &params.code[..params.code.len().min(10)]);
    
    // Send the code through the channel
    if let Some(sender) = tx.lock().await.take() {
        let _ = sender.send(params.code.clone()).await;
    }
    
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

// Find an available port starting from 8765
async fn find_available_port() -> Option<u16> {
    for port in 8765..8800 {
        let addr: SocketAddr = ([127, 0, 0, 1], port).into();
        if tokio::net::TcpListener::bind(&addr).await.is_ok() {
            return Some(port);
        }
    }
    None
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