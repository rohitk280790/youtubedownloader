document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const fetchBtn = document.getElementById('fetchBtn');
  const fetchSpinner = document.getElementById('fetchSpinner');
  const btnText = fetchBtn.querySelector('.btn-text');
  
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');
  
  const resultsSection = document.getElementById('resultsSection');
  const videoThumb = document.getElementById('videoThumb');
  const videoDuration = document.getElementById('videoDuration');
  const videoTitle = document.getElementById('videoTitle');
  const videoChannel = document.getElementById('videoChannel');
  const videoViews = document.getElementById('videoViews');
  const videoDate = document.getElementById('videoDate');
  const videoDateWrapper = document.getElementById('videoDateWrapper');
  
  const tabVideo = document.getElementById('tabVideo');
  const tabAudio = document.getElementById('tabAudio');
  const videoFormatsTab = document.getElementById('videoFormatsTab');
  const audioFormatsTab = document.getElementById('audioFormatsTab');
  const videoFormatsBody = document.getElementById('videoFormatsBody');
  const audioFormatsBody = document.getElementById('audioFormatsBody');
  
  // Modal Elements
  const downloadModal = document.getElementById('downloadModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalHeading = document.getElementById('modalHeading');
  const modalSub = document.getElementById('modalSub');
  const modalQualityBadge = document.getElementById('modalQualityBadge');
  const modalVideoTitle = document.getElementById('modalVideoTitle');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercent = document.getElementById('progressPercent');
  const progressSpeed = document.getElementById('progressSpeed');
  const progressEta = document.getElementById('progressEta');
  const modalStatusText = document.getElementById('modalStatusText');
  const modalSuccessBox = document.getElementById('modalSuccessBox');
  const directSaveBtn = document.getElementById('directSaveBtn');
  const progressSpinner = document.getElementById('progressSpinner');

  let currentVideoData = null;
  let activeEventSource = null;
  let activePollInterval = null;

  // Paste from clipboard
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        urlInput.focus();
      }
    } catch (e) {
      console.warn('Clipboard read failed:', e);
      urlInput.focus();
    }
  });

  // Sample chips
  document.querySelectorAll('.sample-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const sampleUrl = chip.getAttribute('data-url');
      urlInput.value = sampleUrl;
      urlForm.dispatchEvent(new Event('submit'));
    });
  });

  // Tab switching
  tabVideo.addEventListener('click', () => {
    tabVideo.classList.add('active');
    tabAudio.classList.remove('active');
    videoFormatsTab.classList.add('active');
    audioFormatsTab.classList.remove('active');
  });

  tabAudio.addEventListener('click', () => {
    tabAudio.classList.add('active');
    tabVideo.classList.remove('active');
    audioFormatsTab.classList.add('active');
    videoFormatsTab.classList.remove('active');
  });

  // Show / Hide Error
  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.classList.remove('hidden');
  }
  function hideError() {
    errorBanner.classList.add('hidden');
    errorMessage.textContent = '';
  }

  // Set loading state for fetch
  function setLoading(isLoading) {
    if (isLoading) {
      fetchBtn.disabled = true;
      btnText.textContent = 'Fetching...';
      fetchSpinner.classList.remove('hidden');
      hideError();
    } else {
      fetchBtn.disabled = false;
      btnText.textContent = 'Fetch Options';
      fetchSpinner.classList.add('hidden');
    }
  }

  // Handle Form Submission
  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    setLoading(true);
    resultsSection.classList.add('hidden');

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch video details.');
      }

      currentVideoData = { ...data, inputUrl: url };
      renderVideoDetails(currentVideoData);
      resultsSection.classList.remove('hidden');
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      showError(err.message || 'Network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // Helper for badge color based on quality
  function getBadgeClass(quality, formatType) {
    if (formatType === 'audio') return 'badge-purple';
    const q = parseInt(quality, 10);
    if (q >= 2160) return 'badge-gold';
    if (q >= 1440) return 'badge-gold';
    if (q >= 1080) return 'badge-blue';
    if (q >= 720) return 'badge-green';
    return 'badge-default';
  }

  // Render Video Preview & Tables
  function renderVideoDetails(data) {
    videoThumb.src = data.thumbnail;
    videoDuration.textContent = data.duration;
    videoTitle.textContent = data.title;
    videoChannel.textContent = data.channel;
    videoViews.textContent = `${data.views} views`;

    if (data.uploadDate) {
      videoDate.textContent = `Uploaded ${data.uploadDate}`;
      videoDateWrapper.style.display = 'flex';
    } else {
      videoDateWrapper.style.display = 'none';
    }

    // Render Video Formats
    videoFormatsBody.innerHTML = '';
    if (data.videoOptions && data.videoOptions.length > 0) {
      data.videoOptions.forEach(opt => {
        const row = document.createElement('tr');
        const badgeClass = getBadgeClass(opt.quality, 'video');
        
        row.innerHTML = `
          <td>
            <span class="quality-badge ${badgeClass}">${opt.badge}</span>
            <strong>${opt.label}</strong>
          </td>
          <td><span class="format-ext">${opt.ext}</span></td>
          <td><span class="file-size">${opt.estimatedSize}</span></td>
          <td>
            <button class="btn-download-action" data-quality="${opt.quality}" data-type="video" data-badge="${opt.badge} ${opt.ext.toUpperCase()}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download</span>
            </button>
          </td>
        `;
        videoFormatsBody.appendChild(row);
      });
    } else {
      videoFormatsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dim);">No video streams found.</td></tr>';
    }

    // Render Audio Formats
    audioFormatsBody.innerHTML = '';
    if (data.audioOptions && data.audioOptions.length > 0) {
      data.audioOptions.forEach(opt => {
        const row = document.createElement('tr');
        const badgeClass = getBadgeClass(opt.quality, 'audio');

        row.innerHTML = `
          <td>
            <span class="quality-badge ${badgeClass}">${opt.badge}</span>
            <strong>${opt.label}</strong>
          </td>
          <td><span class="format-ext">${opt.ext}</span></td>
          <td><span class="file-size">${opt.estimatedSize}</span></td>
          <td>
            <button class="btn-download-action" data-quality="${opt.quality}" data-type="audio" data-badge="${opt.badge}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download</span>
            </button>
          </td>
        `;
        audioFormatsBody.appendChild(row);
      });
    }

    // Attach click listeners to download buttons
    document.querySelectorAll('.btn-download-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const quality = btn.getAttribute('data-quality');
        const formatType = btn.getAttribute('data-type');
        const badge = btn.getAttribute('data-badge');
        triggerDownload(quality, formatType, badge);
      });
    });
  }

  // Modal Close
  function closeModal() {
    downloadModal.classList.add('hidden');
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    if (activePollInterval) {
      clearInterval(activePollInterval);
      activePollInterval = null;
    }
  }

  modalCloseBtn.addEventListener('click', closeModal);
  downloadModal.addEventListener('click', (e) => {
    if (e.target === downloadModal) closeModal();
  });

  // Trigger Download Flow
  async function triggerDownload(quality, formatType, badge) {
    if (!currentVideoData) return;

    // Reset Modal UI
    modalQualityBadge.textContent = badge;
    modalVideoTitle.textContent = currentVideoData.title;
    modalHeading.textContent = 'Preparing Download...';
    modalSub.textContent = formatType === 'audio' ? 'Extracting high quality audio stream' : 'Merging high quality video & audio via FFmpeg';
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressSpeed.textContent = '';
    progressEta.textContent = '';
    modalStatusText.textContent = 'Connecting to YouTube servers...';
    modalSuccessBox.classList.add('hidden');
    progressSpinner.classList.remove('hidden');
    downloadModal.classList.remove('hidden');

    try {
      // 1. Request server to start job
      const startRes = await fetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: currentVideoData.inputUrl,
          quality,
          formatType,
          title: currentVideoData.title
        })
      });

      const startData = await startRes.json();
      if (!startRes.ok) {
        throw new Error(startData.error || 'Failed to start download job.');
      }

      const jobId = startData.jobId;
      startProgressTracking(jobId);

    } catch (err) {
      modalHeading.textContent = 'Download Failed';
      modalStatusText.textContent = err.message || 'An error occurred during download.';
      progressSpinner.classList.add('hidden');
    }
  }

  // Track progress with SSE & polling fallback
  function startProgressTracking(jobId) {
    if (activeEventSource) activeEventSource.close();
    if (activePollInterval) clearInterval(activePollInterval);

    try {
      activeEventSource = new EventSource(`/api/download/progress/${jobId}`);

      activeEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          updateProgressUI(data);
        } catch (e) {
          console.error('Error parsing progress data:', e);
        }
      };

      activeEventSource.onerror = () => {
        console.warn('SSE encountered connection interruption. Switching to polling fallback...');
        if (activeEventSource) {
          activeEventSource.close();
          activeEventSource = null;
        }
        fallbackPolling(jobId);
      };
    } catch (e) {
      fallbackPolling(jobId);
    }
  }

  function fallbackPolling(jobId) {
    if (activePollInterval) clearInterval(activePollInterval);
    activePollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/download/status/${jobId}`);
        if (!res.ok) throw new Error('Job status check failed');
        const data = await res.json();
        updateProgressUI(data);
        if (data.status === 'completed' || data.status === 'error') {
          clearInterval(activePollInterval);
          activePollInterval = null;
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 1000);
  }

  function updateProgressUI(data) {
    if (data.error) {
      modalHeading.textContent = 'Download Error';
      modalStatusText.textContent = data.error;
      progressSpinner.classList.add('hidden');
      if (activeEventSource) activeEventSource.close();
      if (activePollInterval) clearInterval(activePollInterval);
      return;
    }

    const pct = Math.min(100, Math.max(0, data.percent || 0));
    progressBarFill.style.width = `${pct}%`;
    progressPercent.textContent = `${Math.round(pct)}%`;

    if (data.speed) {
      progressSpeed.textContent = `Speed: ${data.speed}`;
    }
    if (data.eta) {
      progressEta.textContent = `ETA: ${data.eta}`;
    }

    if (data.status === 'downloading') {
      modalHeading.textContent = 'Downloading Streams...';
      modalStatusText.textContent = `Fetching chunks from YouTube at ${data.speed || 'high speed'}...`;
    } else if (data.status === 'processing') {
      progressBarFill.style.width = '100%';
      progressPercent.textContent = '100%';
      modalHeading.textContent = 'Merging & Finalizing...';
      modalStatusText.textContent = 'FFmpeg is merging video & audio into full quality MP4...';
    } else if (data.status === 'completed') {
      if (activeEventSource) activeEventSource.close();
      if (activePollInterval) clearInterval(activePollInterval);

      progressBarFill.style.width = '100%';
      progressPercent.textContent = '100%';
      progressSpinner.classList.add('hidden');
      modalHeading.textContent = 'Download Ready!';
      modalStatusText.textContent = 'File prepared successfully.';

      if (data.downloadUrl) {
        directSaveBtn.href = data.downloadUrl;
        modalSuccessBox.classList.remove('hidden');

        // Automatically trigger browser download
        const hiddenLink = document.createElement('a');
        hiddenLink.href = data.downloadUrl;
        hiddenLink.setAttribute('download', '');
        document.body.appendChild(hiddenLink);
        hiddenLink.click();
        hiddenLink.remove();
      }
    }
  }
});
