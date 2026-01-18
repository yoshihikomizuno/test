// Popup script for Kindle to PDF extension

class PopupController {
  constructor() {
    this.isCapturing = false;
    this.screenshots = [];
    this.currentPage = 0;
    this.totalPages = 0;
    this.bookTitle = '';
    this.totalPageCount = null;
    this.avgPageSizeBytes = 150000;

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
    this.readingDirectionRadios = document.querySelectorAll('input[name="readingDirection"]');
    this.includeCoverCheckbox = document.getElementById('includeCover');
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

  getReadingDirection() {
    const checked = document.querySelector('input[name="readingDirection"]:checked');
    return checked ? checked.value : 'vertical';
  }

  setReadingDirection(value) {
    const radio = document.querySelector(`input[name="readingDirection"][value="${value}"]`);
    if (radio) radio.checked = true;
  }

  getIncludeCover() {
    return this.includeCoverCheckbox ? this.includeCoverCheckbox.checked : true;
  }

  setIncludeCover(value) {
    if (this.includeCoverCheckbox) {
      this.includeCoverCheckbox.checked = value;
    }
  }

  loadSettings() {
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        this.startPageInput.value = result.settings.startPage || 1;
        this.endPageInput.value = result.settings.endPage || 10;
        this.qualitySelect.value = result.settings.quality || 0.92;
        this.setReadingDirection(result.settings.readingDirection || 'vertical');
        // includeCover defaults to true if not set
        this.setIncludeCover(result.settings.includeCover !== false);
      }
      this.updatePreEstimatedSize();
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
      quality: parseFloat(this.qualitySelect.value),
      readingDirection: this.getReadingDirection(),
      includeCover: this.getIncludeCover()
    };
    chrome.storage.local.set({ settings });
    this.updatePreEstimatedSize();
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startCapture());
    this.stopBtn.addEventListener('click', () => this.stopCapture());
    this.downloadBtn.addEventListener('click', () => this.downloadPDF());
    this.allPagesBtn.addEventListener('click', () => this.setAllPages());

    [this.startPageInput, this.endPageInput, this.qualitySelect].forEach(input => {
      input.addEventListener('change', () => this.saveSettings());
      input.addEventListener('input', () => this.updatePreEstimatedSize());
    });

    this.readingDirectionRadios.forEach(radio => {
      radio.addEventListener('change', () => this.saveSettings());
    });

    if (this.includeCoverCheckbox) {
      this.includeCoverCheckbox.addEventListener('change', () => this.saveSettings());
    }

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
            this.updatePreEstimatedSize();
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

      // First, try to inject the content script if not already loaded
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      } catch (e) {
        console.log('Script injection:', e.message);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      this.setStatus('ページ数を取得中...', 'running');
      this.allPagesBtn.disabled = true;

      // Use getTotalPagesWithCover to navigate to next page and get accurate count
      const readingDirection = this.getReadingDirection();
      chrome.tabs.sendMessage(tab.id, {
        action: 'getTotalPagesWithCover',
        readingDirection: readingDirection
      }, (response) => {
        this.allPagesBtn.disabled = false;

        if (chrome.runtime.lastError) {
          console.log('Message error:', chrome.runtime.lastError.message);
          this.promptManualPageCount();
          return;
        }
        if (response && response.success && response.totalPages) {
          this.startPageInput.value = 1;
          this.endPageInput.value = response.totalPages;
          this.totalPageCount = response.totalPages;
          this.saveSettings();
          this.setStatus(`全${response.totalPages}ページを設定しました（表紙含む）`, 'success');
        } else {
          // Could not auto-detect, ask for manual input
          this.promptManualPageCount();
        }
      });
    } catch (error) {
      this.allPagesBtn.disabled = false;
      this.setStatus('エラー: ' + error.message, 'error');
      this.promptManualPageCount();
    }
  }

  promptManualPageCount() {
    const kindlePages = prompt(
      'ページ数を自動取得できませんでした。\n' +
      'Kindleで表示されているページ数を入力してください：\n\n' +
      '（ヒント：表紙の次のページに移動して、\n' +
      '下部のスライダーやページ表示で確認できます。\n' +
      '例：「1 / 123」なら「123」と入力）'
    );

    if (kindlePages && /^\d+$/.test(kindlePages.trim())) {
      const displayedPages = parseInt(kindlePages.trim());
      if (displayedPages > 0) {
        // Add 1 for cover page
        const totalPages = displayedPages + 1;
        this.startPageInput.value = 1;
        this.endPageInput.value = totalPages;
        this.totalPageCount = totalPages;
        this.saveSettings();
        this.setStatus(`全${totalPages}ページを設定しました（表紙含む）`, 'success');
        return;
      }
    }

    if (kindlePages !== null) {
      this.setStatus('有効なページ数を入力してください', 'error');
    }
  }

  updatePreEstimatedSize() {
    const startPage = parseInt(this.startPageInput.value) || 1;
    const endPage = parseInt(this.endPageInput.value) || 10;
    const quality = parseFloat(this.qualitySelect.value) || 0.92;

    if (startPage > endPage) return;

    const pageCount = endPage - startPage + 1;
    const qualityMultiplier = quality / 0.92;
    const estimatedSize = Math.round(pageCount * this.avgPageSizeBytes * qualityMultiplier);

    this.estimatedSizeEl.textContent = `約 ${this.formatFileSize(estimatedSize)}`;
    this.fileSizeContainer.style.display = 'block';
  }

  setInputsDisabled(disabled) {
    this.startPageInput.disabled = disabled;
    this.endPageInput.disabled = disabled;
    this.qualitySelect.disabled = disabled;
    this.readingDirectionRadios.forEach(radio => radio.disabled = disabled);
    if (this.includeCoverCheckbox) {
      this.includeCoverCheckbox.disabled = disabled;
    }
  }

  async startCapture() {
    this.saveSettings();

    const startPage = parseInt(this.startPageInput.value);
    const endPage = parseInt(this.endPageInput.value);
    const quality = parseFloat(this.qualitySelect.value);
    const readingDirection = this.getReadingDirection();
    const includeCover = this.getIncludeCover();

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
    this.setInputsDisabled(true);

    this.progressContainer.style.display = 'block';
    this.previewContainer.style.display = 'none';
    this.preview.innerHTML = '';

    this.updateProgress(0, this.totalPages);
    this.setStatus('キャプチャを開始しています...', 'running');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      } catch (e) {
        console.log('Script injection:', e.message);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      chrome.tabs.sendMessage(tab.id, {
        action: 'startCapture',
        settings: {
          startPage,
          endPage,
          quality,
          readingDirection,
          includeCover
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError.message);
          this.setStatus('エラー: コンテンツスクリプトに接続できません。ページを再読み込みしてください。', 'error');
          this.resetUI();
          return;
        }
        if (response && response.success) {
          this.setStatus('キャプチャ中...', 'running');
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
      this.updatePreEstimatedSize();
      return;
    }

    const sizeBytes = this.estimatePDFSize(this.screenshots);
    const sizeStr = this.formatFileSize(sizeBytes);
    this.estimatedSizeEl.textContent = sizeStr;
    this.fileSizeContainer.style.display = 'block';

    if (this.screenshots.length > 0) {
      this.avgPageSizeBytes = Math.round(sizeBytes / this.screenshots.length);
    }
  }

  estimatePDFSize(screenshots) {
    if (!screenshots || screenshots.length === 0) return 0;

    let totalSize = 0;
    for (const screenshot of screenshots) {
      const base64Part = screenshot.split(',')[1] || '';
      totalSize += (base64Part.length * 3) / 4;
    }

    // PDF overhead is roughly 10-15% additional
    return Math.round(totalSize * 1.12);
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
    this.setInputsDisabled(false);
  }

  async downloadPDF() {
    if (this.screenshots.length === 0) {
      this.setStatus('保存するスクリーンショットがありません', 'error');
      return;
    }

    this.setStatus('PDFを生成中...', 'running');
    this.downloadBtn.disabled = true;

    try {
      await this.generatePDF(this.screenshots, this.bookTitle);
      this.setStatus('PDFをダウンロードしました！', 'success');
    } catch (error) {
      console.error('PDF generation error:', error);
      this.setStatus('PDF生成エラー: ' + error.message, 'error');
    } finally {
      this.downloadBtn.disabled = false;
    }
  }

  async generatePDF(screenshots, bookTitle) {
    if (!screenshots || screenshots.length === 0) {
      throw new Error('No screenshots to convert');
    }

    // Get image dimensions from first screenshot
    const firstImage = await this.getImageDimensions(screenshots[0]);
    const imgWidth = firstImage.width;
    const imgHeight = firstImage.height;

    // Calculate PDF dimensions (in mm)
    const pdfWidth = 210;
    const pdfHeight = (imgHeight / imgWidth) * pdfWidth;

    // Create PDF with custom page size
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight]
    });

    // Set PDF metadata
    pdf.setProperties({
      title: bookTitle || 'Kindle Screenshot',
      creator: 'Kindle to PDF Extension'
    });

    for (let i = 0; i < screenshots.length; i++) {
      if (i > 0) {
        pdf.addPage([pdfWidth, pdfHeight]);
      }

      const imgData = screenshots[i];
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeTitle = bookTitle ? bookTitle.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50) : 'kindle-screenshot';
    const filename = `${safeTitle}-${timestamp}.pdf`;

    // Download using chrome.downloads API
    const pdfDataUri = pdf.output('datauristring');
    await chrome.downloads.download({
      url: pdfDataUri,
      filename: filename,
      saveAs: true
    });
  }

  async getImageDimensions(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        resolve({ width: 1920, height: 1080 });
      };
      img.src = dataUrl;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
