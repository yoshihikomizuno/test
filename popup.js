// Popup script for Kindle Auto Screenshot extension

class PopupController {
  constructor() {
    this.isCapturing = false;
    this.screenshots = [];
    this.currentPage = 0;
    this.totalPages = 0;

    this.initElements();
    this.loadSettings();
    this.setupEventListeners();
    this.checkTabStatus();
  }

  initElements() {
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.downloadBtn = document.getElementById('downloadBtn');
    this.startPageInput = document.getElementById('startPage');
    this.endPageInput = document.getElementById('endPage');
    this.delayInput = document.getElementById('delay');
    this.qualityInput = document.getElementById('quality');
    this.statusEl = document.getElementById('status');
    this.progressContainer = document.getElementById('progressContainer');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this.previewContainer = document.getElementById('preview-container');
    this.preview = document.getElementById('preview');
  }

  loadSettings() {
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        this.startPageInput.value = result.settings.startPage || 1;
        this.endPageInput.value = result.settings.endPage || 10;
        this.delayInput.value = result.settings.delay || 1000;
        this.qualityInput.value = result.settings.quality || 0.92;
      }
    });

    // Load saved screenshots if any
    chrome.storage.local.get(['screenshots'], (result) => {
      if (result.screenshots && result.screenshots.length > 0) {
        this.screenshots = result.screenshots;
        this.updatePreview();
        this.downloadBtn.disabled = false;
      }
    });
  }

  saveSettings() {
    const settings = {
      startPage: parseInt(this.startPageInput.value),
      endPage: parseInt(this.endPageInput.value),
      delay: parseInt(this.delayInput.value),
      quality: parseFloat(this.qualityInput.value)
    };
    chrome.storage.local.set({ settings });
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startCapture());
    this.stopBtn.addEventListener('click', () => this.stopCapture());
    this.downloadBtn.addEventListener('click', () => this.downloadPDF());

    // Save settings on change
    [this.startPageInput, this.endPageInput, this.delayInput, this.qualityInput]
      .forEach(input => {
        input.addEventListener('change', () => this.saveSettings());
      });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message);
    });
  }

  async checkTabStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        this.setStatus('タブが見つかりません', 'error');
        this.startBtn.disabled = true;
        return;
      }

      const isKindlePage = tab.url && (
        tab.url.includes('read.amazon.co.jp') ||
        tab.url.includes('read.amazon.com')
      );

      if (!isKindlePage) {
        this.setStatus('Kindle Cloud Readerを開いてください', 'error');
        this.startBtn.disabled = true;
      } else {
        this.setStatus('準備完了', '');
        this.startBtn.disabled = false;
      }
    } catch (error) {
      console.error('Tab check error:', error);
      this.setStatus('エラー: ' + error.message, 'error');
    }
  }

  async startCapture() {
    this.saveSettings();

    const startPage = parseInt(this.startPageInput.value);
    const endPage = parseInt(this.endPageInput.value);
    const delay = parseInt(this.delayInput.value);
    const quality = parseFloat(this.qualityInput.value);

    if (startPage > endPage) {
      this.setStatus('開始ページは終了ページ以下にしてください', 'error');
      return;
    }

    this.isCapturing = true;
    this.screenshots = [];
    this.currentPage = 0;
    this.totalPages = endPage - startPage + 1;

    // Clear saved screenshots
    chrome.storage.local.remove(['screenshots']);

    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.downloadBtn.disabled = true;
    this.progressContainer.style.display = 'block';
    this.previewContainer.style.display = 'none';
    this.preview.innerHTML = '';

    this.updateProgress(0, this.totalPages);
    this.setStatus('キャプチャ中...', 'running');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Send message to content script to start capture
      chrome.tabs.sendMessage(tab.id, {
        action: 'startCapture',
        settings: {
          startPage,
          endPage,
          delay,
          quality
        }
      });
    } catch (error) {
      console.error('Start capture error:', error);
      this.setStatus('エラー: ' + error.message, 'error');
      this.resetUI();
    }
  }

  async stopCapture() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'stopCapture' });
    } catch (error) {
      console.error('Stop capture error:', error);
    }

    this.isCapturing = false;
    this.setStatus('キャプチャを停止しました', '');
    this.resetUI();
  }

  handleMessage(message) {
    switch (message.type) {
      case 'captureProgress':
        this.currentPage = message.current;
        this.updateProgress(message.current, message.total);
        this.setStatus(`ページ ${message.current} / ${message.total} をキャプチャ中...`, 'running');
        break;

      case 'screenshotCaptured':
        this.screenshots.push(message.data);
        this.addPreviewImage(message.data);
        break;

      case 'captureComplete':
        this.isCapturing = false;
        this.screenshots = message.screenshots;
        this.setStatus(`完了！ ${this.screenshots.length} ページをキャプチャしました`, 'success');
        this.resetUI();
        this.downloadBtn.disabled = false;
        this.previewContainer.style.display = 'block';

        // Save screenshots to storage
        chrome.storage.local.set({ screenshots: this.screenshots });
        break;

      case 'captureError':
        this.isCapturing = false;
        this.setStatus('エラー: ' + message.error, 'error');
        this.resetUI();
        break;

      case 'captureStopped':
        this.isCapturing = false;
        if (this.screenshots.length > 0) {
          this.downloadBtn.disabled = false;
          chrome.storage.local.set({ screenshots: this.screenshots });
        }
        this.setStatus(`停止しました (${this.screenshots.length} ページ保存済み)`, '');
        this.resetUI();
        break;
    }
  }

  updateProgress(current, total) {
    const percent = total > 0 ? (current / total) * 100 : 0;
    this.progressFill.style.width = `${percent}%`;
    this.progressText.textContent = `${current} / ${total}`;
  }

  addPreviewImage(dataUrl) {
    this.previewContainer.style.display = 'block';
    const img = document.createElement('img');
    img.src = dataUrl;
    this.preview.appendChild(img);
  }

  updatePreview() {
    this.preview.innerHTML = '';
    this.screenshots.forEach(dataUrl => {
      const img = document.createElement('img');
      img.src = dataUrl;
      this.preview.appendChild(img);
    });
    if (this.screenshots.length > 0) {
      this.previewContainer.style.display = 'block';
    }
  }

  setStatus(text, className) {
    this.statusEl.textContent = text;
    this.statusEl.className = 'status ' + className;
  }

  resetUI() {
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
  }

  async downloadPDF() {
    if (this.screenshots.length === 0) {
      this.setStatus('保存するスクリーンショットがありません', 'error');
      return;
    }

    this.setStatus('PDFを生成中...', 'running');
    this.downloadBtn.disabled = true;

    try {
      // Send message to background script to generate PDF
      chrome.runtime.sendMessage({
        action: 'generatePDF',
        screenshots: this.screenshots
      }, (response) => {
        if (response && response.success) {
          this.setStatus('PDFをダウンロードしました！', 'success');
        } else {
          this.setStatus('PDF生成エラー: ' + (response?.error || '不明なエラー'), 'error');
        }
        this.downloadBtn.disabled = false;
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      this.setStatus('PDF生成エラー: ' + error.message, 'error');
      this.downloadBtn.disabled = false;
    }
  }
}

// Initialize popup controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
