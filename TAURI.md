# BlockOut Desktop App

This project can be built as a desktop application using Tauri.

## Building Desktop Apps

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- Node.js and npm
- Platform-specific dependencies:
  - **Windows:** Microsoft Visual Studio C++ Build Tools
  - **Linux:** `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev`
  - **macOS:** Xcode Command Line Tools (if building for Mac)

### Development

Run the desktop app in development mode:

```bash
npm run tauri:dev
```

This will:
1. Start the Vite dev server
2. Launch the Tauri desktop window
3. Hot-reload on code changes

### Building Production Binaries

Build for all platforms:

```bash
npm run tauri:build
```

Binaries will be created in `src-tauri/target/release/bundle/`.

### Platform-Specific Builds

Build for current platform only:

```bash
cd src-tauri
cargo tauri build --target <target-triple>
```

Available targets:
- `x86_64-pc-windows-msvc` (Windows)
- `x86_64-unknown-linux-gnu` (Linux)
- `aarch64-unknown-linux-gnu` (Linux ARM64)

## Auto-Updates

The desktop app includes auto-update functionality. Updates are checked against GitHub Releases.

To release an update:
1. Update the version in `src-tauri/tauri.conf.json`
2. Create a new GitHub Release
3. Attach the built binaries
4. Include a `latest.json` file with update metadata

## Data Storage

The desktop app uses the same IndexedDB storage as the web version. Your data is stored locally and synced via Dropbox when configured.

## OAuth Configuration

Dropbox OAuth uses the system browser for authentication. The redirect URL will automatically return to the desktop app.
