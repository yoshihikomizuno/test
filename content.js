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

    // Get title from document
    const docTitle = document.title;
    if (docTitle) {
      title = docTitle
        .replace(/\s*[-–—]\s*Kindle.*$/i, '')
        .replace(/Kindle Cloud Reader/i, '')
        .trim();
    }

    // Try to get total pages from page indicator
    const pageInfo = getCurrentPageInfo();
    if (pageInfo.total) {
      totalPages = pageInfo.total;
    }

    console.log('Book info:', { title, totalPages });
    return { title, totalPages };
  }

  function getCurrentPageInfo() {
    let current = null;
    let total = null;

    // Look for page indicator like "1 / 6" or "Location 1 of 843"
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.children.length === 0 || el.tagName === 'INPUT') {
        const text = el.textContent || el.value || '';

        // Match patterns like "1 / 6", "1/6", "1 of 6"
        const pageMatch = text.match(/^\s*(\d+)\s*[/／of]\s*(\d+)\s*$/i);
        if (pageMatch) {
          current = parseInt(pageMatch[1]);
          total = parseInt(pageMatch[2]);
          console.log('Found page info:', current, '/', total);
          return { current, total };
        }
      }
    }

    // Try input fields
    const inputs = document.querySelectorAll('input');
    for (const input of inputs) {
      const val = input.value;
      if (val && /^\d+$/.test(val)) {
        current = parseInt(val);
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

    try {
      // Navigate to start page first
      if (startPage > 1) {
        console.log('Navigating to start page:', startPage);
        await navigateToPage(startPage);
        await sleep(300);
      }

      let capturedCount = 0;

      for (let i = 0; i < totalPages && !shouldStop; i++) {
        const targetPage = startPage + i;
        console.log(`Capturing page ${targetPage} (${i + 1}/${totalPages})`);

        // Send progress update
        chrome.runtime.sendMessage({
          type: 'captureProgress',
          current: i + 1,
          total: totalPages
        });

        // Small wait for rendering
        await sleep(200);

        // Take screenshot
        try {
          const screenshot = await captureScreenshot();
          if (screenshot) {
            screenshots.push(screenshot);
            capturedCount++;
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
          console.log('Going to next page...');
          const success = await goToNextPage();
          if (!success) {
            console.log('Page navigation may have failed, continuing anyway');
          }
          // Wait for page transition
          await sleep(250);
        }
      }

      console.log(`Capture finished. Total captured: ${capturedCount}`);

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

  async function navigateToPage(pageNumber) {
    console.log(`Navigating to page ${pageNumber}`);

    // Get current page
    const currentInfo = getCurrentPageInfo();
    if (currentInfo.current === pageNumber) {
      console.log('Already on target page');
      return;
    }

    // Method 1: Find and use page input
    const pageInput = document.querySelector('input[type="text"]');
    if (pageInput && pageInput.offsetParent !== null) {
      try {
        pageInput.focus();
        pageInput.select();

        // Clear and set new value
        pageInput.value = pageNumber.toString();
        pageInput.dispatchEvent(new Event('input', { bubbles: true }));
        pageInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Press Enter
        pageInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
        }));
        pageInput.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
        }));

        await sleep(400);
        return;
      } catch (e) {
        console.log('Page input failed:', e);
      }
    }

    // Method 2: Navigate sequentially
    // First go to page 1
    for (let i = 0; i < 50 && !shouldStop; i++) {
      await goToPrevPage();
      await sleep(50);
      const info = getCurrentPageInfo();
      if (info.current === 1) break;
    }

    await sleep(200);

    // Then go forward to target page
    for (let i = 1; i < pageNumber && !shouldStop; i++) {
      await goToNextPage();
      await sleep(100);
    }
  }

  async function goToNextPage() {
    // Try multiple methods in parallel for speed

    // Method 1: Find and click the right arrow/next button
    const nextButton = findNextButton();
    if (nextButton) {
      console.log('Clicking next button');
      nextButton.click();
      return true;
    }

    // Method 2: Simulate keyboard Right Arrow
    console.log('Using keyboard navigation');
    simulateKeyPress('ArrowRight', 39);

    // Method 3: Click on right side of the reader
    clickOnRightSide();

    return true;
  }

  async function goToPrevPage() {
    // Find and click the left arrow/prev button
    const prevButton = findPrevButton();
    if (prevButton) {
      prevButton.click();
      return true;
    }

    // Keyboard Left Arrow
    simulateKeyPress('ArrowLeft', 37);
    return true;
  }

  function findNextButton() {
    // Look for right arrow or next page button
    // Based on the screenshot, there should be a ">" or right arrow on the right side

    const selectors = [
      // SVG icons or buttons with right/next indication
      'button[aria-label*="next" i]',
      'button[aria-label*="Next" i]',
      'button[aria-label*="右" i]',
      'button[aria-label*="次" i]',
      '[role="button"][aria-label*="next" i]',
      '[role="button"][aria-label*="Next" i]',
      // Common class names
      '.reader-nav-right',
      '.nav-right',
      '.next-page',
      '.page-next',
      '[class*="right"][class*="nav"]',
      '[class*="Right"][class*="Nav"]',
      '[class*="next"]',
      '[class*="Next"]',
      // Icon buttons
      'button svg',
      '[role="button"] svg'
    ];

    // First try specific selectors
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // Check if it's on the right side of the screen
          const rect = el.getBoundingClientRect();
          if (rect.right > window.innerWidth * 0.6 && rect.width > 0 && rect.height > 0) {
            if (el.offsetParent !== null) {
              console.log('Found next button:', selector);
              return el.closest('button') || el;
            }
          }
        }
      } catch (e) {}
    }

    // Look for clickable elements on the right side of the page
    const rightSideElements = document.querySelectorAll('button, [role="button"], [onclick], a');
    for (const el of rightSideElements) {
      const rect = el.getBoundingClientRect();
      // Check if element is on the right side and vertically centered
      if (rect.left > window.innerWidth * 0.7 &&
          rect.top > window.innerHeight * 0.2 &&
          rect.bottom < window.innerHeight * 0.8 &&
          rect.width > 0 && rect.width < 200) {
        if (el.offsetParent !== null) {
          console.log('Found right-side clickable element');
          return el;
        }
      }
    }

    return null;
  }

  function findPrevButton() {
    const selectors = [
      'button[aria-label*="prev" i]',
      'button[aria-label*="Prev" i]',
      'button[aria-label*="左" i]',
      'button[aria-label*="前" i]',
      '[role="button"][aria-label*="prev" i]',
      '.reader-nav-left',
      '.nav-left',
      '.prev-page',
      '.page-prev',
      '[class*="left"][class*="nav"]',
      '[class*="prev"]'
    ];

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.left < window.innerWidth * 0.4 && rect.width > 0) {
            if (el.offsetParent !== null) {
              return el.closest('button') || el;
            }
          }
        }
      } catch (e) {}
    }

    // Look for clickable elements on the left side
    const leftSideElements = document.querySelectorAll('button, [role="button"]');
    for (const el of leftSideElements) {
      const rect = el.getBoundingClientRect();
      if (rect.right < window.innerWidth * 0.3 &&
          rect.top > window.innerHeight * 0.2 &&
          rect.bottom < window.innerHeight * 0.8 &&
          rect.width > 0 && rect.width < 200) {
        if (el.offsetParent !== null) {
          return el;
        }
      }
    }

    return null;
  }

  function simulateKeyPress(key, keyCode) {
    const eventOptions = {
      key: key,
      code: key,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    };

    // Try dispatching to various targets
    const targets = [
      document.activeElement,
      document.body,
      document.documentElement,
      document.querySelector('[tabindex]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('[class*="reader"]'),
      document.querySelector('[class*="Reader"]')
    ].filter(Boolean);

    // Dispatch to document first
    document.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    document.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

    // Then to other targets
    for (const target of targets) {
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        target.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
      } catch (e) {}
    }

    // Also try window
    window.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    window.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  }

  function clickOnRightSide() {
    // Click on the right third of the screen (common reader navigation)
    const x = window.innerWidth * 0.85;
    const y = window.innerHeight * 0.5;

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      view: window
    });

    // Find the element at that position and click it
    const element = document.elementFromPoint(x, y);
    if (element) {
      console.log('Clicking on right side element:', element.tagName);
      element.dispatchEvent(clickEvent);
      element.click();
    }
  }

  async function captureScreenshot() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'captureTab', quality: settings.quality },
        (response) => {
          if (chrome.runtime.lastError) {
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

  console.log('Kindle Auto Screenshot content script loaded and ready');

})();
