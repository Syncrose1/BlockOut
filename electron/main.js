const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const url = require('url');

let mainWindow;
let oauthServer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    show: false,
    center: true
  });

  // Remove menu bar
  mainWindow.setMenu(null);

  // Load the built app
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  console.log('Loading app from:', indexPath);
  
  mainWindow.loadFile(indexPath);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Start OAuth server to receive callback
ipcMain.handle('start-oauth-server', async () => {
  return new Promise((resolve, reject) => {
    if (oauthServer) {
      oauthServer.close();
    }

    oauthServer = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      
      if (parsedUrl.pathname === '/' && parsedUrl.query.code) {
        const code = parsedUrl.query.code;
        
        // Send success page to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
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
        `);
        
        // Send code back to renderer
        if (mainWindow) {
          mainWindow.webContents.send('oauth-code', { code });
        }
        
        // Close server after receiving code
        setTimeout(() => {
          if (oauthServer) {
            oauthServer.close();
            oauthServer = null;
          }
        }, 1000);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    oauthServer.listen(8765, (err) => {
      if (err) {
        console.error('Failed to start OAuth server:', err);
        reject(err);
      } else {
        console.log('OAuth server started on http://localhost:8765');
        resolve(8765);
      }
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      if (oauthServer) {
        oauthServer.close();
        oauthServer = null;
      }
    }, 60000);
  });
});

// Handle OAuth - open in default browser
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

// Handle file save dialog
ipcMain.handle('show-save-dialog', async (event, options) => {
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// Handle file open dialog  
ipcMain.handle('show-open-dialog', async (event, options) => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});