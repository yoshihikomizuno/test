// Content script for Kindle Auto Screenshot extension
// This script runs on Kindle Cloud Reader pages

(function() {
  'use strict';

  let isCapturing = false;
  let shouldStop = false;
  let settings = {};
  let screenshots = [];

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
      case 'ping':
        sendResponse({ success: true, status: 'ready' });
        break;
    }
    return true;
  });

  async function startCapture(captureSettings) {
    if (isCapturing) {
      console.log('Already capturing');
      return;
    }

    settings = captureSettings;
    isCapturing = true;
    shouldStop = false;
    screenshots = [];

    const { startPage, endPage, delay } = settings;
    const totalPages = endPage - startPage + 1;

    console.log(`Starting capture: pages ${startPage} to ${endPage}`);

    try {
      // First, navigate to the start page
      await navigateToPage(startPage);
      await sleep(delay);

      for (let i = 0; i < totalPages && !shouldStop; i++) {
        const currentPage = startPage + i;

        // Send progress update
        chrome.runtime.sendMessage({
          type: 'captureProgress',
          current: i + 1,
          total: totalPages
        });

        // Wait for page to stabilize
        await sleep(300);

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
          await goToNextPage();
          await sleep(delay);
        }
      }

      if (shouldStop) {
        chrome.runtime.sendMessage({
          type: 'captureStopped',
          screenshots: screenshots
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'captureComplete',
          screenshots: screenshots
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

  async function navigateToPage(pageNumber) {
    // Try to find and use the page input/slider in Kindle Cloud Reader
    // This varies by version, so we'll try multiple methods

    // Method 1: Look for page navigation input
    const pageInput = document.querySelector('input[type="text"][aria-label*="ページ"]') ||
                      document.querySelector('input[type="text"][aria-label*="page"]') ||
                      document.querySelector('.pageNumberInput') ||
                      document.querySelector('[data-testid="page-input"]');

    if (pageInput) {
      pageInput.focus();
      pageInput.value = pageNumber.toString();
      pageInput.dispatchEvent(new Event('input', { bubbles: true }));
      pageInput.dispatchEvent(new Event('change', { bubbles: true }));
      pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      await sleep(500);
      return;
    }

    // Method 2: Use keyboard navigation from page 1
    // First go to beginning
    await goToBeginning();
    await sleep(500);

    // Then navigate forward
    for (let i = 1; i < pageNumber; i++) {
      await goToNextPage();
      await sleep(100);
    }
  }

  async function goToBeginning() {
    // Try to find "go to beginning" button or use Ctrl+Home
    const beginningBtn = document.querySelector('[aria-label*="最初"]') ||
                         document.querySelector('[aria-label*="beginning"]') ||
                         document.querySelector('.beginning-button');

    if (beginningBtn) {
      beginningBtn.click();
      return;
    }

    // Fallback: Use keyboard shortcut
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Home',
      keyCode: 36,
      ctrlKey: true,
      bubbles: true
    }));
  }

  async function goToNextPage() {
    // Method 1: Click the next page button/area
    const nextButton = findNextPageButton();
    if (nextButton) {
      nextButton.click();
      return;
    }

    // Method 2: Use keyboard navigation (right arrow or Page Down)
    // Kindle Cloud Reader typically responds to arrow keys
    const readerContainer = document.querySelector('#kindle-reader') ||
                            document.querySelector('[data-testid="reader"]') ||
                            document.querySelector('.reader-container') ||
                            document.querySelector('#reader') ||
                            document.body;

    // Try right arrow key
    readerContainer.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      bubbles: true
    }));

    // Also dispatch on document
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      keyCode: 39,
      bubbles: true
    }));

    // Try clicking on the right side of the reader
    await clickNextPageArea();
  }

  function findNextPageButton() {
    // Various selectors for different Kindle Cloud Reader versions
    const selectors = [
      '[aria-label="次のページ"]',
      '[aria-label="Next page"]',
      '[aria-label*="next"]',
      '.next-page-button',
      '.page-next',
      '#next-page',
      '[data-testid="next-page"]',
      '.reader-controls-right',
      '.page-turner-right'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return null;
  }

  async function clickNextPageArea() {
    // Find the reader content area and click on the right side
    const readerArea = document.querySelector('#kindle-reader') ||
                       document.querySelector('[data-testid="reader"]') ||
                       document.querySelector('.reader-container') ||
                       document.querySelector('#reader') ||
                       document.querySelector('iframe')?.contentDocument?.body ||
                       document.querySelector('.kg-full-page-view') ||
                       document.body;

    if (readerArea) {
      const rect = readerArea.getBoundingClientRect();
      const x = rect.right - 50; // Click near right edge
      const y = rect.top + rect.height / 2;

      // Create and dispatch click event
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window
      });

      readerArea.dispatchEvent(clickEvent);
    }
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
