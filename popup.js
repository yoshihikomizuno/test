// Popup script for Kindle Auto Screenshot extension

class PopupController {
  constructor() {
    this.isCapturing = false;
    this.screenshots = [];
    this.currentPage = 0;
    this.totalPages = 0;
    this.bookTitle = '';
    this.totalPageCount = null;

    this.initElements();
    this.loadSettings();
    this.setupEventListeners();
    this.checkTabStatus();
  }

  initElements() {
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.downloadBtn = document.getElementById('downloadBtn');
    this.allPagesBtn = document.getElementById('allPagesBtn');
    this.startPageInput = document.getElementById('startPage');
    this.endPageInput = document.getElementById('endPage');
    this.qualitySelect = document.getElementById('quality');
    this.statusEl = document.getElementById('status');
    this.progressContainer = document.getElementById('progressContainer');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this.previewContainer = document.getElementById('preview-container');
    this.preview = document.getElementById('preview');
    this.previewCount = document.getElementById('previewCount');
    this.bookInfoEl = document.getElementById('book-info');
    this.bookTitleEl = document.getElementById('bookTitle');
    this.fileSizeContainer = document.getElementById('file-size-container');
    this.estimatedSizeEl = document.getElementById('estimatedSize');
  }

  loadSettings() {
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        this.startPageInput.value = result.settings.startPage || 1;
        this.endPageInput.value = result.settings.endPage || 10;
        this.qualitySelect.value = result.settings.quality || 0.92;
      }
    });

    chrome.storage.local.get(['screenshots', 'bookTitle'], (result) => {
      if (result.screenshots && result.screenshots.length > 0) {
        this.screenshots = result.screenshots;
        this.bookTitle = result.bookTitle || '';
        this.updatePreview();
        this.downloadBtn.disabled = false;
        this.updateEstimatedSize();
      }
    });
  }

  saveSettings() {
    const settings = {
      startPage: parseInt(this.startPageInput.value),
      endPage: parseInt(this.endPageInput.value),
      quality: parseFloat(this.qualitySelect.value)
    };
    chrome.storage.local.set({ settings });
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startCapture());
    this.stopBtn.addEventListener('click', () => this.stopCapture());
    this.downloadBtn.addEventListener('click', () => this.downloadPDF());
    this.allPagesBtn.addEventListener('click', () => this.setAllPages());

    [this.startPageInput, this.endPageInput, this.qualitySelect]
      .forEach(input => {
        input.addEventListener('change', () => this.saveSettings());
      });

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
        this.allPagesBtn.disabled = true;
      } else {
        this.setStatus('準備完了', '');
        this.startBtn.disabled = false;
        this.getBookInfo(tab.id);
      }
    } catch (error) {
      console.error('Tab check error:', error);
      this.setStatus('エラー: ' + error.message, 'error');
    }
  }

  async getBookInfo(tabId) {
    try {
      chrome.tabs.sendMessage(tabId, { action: 'getBookInfo' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Content script not ready:', chrome.runtime.lastError.message);
          return;
        }
        if (response && response.success) {
          this.bookTitle = response.title || '';
          this.totalPageCount = response.totalPages;

          if (this.bookTitle) {
            this.bookTitleEl.textContent = this.bookTitle;
            this.bookInfoEl.style.display = 'block';
          }

          if (this.totalPageCount) {
            this.endPageInput.max = this.totalPageCount;
          }
        }
      });
    } catch (error) {
      console.log('Could not get book info:', error);
    }
  }

  async setAllPages() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'getBookInfo' }, (response) => {
        if (chrome.runtime.lastError) {
          this.setStatus('ページ情報を取得できません', 'error');
          return;
        }
        if (response && response.success && response.totalPages) {
          this.startPageInput.value = 1;
          this.endPageInput.value = response.totalPages;
          this.totalPageCount = response.totalPages;
          this.saveSettings();
          this.setStatus(`全${response.totalPages}ページを設定しました`, 'success');
        } else {
          this.setStatus('ページ数を取得できません', 'error');
        }
      });
    } catch (error) {
      this.setStatus('エラー: ' + error.message, 'error');
    }
  }

  async startCapture() {
    this.saveSettings();

    const startPage = parseInt(this.startPageInput.value);
    const endPage = parseInt(this.endPageInput.value);
    const quality = parseFloat(this.qualitySelect.value);

    if (startPage > endPage) {
      this.setStatus('開始ページは終了ページ以下にしてください', 'error');
      return;
    }

    this.isCapturing = true;
    this.screenshots = [];
    this.currentPage = 0;
    this.totalPages = endPage - startPage + 1;

    chrome.storage.local.remove(['screenshots', 'bookTitle']);

    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.downloadBtn.disabled = true;
    this.allPagesBtn.disabled = true;
    this.progressContainer.style.display = 'block';
    this.previewContainer.style.display = 'none';
    this.fileSizeContainer.style.display = 'none';
    this.preview.innerHTML = '';

    this.updateProgress(0, this.totalPages);
    this.setStatus('キャプチャ中...', 'running');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      chrome.tabs.sendMessage(tab.id, {
        action: 'startCapture',
        settings: {
          startPage,
          endPage,
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
        this.updateEstimatedSize();
        break;

      case 'captureComplete':
        this.isCapturing = false;
        this.screenshots = message.screenshots;
        this.bookTitle = message.bookTitle || this.bookTitle;
        this.setStatus(`完了！ ${this.screenshots.length} ページをキャプチャしました`, 'success');
        this.resetUI();
        this.downloadBtn.disabled = false;
        this.previewContainer.style.display = 'block';
        this.updateEstimatedSize();

        chrome.storage.local.set({
          screenshots: this.screenshots,
          bookTitle: this.bookTitle
        });
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
          this.updateEstimatedSize();
          chrome.storage.local.set({
            screenshots: this.screenshots,
            bookTitle: this.bookTitle
          });
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
    this.previewCount.textContent = `(${this.screenshots.length}枚)`;
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
      this.previewCount.textContent = `(${this.screenshots.length}枚)`;
    }
  }

  updateEstimatedSize() {
    if (this.screenshots.length === 0) {
      this.fileSizeContainer.style.display = 'none';
      return;
    }

    chrome.runtime.sendMessage({
      action: 'estimatePDFSize',
      screenshots: this.screenshots
    }, (response) => {
      if (response && response.success) {
        const sizeBytes = response.size;
        const sizeStr = this.formatFileSize(sizeBytes);
        this.estimatedSizeEl.textContent = sizeStr;
        this.fileSizeContainer.style.display = 'block';
      }
    });
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  setStatus(text, className) {
    this.statusEl.textContent = text;
    this.statusEl.className = 'status ' + className;
  }

  resetUI() {
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    this.allPagesBtn.disabled = false;
  }

  async downloadPDF() {
    if (this.screenshots.length === 0) {
      this.setStatus('保存するスクリーンショットがありません', 'error');
      return;
    }

    this.setStatus('PDFを生成中...', 'running');
    this.downloadBtn.disabled = true;

    try {
      chrome.runtime.sendMessage({
        action: 'generatePDF',
        screenshots: this.screenshots,
        bookTitle: this.bookTitle
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

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
