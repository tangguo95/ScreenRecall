<p align="right">
  <strong>English</strong> | <a href="README_ZH.md">中文</a>
</p>

<p align="center">
  <img src="assets/icons/app-icon-256.png" width="96" alt="ScreenRecall icon" />
</p>

# ScreenRecall

![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111111)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Local First](https://img.shields.io/badge/Runtime-local--first-1B7F79)
![License](https://img.shields.io/badge/License-MIT-green.svg)

ScreenRecall is a local-first desktop MVP that watches your current screen in the background, detects information-dense key moments, and saves a key-frame image with an optional Live Photo style WebM clip around the moment.

![ScreenRecall dashboard](docs/images/screenrecall-dashboard.png)

## Highlights

- Local screen capture and analysis with no cloud API calls at runtime.
- Live Photo style capture: save the key frame plus a short WebM clip around it.
- 15 second in-memory rolling video cache; clips are written only after a key moment is confirmed.
- Heuristic key-screen detection based on visual density, structured edges, stability, and local OCR/text signals.
- Background mode with tray controls and close-to-hide behavior.
- Settings for image path, video path, Live Photo, language, capture state, and excluded app names.
- English and Simplified Chinese UI.
- Windows and macOS desktop shell through Electron.

## Requirements

- Node.js 20+
- npm
- Windows 10/11 or macOS

macOS users must grant Screen Recording permission before capture can start.

## Quick Start

```bash
git clone https://github.com/tangguo95/ScreenRecall.git
cd ScreenRecall
npm install
npm run dev
```

Build the production bundles:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Usage

1. Start ScreenRecall.
2. Click **Start** to begin background capture.
3. Keep working, watching a stream, reading a slide deck, or browsing a tutorial.
4. When ScreenRecall detects a key information screen, it saves:
   - `PNG` key frame image.
   - `WebM` Live Photo clip when Live Photo is enabled.
   - Local JSON metadata with trigger reasons, OCR/text signal, paths, source, language, and similarity hash.

Default save layout:

```text
{imageSaveDir}/YYYY-MM-DD/{timestamp}.png
{videoSaveDir}/YYYY-MM-DD/{timestamp}.webm
```

## Project Structure

```text
ScreenRecall/
├─ assets/icons/              # App icon PNG/ICO/ICNS assets
├─ docs/images/               # Public README screenshots
├─ src/main/                  # Electron main process, tray, IPC, local services
├─ src/preload/               # Safe renderer bridge
├─ src/renderer/              # React UI and capture engine
├─ src/shared/                # Shared types, ring buffer, analysis, dedupe logic
└─ src/tests/                 # Vitest unit tests
```

## Privacy and Security Notes

- ScreenRecall is designed for local operation. Screen frames, generated clips, OCR, and metadata stay on the device.
- The MVP does not upload screen content, does not use accounts, and does not call online AI/OCR/transcoding services at runtime.
- OCR uses local Tesseract language data packages bundled from npm dependencies.
- Excluded apps are matched by local foreground app names. Treat this as a practical MVP safeguard, not a complete data-loss-prevention system.
- Live Photo clips are WebM in this MVP. MP4 export can be added later with a bundled local FFmpeg path.

## Validation

Current local validation includes:

- Unit tests for ring-buffer retention, similarity dedupe, and key-frame analysis.
- Windows end-to-end validation for:
  - language switching
  - Live Photo image + WebM creation
  - pause and resume
  - close-to-background behavior
  - image-only mode when Live Photo is disabled
  - excluded-app blocking

macOS support is implemented through Electron's desktop capture path, but macOS still needs separate real-machine validation because Screen Recording permission behavior is platform-specific.

## FAQ

### Does ScreenRecall constantly save my screen?

No. It keeps a short rolling video cache in memory and writes files only when a key screen is detected.

### Does it depend on cloud AI or online OCR?

No. Runtime capture, analysis, OCR, metadata, and save operations are local.

### Why WebM instead of MP4?

Electron/Chromium can produce WebM locally without an external encoder. MP4 requires bundling a local transcoder such as FFmpeg.

### Can it detect every important moment?

Not yet. The MVP focuses on common information-heavy screens such as tables, slides, documentation pages, error dialogs, and game equipment/status screens. Detection quality should improve with more local signals and user feedback.

## Contributing

Issues and pull requests are welcome. Please keep privacy-sensitive behavior local-first and avoid adding cloud dependencies to core capture, OCR, or transcoding paths.

## AI-assisted Development

This project was designed, implemented, documented, and polished with the assistance of OpenAI Codex, under the author's direction and review.

## Contact

Maintained by [tangguo95](https://github.com/tangguo95).

## License

MIT License. See [LICENSE](LICENSE) for details.
