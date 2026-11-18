# YouTube Multi-Quality Video Downloader (YTStreamDL)

A web application that takes any YouTube video or Shorts URL and provides downloads in various resolutions (4K, 1440p, 1080p Full HD, 720p HD, 480p, 360p) and audio formats (MP3 320k, MP3 192k, M4A).

## Features

- **Multi-Resolution Video Downloads**:
  - **4K Ultra HD (2160p)** (up to 60fps)
  - **2K Quad HD (1440p)** (up to 60fps)
  - **1080p Full HD** (up to 60fps)
  - **720p HD**
  - **480p & 360p Standard Definition**
  - **240p & 144p Compact / Low Bandwidth**
- **Audio Extraction**:
  - High Quality MP3 (320 kbps)
  - Standard MP3 (192 kbps)
  - Native M4A / AAC Audio
- **Seamless Video + Audio Merging**: YouTube separates high-resolution video and audio streams. This app uses embedded **yt-dlp** and **FFmpeg** to merge them into complete, synchronized MP4 files.
- **Real-Time Progress Tracking**: Live Server-Sent Events (SSE) display downloading speed, percentage, ETA, and merging stage.
- **Modern Dark UI**: Glassmorphism design, thumbnail preview, channel details, view counter, duration, and one-click paste support.

## Project Structure

```
yt-downloader-app/
├── bin/
│   ├── yt-dlp.exe      # Embedded latest yt-dlp binary
│   └── ffmpeg.exe      # Embedded FFmpeg binary for audio/video merging
├── downloads/          # Temporary buffer directory (auto-cleaned)
├── public/
│   ├── index.html      # Frontend HTML
│   ├── style.css       # Dark mode theme & animations
│   └── app.js          # Interactive UI and SSE progress client
├── server.js           # Express API server
└── package.json
```

## How to Run

1. Open your terminal in this directory:
   ```powershell
   cd C:\Users\GGSF\.gemini\antigravity\scratch\yt-downloader-app
   ```
2. Start the server:
   ```bash
   node server.js
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
