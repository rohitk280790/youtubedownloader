const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories & Binary Resolution
const BIN_DIR = path.join(__dirname, 'bin');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

let YTDLP_PATH = 'yt-dlp';
let FFMPEG_LOCATION = null;

const localWinYtDlp = path.join(BIN_DIR, 'yt-dlp.exe');
const localWinFFmpeg = path.join(BIN_DIR, 'ffmpeg.exe');

if (process.platform === 'win32' && fs.existsSync(localWinYtDlp)) {
  YTDLP_PATH = localWinYtDlp;
  FFMPEG_LOCATION = BIN_DIR;
} else if (fs.existsSync(path.join(BIN_DIR, 'yt-dlp'))) {
  YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp');
  FFMPEG_LOCATION = BIN_DIR;
}

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// In-memory jobs tracking
const jobs = new Map();

// Helper to cleanup old files (> 20 mins)
function cleanupOldFiles() {
  try {
    const now = Date.now();
    const files = fs.readdirSync(DOWNLOADS_DIR);
    for (const file of files) {
      const filePath = path.join(DOWNLOADS_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 20 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    }
    // Also clean old jobs
    for (const [id, job] of jobs.entries()) {
      if (now - job.createdAt > 30 * 60 * 1000) {
        jobs.delete(id);
      }
    }
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }
}
setInterval(cleanupOldFiles, 10 * 60 * 1000);

// Node executable path for yt-dlp JS runtime
const NODE_PATH = process.execPath;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Format duration in seconds to HH:MM:SS or MM:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format numbers (e.g. view count)
function formatViews(views) {
  if (!views || isNaN(views)) return 'N/A';
  if (views >= 1000000000) return (views / 1000000000).toFixed(1) + 'B';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
  if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
  return views.toLocaleString();
}

// Format bytes
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Sanitize filename for safe download headers
function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim();
}

// Validate YouTube URL
function isValidYouTubeUrl(url) {
  const pattern = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/.+$/i;
  return pattern.test(url);
}

// 1. Endpoint: Get Video Info & Available Qualities
app.post('/api/info', (req, res) => {
  const { url } = req.body;
  if (!url || !isValidYouTubeUrl(url.trim())) {
    return res.status(400).json({ error: 'Please provide a valid YouTube video URL.' });
  }

  const cleanUrl = url.trim();
  const args = [
    '--dump-json',
    '--no-playlist',
    '--js-runtimes', `node:${NODE_PATH}`
  ];
  if (FFMPEG_LOCATION) {
    args.push('--ffmpeg-location', FFMPEG_LOCATION);
  }
  args.push(cleanUrl);

  execFile(YTDLP_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error('yt-dlp info error:', stderr || error.message);
      return res.status(500).json({
        error: 'Failed to fetch video information. Please ensure the video is public and URL is correct.'
      });
    }

    try {
      const data = JSON.parse(stdout);
      const formats = data.formats || [];

      // Available target resolutions
      const standardResolutions = [
        { height: 2160, label: '4K Ultra HD (2160p)', quality: '2160', badge: '4K UHD' },
        { height: 1440, label: '2K Quad HD (1440p)', quality: '1440', badge: '2K QHD' },
        { height: 1080, label: 'Full HD (1080p)', quality: '1080', badge: '1080p FHD' },
        { height: 720, label: 'High Definition (720p)', quality: '720', badge: '720p HD' },
        { height: 480, label: 'Standard Definition (480p)', quality: '480', badge: '480p SD' },
        { height: 360, label: 'Standard Definition (360p)', quality: '360', badge: '360p' },
        { height: 240, label: 'Low Quality (240p)', quality: '240', badge: '240p' },
        { height: 144, label: 'Minimum (144p)', quality: '144', badge: '144p' },
      ];

      // Find best audio stream size to add to video size estimates
      let bestAudioSize = 0;
      let bestAudioBitrate = 0;
      formats.forEach(f => {
        if (f.vcodec === 'none' && f.acodec !== 'none') {
          const sz = f.filesize || f.filesize_approx || 0;
          if (sz > bestAudioSize) bestAudioSize = sz;
          if (f.abr && f.abr > bestAudioBitrate) bestAudioBitrate = f.abr;
        }
      });

      // Filter available video heights
      const availableVideoHeights = new Set();
      formats.forEach(f => {
        if (f.height && f.vcodec !== 'none') {
          availableVideoHeights.add(f.height);
        }
      });

      const videoOptions = [];
      standardResolutions.forEach(resItem => {
        // Find if this video has a format matching or close to this height
        const hasFormat = Array.from(availableVideoHeights).some(h => h >= resItem.height - 30 && h <= resItem.height + 30);
        if (hasFormat) {
          // Find matching format for approximate filesize
          const matchingFormats = formats.filter(f => f.height && Math.abs(f.height - resItem.height) <= 30 && f.vcodec !== 'none');
          let estSize = 0;
          let fps = 30;
          matchingFormats.forEach(f => {
            const vSize = f.filesize || f.filesize_approx || 0;
            if (vSize > estSize) estSize = vSize;
            if (f.fps && f.fps > fps) fps = f.fps;
          });

          // Total estimated size = video size + audio size
          const totalSize = estSize ? (estSize + bestAudioSize) : null;

          videoOptions.push({
            quality: resItem.quality,
            height: resItem.height,
            label: `${resItem.label} ${fps > 30 ? `(${fps}fps)` : ''}`,
            badge: resItem.badge,
            fps: fps,
            ext: 'mp4',
            formatType: 'video',
            estimatedSize: totalSize ? formatBytes(totalSize) : 'Unknown'
          });
        }
      });

      // Audio options
      const audioOptions = [
        {
          quality: 'mp3_320',
          label: 'MP3 Audio (High Quality 320 kbps)',
          badge: 'MP3 320k',
          ext: 'mp3',
          formatType: 'audio',
          estimatedSize: bestAudioSize ? formatBytes(bestAudioSize) : '~5 - 15 MB'
        },
        {
          quality: 'mp3_192',
          label: 'MP3 Audio (Standard 192 kbps)',
          badge: 'MP3 192k',
          ext: 'mp3',
          formatType: 'audio',
          estimatedSize: bestAudioSize ? formatBytes(bestAudioSize * 0.7) : '~3 - 8 MB'
        },
        {
          quality: 'm4a',
          label: 'M4A / AAC Audio (Original YouTube Bitrate)',
          badge: 'M4A Original',
          ext: 'm4a',
          formatType: 'audio',
          estimatedSize: bestAudioSize ? formatBytes(bestAudioSize) : '~4 - 10 MB'
        }
      ];

      return res.json({
        id: data.id,
        title: data.title,
        thumbnail: data.thumbnail,
        duration: formatDuration(data.duration),
        durationRaw: data.duration,
        channel: data.uploader || data.channel || 'Unknown Channel',
        views: formatViews(data.view_count),
        uploadDate: data.upload_date ? `${data.upload_date.slice(0, 4)}-${data.upload_date.slice(4, 6)}-${data.upload_date.slice(6, 8)}` : null,
        videoOptions,
        audioOptions
      });
    } catch (e) {
      console.error('Failed to parse yt-dlp output:', e);
      return res.status(500).json({ error: 'Failed to parse video details.' });
    }
  });
});

// 2. Endpoint: Start Download Job
app.post('/api/download/start', (req, res) => {
  const { url, quality, formatType, title } = req.body;
  if (!url || !quality) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const jobId = Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
  const outTemplate = path.join(DOWNLOADS_DIR, `${jobId}.%(ext)s`);

  let targetExt = 'mp4';
  const args = [
    '--newline',
    '--no-playlist',
    '--js-runtimes', `node:${NODE_PATH}`,
    '--progress-template', '%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._total_bytes_str)s',
    '-o', outTemplate
  ];
  if (FFMPEG_LOCATION) {
    args.push('--ffmpeg-location', FFMPEG_LOCATION);
  }

  if (formatType === 'audio') {
    if (quality === 'mp3_320') {
      targetExt = 'mp3';
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else if (quality === 'mp3_192') {
      targetExt = 'mp3';
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '2');
    } else {
      targetExt = 'm4a';
      args.push('-x', '--audio-format', 'm4a');
    }
  } else {
    // Video quality: heights like 2160, 1440, 1080, 720, 480, 360
    targetExt = 'mp4';
    const h = parseInt(quality, 10);
    args.push(
      '-f', `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
      '--merge-output-format', 'mp4'
    );
  }

  args.push(url.trim());

  const job = {
    id: jobId,
    url,
    quality,
    formatType,
    title: title || 'YouTube Video',
    targetExt,
    status: 'downloading',
    percent: 0,
    speed: '',
    eta: '',
    error: null,
    finalFile: null,
    createdAt: Date.now(),
    subscribers: []
  };

  jobs.set(jobId, job);

  // Helper to notify SSE subscribers
  const notifySubscribers = () => {
    const payload = JSON.stringify({
      status: job.status,
      percent: job.percent,
      speed: job.speed,
      eta: job.eta,
      error: job.error,
      downloadUrl: job.status === 'completed' ? `/api/download/file/${jobId}` : null
    });
    job.subscribers.forEach(sub => {
      sub.write(`data: ${payload}\n\n`);
    });
  };

  const child = spawn(YTDLP_PATH, args);

  child.stdout.on('data', (data) => {
    const lines = data.toString().split(/[\r\n]+/);
    for (const line of lines) {
      if (!line.trim()) continue;
      // Progress template: "%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._total_bytes_str)s"
      if (line.includes('|')) {
        const parts = line.split('|');
        if (parts.length >= 3) {
          const rawPct = parts[0].replace('%', '').trim();
          const pct = parseFloat(rawPct);
          if (!isNaN(pct)) {
            job.percent = Math.min(100, Math.max(job.percent, pct));
          }
          job.speed = parts[1].trim() || job.speed;
          job.eta = parts[2].trim() || job.eta;
          job.status = 'downloading';
          notifySubscribers();
        }
      } else if (line.toLowerCase().includes('merging') || line.toLowerCase().includes('destination:')) {
        if (job.percent >= 98) {
          job.status = 'processing';
          notifySubscribers();
        }
      }
    }
  });

  child.stderr.on('data', (data) => {
    const errText = data.toString();
    console.warn(`[yt-dlp job ${jobId} stderr]:`, errText.trim());
    if (errText.toLowerCase().includes('merging') || errText.toLowerCase().includes('extractaudio')) {
      job.status = 'processing';
      notifySubscribers();
    }
  });

  child.on('close', (code) => {
    if (code === 0) {
      // Find output file matching jobId
      try {
        const files = fs.readdirSync(DOWNLOADS_DIR);
        const matched = files.find(f => f.startsWith(jobId));
        if (matched) {
          job.finalFile = path.join(DOWNLOADS_DIR, matched);
          job.status = 'completed';
          job.percent = 100;
          notifySubscribers();
          return;
        }
      } catch (err) {
        console.error('File search error:', err);
      }
      job.status = 'error';
      job.error = 'Downloaded file could not be located.';
      notifySubscribers();
    } else {
      job.status = 'error';
      job.error = `Download process finished with error code ${code}.`;
      notifySubscribers();
    }
  });

  return res.json({ jobId });
});

// 3. Endpoint: SSE Progress Stream
app.get('/api/download/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  job.subscribers.push(res);

  // Send initial state
  res.write(`data: ${JSON.stringify({
    status: job.status,
    percent: job.percent,
    speed: job.speed,
    eta: job.eta,
    error: job.error,
    downloadUrl: job.status === 'completed' ? `/api/download/file/${jobId}` : null
  })}\n\n`);

  req.on('close', () => {
    job.subscribers = job.subscribers.filter(sub => sub !== res);
  });
});

// 4. Endpoint: Polling Status (Fallback)
app.get('/api/download/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  return res.json({
    status: job.status,
    percent: job.percent,
    speed: job.speed,
    eta: job.eta,
    error: job.error,
    downloadUrl: job.status === 'completed' ? `/api/download/file/${jobId}` : null
  });
});

// 5. Endpoint: File Download
app.get('/api/download/file/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || !job.finalFile || !fs.existsSync(job.finalFile)) {
    return res.status(404).send('File not found or expired.');
  }

  const fileExt = path.extname(job.finalFile) || `.${job.targetExt}`;
  const safeName = `${sanitizeFilename(job.title)}${fileExt}`;

  res.download(job.finalFile, safeName, (err) => {
    if (err) {
      console.error('Error sending file download:', err.message);
    }
    // Delete file after 5 minutes of completed download to save disk space
    setTimeout(() => {
      try {
        if (fs.existsSync(job.finalFile)) {
          fs.unlinkSync(job.finalFile);
        }
      } catch (e) {}
    }, 5 * 60 * 1000);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(` YouTube Downloader Server running on:`);
  console.log(` http://localhost:${PORT}`);
  console.log(` (Environment: ${process.platform}, Port: ${PORT})`);
  console.log(`===============================================`);
});
