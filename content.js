// Content script for Kindle to PDF extension
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
      case 'getTotalPagesWithCover':
        // Navigate to next page to get accurate page count, then return
        getTotalPagesWithCover(message.readingDirection || 'vertical')
          .then(result => sendResponse({ success: true, ...result }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep message channel open for async response
      case 'ping':
        sendResponse({ success: true, status: 'ready' });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
  });

  async function getTotalPagesWithCover(readingDirection) {
    console.log('Getting total pages with cover, direction:', readingDirection);

    // Store current settings temporarily
    const tempSettings = { ...settings };
    settings.readingDirection = readingDirection;

    // Focus on the reader first to ensure keyboard events work
    focusOnReader();
    await sleep(200);

    // Record starting position
    const startPageInfo = getCurrentPageInfo();
    console.log('Starting page info:', startPageInfo);

    // Use keyboard navigation which works even when UI is visible
    console.log('Navigating forward using keyboard...');
    const isVertical = readingDirection === 'vertical';

    // Navigate forward twice using keyboard
    await navigateWithKeyboard(isVertical ? 'ArrowLeft' : 'ArrowRight');
    await sleep(600);

    await navigateWithKeyboard(isVertical ? 'ArrowLeft' : 'ArrowRight');
    await sleep(600);

    // Trigger UI to make sure page info is displayed
    triggerUIDisplay();
    await sleep(300);

    // Get page info from this page (should be page 2 or later, definitely not cover)
    let pageInfo = getCurrentPageInfo();
    console.log('Page info after navigation:', pageInfo);

    // If still no page info, try triggering UI again and wait
    if (!pageInfo.total) {
      triggerUIDisplay();
      await sleep(400);
      pageInfo = getCurrentPageInfo();
      console.log('Page info after retry:', pageInfo);
    }

    // Navigate back using keyboard
    await navigateWithKeyboard(isVertical ? 'ArrowRight' : 'ArrowLeft');
    await sleep(500);

    await navigateWithKeyboard(isVertical ? 'ArrowRight' : 'ArrowLeft');
    await sleep(300);

    // Restore settings
    settings = tempSettings;

    // Get title
    const docTitle = document.title;
    let title = '';
    if (docTitle) {
      title = docTitle
        .replace(/\s*[-–—]\s*Kindle.*$/i, '')
        .replace(/Kindle Cloud Reader/i, '')
        .trim();
    }

    // Total pages = Kindle's displayed total + 1 (for cover)
    let totalPages = null;
    if (pageInfo.total) {
      totalPages = pageInfo.total + 1; // Add 1 for cover page
      console.log('Total pages including cover:', totalPages);
    }

    return { title, totalPages, kindlePages: pageInfo.total };
  }

  function focusOnReader() {
    // Try to focus on the Kindle reader element
    const readerSelectors = [
      '#kindle-reader',
      '#KindleReader',
      '[id*="reader"]',
      '[class*="reader"]',
      '[class*="Reader"]',
      'iframe',
      '[role="main"]',
      '[tabindex="0"]',
      'main',
      '#content-container'
    ];

    for (const selector of readerSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          el.focus();
          console.log('Focused on:', selector);

          // If it's an iframe, try to focus inside it too
          if (el.tagName === 'IFRAME') {
            try {
              el.contentWindow.focus();
              if (el.contentDocument && el.contentDocument.body) {
                el.contentDocument.body.focus();
              }
            } catch (e) {}
          }
          return;
        }
      } catch (e) {}
    }

    // Fallback: focus on body
    document.body.focus();
  }

  async function navigateWithKeyboard(arrowKey) {
    const keyCode = arrowKey === 'ArrowLeft' ? 37 : 39;

    console.log('Keyboard navigation:', arrowKey);

    // Focus first
    focusOnReader();

    const eventOptions = {
      key: arrowKey,
      code: arrowKey,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    };

    // Create and dispatch events
    const keydownEvent = new KeyboardEvent('keydown', eventOptions);
    const keyupEvent = new KeyboardEvent('keyup', eventOptions);

    // Dispatch to multiple targets for maximum compatibility
    const targets = [
      document,
      document.body,
      document.documentElement,
      window,
      document.activeElement
    ].filter(Boolean);

    // Also find Kindle-specific elements
    const kindleElements = document.querySelectorAll(
      '[class*="reader"], [class*="Reader"], [id*="reader"], iframe, [role="application"]'
    );
    kindleElements.forEach(el => targets.push(el));

    // Dispatch to all targets
    for (const target of targets) {
      try {
        target.dispatchEvent(keydownEvent);
        target.dispatchEvent(keyupEvent);
      } catch (e) {}
    }

    // Also try using the native keyboard event on window with isTrusted-like behavior
    try {
      // Focus on iframe content if exists
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
            iframe.contentWindow.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
          }
          if (iframe.contentDocument) {
            iframe.contentDocument.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
            iframe.contentDocument.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  async function hideReaderUI() {
    // Click on the center of the reader area to hide any visible UI
    // Kindle reader toggles UI visibility on click
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: centerX,
      clientY: centerY,
      view: window
    });

    // Find and click the reader element
    const element = document.elementFromPoint(centerX, centerY);
    if (element) {
      console.log('Clicking center to hide UI:', element.tagName);
      element.click();
      element.dispatchEvent(clickEvent);
    }

    // Also dispatch to document in case needed
    document.dispatchEvent(clickEvent);
  }

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

    // Try to trigger UI to appear by simulating mouse movement
    triggerUIDisplay();

    // Try to get total pages from page indicator
    const pageInfo = getCurrentPageInfo();
    if (pageInfo.total) {
      totalPages = pageInfo.total;
    }

    console.log('Book info:', { title, totalPages });
    return { title, totalPages };
  }

  function triggerUIDisplay() {
    // Move mouse to bottom of screen to trigger footer/navigation bar
    const centerX = window.innerWidth / 2;
    const bottomY = window.innerHeight - 50;

    const moveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: centerX,
      clientY: bottomY,
      view: window
    });

    document.dispatchEvent(moveEvent);
    document.body.dispatchEvent(moveEvent);

    // Also try clicking on the center to make sure reader is focused
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: centerX,
      clientY: window.innerHeight / 2,
      view: window
    });

    // Find the main reader element and click it
    const readerElements = document.querySelectorAll(
      '#kindle-reader, #KindleReader, [id*="reader"], [class*="reader"], ' +
      '#content-container, .content-container, iframe'
    );
    readerElements.forEach(el => {
      el.dispatchEvent(moveEvent);
    });
  }

  function getCurrentPageInfo() {
    let current = null;
    let total = null;

    // ===== Method 1: Kindle-specific selectors =====
    // Look for the footer bar with page/location info
    const kindlePageSelectors = [
      // Progress bar area
      '[class*="progress"]',
      '[class*="Progress"]',
      '[id*="progress"]',
      // Footer/bottom bar
      '[class*="footer"]',
      '[class*="Footer"]',
      '[class*="bottomBar"]',
      '[class*="bottom-bar"]',
      '[class*="navBar"]',
      '[class*="navigation"]',
      // Page number displays
      '[class*="pageNum"]',
      '[class*="page-num"]',
      '[class*="pageCount"]',
      '[class*="page-count"]',
      '[class*="location"]',
      '[class*="Location"]',
      // Kindle-specific
      '[class*="kindle"]',
      '[id*="kindle"]',
      '[class*="position"]',
      '[class*="Position"]'
    ];

    for (const selector of kindlePageSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const result = extractPageNumbers(el);
          if (result.total) {
            console.log('Found page info from Kindle selector:', selector, result);
            return result;
          }
        }
      } catch (e) {}
    }

    // ===== Method 2: Search all text content for page patterns =====
    const textPatterns = [
      // "1 / 123", "1/123", "1 of 123"
      /(\d+)\s*[/／]\s*(\d+)/,
      /(\d+)\s+of\s+(\d+)/i,
      // Japanese: "1ページ / 123ページ"
      /(\d+)\s*(?:ページ)?\s*[/／]\s*(\d+)\s*(?:ページ)?/,
      // "ページ 1 / 123"
      /(?:ページ|page)\s*(\d+)\s*[/／]\s*(\d+)/i,
      // Location: "位置No. 1 / 843"
      /(?:位置|location|loc)[\s.No]*(\d+)\s*[/／]\s*(\d+)/i,
      // "Page 1 of 123"
      /page\s*(\d+)\s*of\s*(\d+)/i
    ];

    // Check all visible text
    const allText = document.body.innerText;
    for (const pattern of textPatterns) {
      const match = allText.match(pattern);
      if (match) {
        const c = parseInt(match[1]);
        const t = parseInt(match[2]);
        if (t > 1 && c <= t) {
          console.log('Found page info from body text:', c, '/', t);
          return { current: c, total: t };
        }
      }
    }

    // ===== Method 3: Look for slider/range elements =====
    const sliderSelectors = [
      'input[type="range"]',
      '[role="slider"]',
      '[role="progressbar"]',
      '[aria-valuemax]',
      '[data-max]',
      '[data-total]'
    ];

    for (const selector of sliderSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const max = el.getAttribute('max') ||
                      el.getAttribute('aria-valuemax') ||
                      el.getAttribute('data-max') ||
                      el.getAttribute('data-total');
          const val = el.getAttribute('value') ||
                      el.getAttribute('aria-valuenow') ||
                      el.getAttribute('data-value') ||
                      el.getAttribute('data-current');

          if (max) {
            const t = parseInt(max);
            const c = val ? parseInt(val) : 1;
            if (t > 1) {
              console.log('Found page info from slider:', c, '/', t);
              return { current: c, total: t };
            }
          }
        }
      } catch (e) {}
    }

    // ===== Method 4: Look for data attributes on any element =====
    const dataAttrSelectors = [
      '[data-page-count]',
      '[data-total-pages]',
      '[data-pages]',
      '[data-max-page]',
      '[data-total]',
      '[data-num-pages]'
    ];

    for (const selector of dataAttrSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const attrs = ['data-page-count', 'data-total-pages', 'data-pages',
                         'data-max-page', 'data-total', 'data-num-pages'];
          for (const attr of attrs) {
            const val = el.getAttribute(attr);
            if (val && /^\d+$/.test(val)) {
              const t = parseInt(val);
              if (t > 1) {
                console.log('Found page info from data attribute:', attr, '=', t);
                return { current: 1, total: t };
              }
            }
          }
        }
      } catch (e) {}
    }

    // ===== Method 5: Check iframes =====
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          const iframeText = iframeDoc.body ? iframeDoc.body.innerText : '';
          for (const pattern of textPatterns) {
            const match = iframeText.match(pattern);
            if (match) {
              const c = parseInt(match[1]);
              const t = parseInt(match[2]);
              if (t > 1 && c <= t) {
                console.log('Found page info from iframe:', c, '/', t);
                return { current: c, total: t };
              }
            }
          }
        }
      } catch (e) {
        // Cross-origin iframe, skip
      }
    }

    // ===== Method 6: Find numeric pairs in close proximity =====
    const numericElements = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length === 0 && el.offsetParent !== null) {
        const text = el.textContent.trim();
        if (/^\d+$/.test(text)) {
          const value = parseInt(text);
          if (value > 0 && value < 10000) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              numericElements.push({ el, value, rect });
            }
          }
        }
      }
    });

    // Sort by position (left to right, top to bottom)
    numericElements.sort((a, b) => {
      if (Math.abs(a.rect.top - b.rect.top) < 20) {
        return a.rect.left - b.rect.left;
      }
      return a.rect.top - b.rect.top;
    });

    // Find consecutive number pairs that look like page indicators
    for (let i = 0; i < numericElements.length - 1; i++) {
      const curr = numericElements[i];
      const tot = numericElements[i + 1];

      // Check if they're close together
      const horizontalDist = Math.abs(curr.rect.right - tot.rect.left);
      const verticalDist = Math.abs(curr.rect.top - tot.rect.top);

      if (horizontalDist < 100 && verticalDist < 30 && curr.value <= tot.value && tot.value > 1) {
        // Check if there's a separator between them (/, of, etc.)
        const parent = curr.el.parentElement;
        if (parent) {
          const parentText = parent.textContent;
          if (parentText.includes('/') || parentText.includes('of') || parentText.includes('／')) {
            console.log('Found page info from numeric pair:', curr.value, '/', tot.value);
            return { current: curr.value, total: tot.value };
          }
        }
      }
    }

    console.log('Could not find page info automatically');
    return { current, total };
  }

  function extractPageNumbers(element) {
    let current = null;
    let total = null;

    // Check text content
    const text = element.textContent || '';
    const patterns = [
      /(\d+)\s*[/／]\s*(\d+)/,
      /(\d+)\s+of\s+(\d+)/i,
      /(?:page|ページ)\s*(\d+)\s*[/／of]\s*(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        current = parseInt(match[1]);
        total = parseInt(match[2]);
        if (total > 1 && current <= total) {
          return { current, total };
        }
      }
    }

    // Check attributes
    const attrs = element.attributes;
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if ((name.includes('max') || name.includes('total') || name.includes('count')) &&
          /^\d+$/.test(value)) {
        total = parseInt(value);
      }
      if ((name.includes('current') || name.includes('value') || name.includes('now')) &&
          /^\d+$/.test(value)) {
        current = parseInt(value);
      }
    }

    if (total && total > 1) {
      return { current: current || 1, total };
    }

    // Check children recursively (but not too deep)
    if (element.children.length < 20) {
      for (const child of element.children) {
        const result = extractPageNumbers(child);
        if (result.total) {
          return result;
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
    // Determine direction based on reading direction setting
    // Vertical (縦書き): next page is on the LEFT (ArrowLeft)
    // Horizontal (横書き): next page is on the RIGHT (ArrowRight)
    const isVertical = settings.readingDirection === 'vertical';
    const arrowKey = isVertical ? 'ArrowLeft' : 'ArrowRight';

    console.log('goToNextPage - direction:', settings.readingDirection, ', key:', arrowKey);

    // Use keyboard navigation (works even when UI is visible)
    await navigateWithKeyboard(arrowKey);

    return true;
  }

  async function goToPrevPage() {
    // Determine direction based on reading direction setting
    // Vertical (縦書き): prev page is on the RIGHT (ArrowRight)
    // Horizontal (横書き): prev page is on the LEFT (ArrowLeft)
    const isVertical = settings.readingDirection === 'vertical';
    const arrowKey = isVertical ? 'ArrowRight' : 'ArrowLeft';

    console.log('goToPrevPage - direction:', settings.readingDirection, ', key:', arrowKey);

    // Use keyboard navigation (works even when UI is visible)
    await navigateWithKeyboard(arrowKey);

    return true;
  }

  function findRightButton() {
    // Look for right arrow or next page button on the right side

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
              console.log('Found right button:', selector);
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

  function findLeftButton() {
    // Look for left arrow or prev page button on the left side

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
              console.log('Found left button:', selector);
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
          console.log('Found left-side clickable element');
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

  function clickOnLeftSide() {
    // Click on the left third of the screen (for vertical/縦書き books)
    const x = window.innerWidth * 0.15;
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
      console.log('Clicking on left side element:', element.tagName);
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
