// Content script for Kindle Auto Screenshot extension
// This script runs on Kindle Cloud Reader pages

(function() {
  'use strict';

  let isCapturing = false;
  let shouldStop = false;
  let settings = {};
  let screenshots = [];
  let bookTitle = '';

  // Initialize message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'startCapture':
        startCapture(message.settings);
        sendResponse({ success: true });
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
    }
    return true;
  });

  function getBookInfo() {
    // Try to get book title from various elements
    let title = '';
    let totalPages = null;

    // Method 1: Document title
    const docTitle = document.title;
    if (docTitle && !docTitle.includes('Kindle')) {
      title = docTitle.replace(' - Kindle Cloud Reader', '').trim();
    }

    // Method 2: Look for title elements
    const titleSelectors = [
      '.book-title',
      '[data-testid="book-title"]',
      '.title-text',
      '#book-title',
      'h1.title'
    ];

    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        title = el.textContent.trim();
        break;
      }
    }

    // Try to get total pages
    const pageInfo = getPageInfo();
    if (pageInfo.total) {
      totalPages = pageInfo.total;
    }

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
      '.reader-page-number'
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
        // Try single number
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

    // Method 3: Look for location/page text anywhere
    const allText = document.body.innerText;
    const pageMatch = allText.match(/(?:ページ|page|Page|loc)[:\s]*(\d+)\s*[/／of]\s*(\d+)/i);
    if (pageMatch && !total) {
      current = parseInt(pageMatch[1]);
      total = parseInt(pageMatch[2]);
    }

    return { current, total };
  }

  async function startCapture(captureSettings) {
    if (isCapturing) {
      console.log('Already capturing');
      return;
    }

    settings = captureSettings;
    isCapturing = true;
    shouldStop = false;
    screenshots = [];

    // Get book info
    const info = getBookInfo();
    bookTitle = info.title;

    const { startPage, endPage } = settings;
    const totalPages = endPage - startPage + 1;

    console.log(`Starting capture: pages ${startPage} to ${endPage}`);
    console.log(`Book title: ${bookTitle}`);

    try {
      // First, navigate to the start page
      await navigateToPage(startPage);

      // Wait for initial page to load
      await waitForPageLoad();

      for (let i = 0; i < totalPages && !shouldStop; i++) {
        const currentPage = startPage + i;

        // Send progress update
        chrome.runtime.sendMessage({
          type: 'captureProgress',
          current: i + 1,
          total: totalPages
        });

        // Wait for page content to be fully rendered
        await waitForPageLoad();

        // Take screenshot via background script
        const screenshot = await captureScreenshot();
        if (screenshot) {
          screenshots.push(screenshot);
          chrome.runtime.sendMessage({
            type: 'screenshotCaptured',
            data: screenshot
          });
        }

        // Navigate to next page if not the last one
        if (i < totalPages - 1 && !shouldStop) {
          const navigated = await goToNextPage();
          if (!navigated) {
            console.log('Could not navigate to next page, stopping');
            break;
          }
          // Wait for page transition
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
    }
  }

  function stopCapture() {
    console.log('Stopping capture');
    shouldStop = true;
  }

  async function waitForPageLoad() {
    // Wait for any loading indicators to disappear
    const loadingSelectors = [
      '.loading',
      '.spinner',
      '[data-loading="true"]',
      '.page-loading'
    ];

    // Initial wait for page transition
    await sleep(300);

    // Check for loading indicators
    for (let attempt = 0; attempt < 20; attempt++) {
      let isLoading = false;
      for (const selector of loadingSelectors) {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) {
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
    await sleep(500);
  }

  async function navigateToPage(pageNumber) {
    console.log(`Navigating to page ${pageNumber}`);

    // Method 1: Try to use page input
    const pageInput = findPageInput();
    if (pageInput) {
      try {
        pageInput.focus();
        pageInput.value = '';
        pageInput.value = pageNumber.toString();
        pageInput.dispatchEvent(new Event('input', { bubbles: true }));
        pageInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Try Enter key
        pageInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        }));
        pageInput.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        }));

        await sleep(500);
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
        slider.value = newValue;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);
        return;
      } catch (e) {
        console.log('Slider method failed:', e);
      }
    }

    // Method 3: Sequential navigation from page 1
    // Go to beginning first
    await goToBeginning();
    await sleep(500);

    // Then navigate forward
    for (let i = 1; i < pageNumber && !shouldStop; i++) {
      await goToNextPage();
      await sleep(200);
    }
  }

  function findPageInput() {
    const selectors = [
      'input[type="text"][aria-label*="ページ"]',
      'input[type="text"][aria-label*="page"]',
      'input[type="number"][aria-label*="ページ"]',
      'input[type="number"][aria-label*="page"]',
      '.pageNumberInput',
      '[data-testid="page-input"]',
      'input.page-input',
      '#page-input'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  async function goToBeginning() {
    // Try keyboard shortcut
    dispatchKeyEvent('Home', 36, true);
    await sleep(300);
  }

  async function goToNextPage() {
    let success = false;

    // Method 1: Click next button
    const nextButton = findNextPageButton();
    if (nextButton) {
      try {
        nextButton.click();
        success = true;
        await sleep(100);
      } catch (e) {
        console.log('Next button click failed:', e);
      }
    }

    // Method 2: Keyboard navigation (right arrow)
    if (!success) {
      dispatchKeyEvent('ArrowRight', 39);
      success = true;
    }

    // Method 3: Click on right side of reader area
    if (!success) {
      await clickRightSide();
      success = true;
    }

    return success;
  }

  function dispatchKeyEvent(key, keyCode, ctrlKey = false) {
    const targets = [
      document.activeElement,
      document.querySelector('#kindle-reader'),
      document.querySelector('[data-testid="reader"]'),
      document.querySelector('.reader-container'),
      document.querySelector('#reader'),
      document.body
    ].filter(Boolean);

    for (const target of targets) {
      const eventOptions = {
        key: key,
        keyCode: keyCode,
        which: keyCode,
        code: key,
        ctrlKey: ctrlKey,
        bubbles: true,
        cancelable: true
      };

      target.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
      target.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
      target.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
    }
  }

  function findNextPageButton() {
    const selectors = [
      '[aria-label="次のページ"]',
      '[aria-label="Next page"]',
      '[aria-label="next page"]',
      '[aria-label*="次"]',
      '[aria-label*="next"]',
      '[data-testid="next-page"]',
      '.next-page-button',
      '.page-next',
      '#next-page',
      '.reader-controls-right',
      '.page-turner-right',
      'button[class*="next"]',
      '[class*="right"][class*="page"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return element;
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
      'main',
      '#main-content'
    ];

    let readerArea = null;
    for (const selector of readerSelectors) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        readerArea = el;
        break;
      }
    }

    if (!readerArea) {
      readerArea = document.body;
    }

    const rect = readerArea.getBoundingClientRect();
    const x = rect.right - 50;
    const y = rect.top + rect.height / 2;

    // Simulate mouse events
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
  console.log('Kindle Auto Screenshot content script loaded');

})();
