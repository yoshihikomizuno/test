// Content script for Kindle Auto Screenshot extension
// This script runs on Kindle Cloud Reader pages

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__kindleScreenshotLoaded) {
    console.log('Kindle Auto Screenshot already loaded');
    return;
  }
  window.__kindleScreenshotLoaded = true;

  let isCapturing = false;
  let shouldStop = false;
  let settings = {};
  let screenshots = [];
  let bookTitle = '';

  // Initialize message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message.action);

    switch (message.action) {
      case 'startCapture':
        if (isCapturing) {
          sendResponse({ success: false, error: 'Already capturing' });
        } else {
          sendResponse({ success: true });
          // Start capture asynchronously
          setTimeout(() => startCapture(message.settings), 0);
        }
        break;
      case 'stopCapture':
        stopCapture();
        sendResponse({ success: true });
        break;
      case 'getBookInfo':
        const info = getBookInfo();
        sendResponse({ success: true, ...info });
        break;
      case 'ping':
        sendResponse({ success: true, status: 'ready' });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
  });

  function getBookInfo() {
    let title = '';
    let totalPages = null;

    // Method 1: Document title
    const docTitle = document.title;
    if (docTitle) {
      title = docTitle
        .replace(' - Kindle Cloud Reader', '')
        .replace(' - Amazon Kindle', '')
        .replace('Kindle Cloud Reader', '')
        .trim();
    }

    // Method 2: Look for title elements
    const titleSelectors = [
      '.book-title',
      '[data-testid="book-title"]',
      '.title-text',
      '#book-title',
      'h1.title',
      '[class*="bookTitle"]'
    ];

    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    // Try to get total pages
    const pageInfo = getPageInfo();
    if (pageInfo.total) {
      totalPages = pageInfo.total;
    }

    console.log('Book info:', { title, totalPages });
    return { title, totalPages };
  }

  function getPageInfo() {
    let current = null;
    let total = null;

    // Method 1: Look for page display elements
    const pageSelectors = [
      '.page-number',
      '.pageNumber',
      '[data-testid="page-number"]',
      '.location-display',
      '#page-display',
      '.reader-page-number',
      '[class*="pageNum"]',
      '[class*="location"]'
    ];

    for (const selector of pageSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        const match = el.textContent.match(/(\d+)\s*[/／]\s*(\d+)/);
        if (match) {
          current = parseInt(match[1]);
          total = parseInt(match[2]);
          break;
        }
        const singleMatch = el.textContent.match(/(\d+)/);
        if (singleMatch) {
          current = parseInt(singleMatch[1]);
        }
      }
    }

    // Method 2: Look in progress bar or slider
    const progressBar = document.querySelector('input[type="range"]') ||
                        document.querySelector('.progress-slider') ||
                        document.querySelector('[role="slider"]');
    if (progressBar) {
      const max = progressBar.getAttribute('max') || progressBar.getAttribute('aria-valuemax');
      if (max) {
        total = parseInt(max);
      }
      const value = progressBar.value || progressBar.getAttribute('aria-valuenow');
      if (value) {
        current = parseInt(value);
      }
    }

    // Method 3: Look for location/page text anywhere in visible text
    if (!total) {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.children.length === 0 && el.textContent) {
          const text = el.textContent.trim();
          const pageMatch = text.match(/(?:ページ|page|Page|loc)[:\s]*(\d+)\s*[/／of]\s*(\d+)/i);
          if (pageMatch) {
            current = parseInt(pageMatch[1]);
            total = parseInt(pageMatch[2]);
            break;
          }
        }
      }
    }

    return { current, total };
  }

  async function startCapture(captureSettings) {
    console.log('Starting capture with settings:', captureSettings);

    if (isCapturing) {
      console.log('Already capturing, ignoring');
      return;
    }

    settings = captureSettings;
    isCapturing = true;
    shouldStop = false;
    screenshots = [];

    const info = getBookInfo();
    bookTitle = info.title;

    const { startPage, endPage } = settings;
    const totalPages = endPage - startPage + 1;

    console.log(`Capturing pages ${startPage} to ${endPage} (${totalPages} pages)`);
    console.log(`Book title: ${bookTitle}`);

    try {
      // Navigate to start page if not page 1
      if (startPage > 1) {
        await navigateToPage(startPage);
        await waitForPageLoad();
      }

      for (let i = 0; i < totalPages && !shouldStop; i++) {
        const currentPage = startPage + i;
        console.log(`Capturing page ${currentPage} (${i + 1}/${totalPages})`);

        // Send progress update
        chrome.runtime.sendMessage({
          type: 'captureProgress',
          current: i + 1,
          total: totalPages
        });

        // Wait for page content to be fully rendered
        await waitForPageLoad();

        // Take screenshot via background script
        try {
          const screenshot = await captureScreenshot();
          if (screenshot) {
            screenshots.push(screenshot);
            chrome.runtime.sendMessage({
              type: 'screenshotCaptured',
              data: screenshot
            });
          }
        } catch (e) {
          console.error('Screenshot failed:', e);
        }

        // Navigate to next page if not the last one
        if (i < totalPages - 1 && !shouldStop) {
          await goToNextPage();
          await waitForPageLoad();
        }
      }

      if (shouldStop) {
        chrome.runtime.sendMessage({
          type: 'captureStopped',
          screenshots: screenshots,
          bookTitle: bookTitle
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'captureComplete',
          screenshots: screenshots,
          bookTitle: bookTitle
        });
      }

    } catch (error) {
      console.error('Capture error:', error);
      chrome.runtime.sendMessage({
        type: 'captureError',
        error: error.message
      });
    } finally {
      isCapturing = false;
      console.log('Capture finished');
    }
  }

  function stopCapture() {
    console.log('Stopping capture');
    shouldStop = true;
  }

  async function waitForPageLoad() {
    const loadingSelectors = [
      '.loading',
      '.spinner',
      '[data-loading="true"]',
      '.page-loading',
      '[class*="loading"]',
      '[class*="spinner"]'
    ];

    // Initial wait
    await sleep(400);

    // Check for loading indicators
    for (let attempt = 0; attempt < 30; attempt++) {
      let isLoading = false;
      for (const selector of loadingSelectors) {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null && getComputedStyle(el).display !== 'none') {
          isLoading = true;
          break;
        }
      }

      if (!isLoading) {
        break;
      }
      await sleep(100);
    }

    // Additional wait for content to render
    await sleep(600);
  }

  async function navigateToPage(pageNumber) {
    console.log(`Navigating to page ${pageNumber}`);

    // Method 1: Try to use page input
    const pageInput = findPageInput();
    if (pageInput) {
      try {
        pageInput.focus();
        pageInput.select();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, pageNumber.toString());

        pageInput.dispatchEvent(new Event('input', { bubbles: true }));
        pageInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Try Enter key
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        });
        pageInput.dispatchEvent(enterEvent);

        await sleep(800);
        return;
      } catch (e) {
        console.log('Page input method failed:', e);
      }
    }

    // Method 2: Use slider if available
    const slider = document.querySelector('input[type="range"]') ||
                   document.querySelector('[role="slider"]');
    if (slider) {
      try {
        const max = parseInt(slider.getAttribute('max') || slider.getAttribute('aria-valuemax') || 100);
        const newValue = Math.min(pageNumber, max);

        // Use native value setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(slider, newValue);

        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(800);
        return;
      } catch (e) {
        console.log('Slider method failed:', e);
      }
    }

    // Method 3: Sequential navigation from current position
    // Go to beginning first
    await goToBeginning();
    await sleep(800);

    // Then navigate forward
    for (let i = 1; i < pageNumber && !shouldStop; i++) {
      await goToNextPage();
      await sleep(300);
    }
  }

  function findPageInput() {
    const selectors = [
      'input[type="text"][aria-label*="ページ"]',
      'input[type="text"][aria-label*="page"]',
      'input[type="number"][aria-label*="ページ"]',
      'input[type="number"][aria-label*="page"]',
      'input[type="text"][aria-label*="location"]',
      '.pageNumberInput',
      '[data-testid="page-input"]',
      'input.page-input',
      '#page-input',
      'input[class*="page"]',
      'input[class*="location"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  async function goToBeginning() {
    // Try Ctrl+Home keyboard shortcut
    dispatchKeyEvent('Home', 36, true);
    await sleep(500);
  }

  async function goToNextPage() {
    // Method 1: Try clicking next button
    const nextButton = findNextPageButton();
    if (nextButton) {
      try {
        nextButton.click();
        await sleep(150);
        return true;
      } catch (e) {
        console.log('Next button click failed:', e);
      }
    }

    // Method 2: Keyboard navigation (right arrow)
    dispatchKeyEvent('ArrowRight', 39);
    await sleep(150);

    // Method 3: Also try clicking on right side of reader
    await clickRightSide();

    return true;
  }

  function dispatchKeyEvent(key, keyCode, ctrlKey = false) {
    const eventOptions = {
      key: key,
      code: key,
      keyCode: keyCode,
      which: keyCode,
      ctrlKey: ctrlKey,
      bubbles: true,
      cancelable: true,
      view: window
    };

    // Dispatch to multiple targets
    const targets = [
      document.activeElement,
      document.querySelector('#kindle-reader'),
      document.querySelector('[data-testid="reader"]'),
      document.querySelector('.reader-container'),
      document.querySelector('#reader'),
      document.querySelector('iframe'),
      document.body,
      document.documentElement
    ].filter(Boolean);

    for (const target of targets) {
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        target.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
        target.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
      } catch (e) {
        // Ignore errors
      }
    }

    // Also try on window
    window.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    window.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  }

  function findNextPageButton() {
    const selectors = [
      '[aria-label="次のページ"]',
      '[aria-label="Next page"]',
      '[aria-label="next page"]',
      '[aria-label*="次"]',
      '[aria-label*="next"]',
      '[aria-label*="Next"]',
      '[data-testid="next-page"]',
      '.next-page-button',
      '.page-next',
      '#next-page',
      '.reader-controls-right',
      '.page-turner-right',
      'button[class*="next"]',
      'button[class*="Next"]',
      '[class*="right"][class*="page"]',
      '[class*="pageRight"]',
      '[class*="rightPage"]'
    ];

    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          return element;
        }
      } catch (e) {
        // Ignore selector errors
      }
    }

    return null;
  }

  async function clickRightSide() {
    const readerSelectors = [
      '#kindle-reader',
      '[data-testid="reader"]',
      '.reader-container',
      '#reader',
      '.kg-full-page-view',
      '[class*="reader"]',
      '[class*="Reader"]',
      'main',
      '#main-content'
    ];

    let readerArea = null;
    for (const selector of readerSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) {
          readerArea = el;
          break;
        }
      } catch (e) {
        // Ignore
      }
    }

    if (!readerArea) {
      readerArea = document.body;
    }

    const rect = readerArea.getBoundingClientRect();
    const x = rect.right - 100;
    const y = rect.top + rect.height / 2;

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      view: window
    };

    readerArea.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    readerArea.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    readerArea.dispatchEvent(new MouseEvent('click', eventOptions));
  }

  async function captureScreenshot() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'captureTab', quality: settings.quality },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Screenshot error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else if (response && response.success) {
            resolve(response.dataUrl);
          } else {
            reject(new Error(response?.error || 'Screenshot failed'));
          }
        }
      );
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Notify that content script is loaded
  console.log('Kindle Auto Screenshot content script loaded and ready');

})();
