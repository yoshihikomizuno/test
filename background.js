// Background service worker for Kindle to PDF extension
// Only handles screenshot capture - PDF generation is done in popup.js

// Rate limiting for captureVisibleTab (Chrome limits calls per second)
let lastCaptureTime = 0;
const MIN_CAPTURE_INTERVAL = 1000; // Minimum 1 second between captures

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureTab') {
    rateLimitedCaptureTab(message.quality || 0.92)
      .then(dataUrl => {
        sendResponse({ success: true, dataUrl });
      })
      .catch(error => {
        console.error('Capture error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Rate-limited capture function to avoid Chrome's quota error
async function rateLimitedCaptureTab(quality) {
  const now = Date.now();
  const timeSinceLastCapture = now - lastCaptureTime;

  // Wait if we're calling too frequently
  if (timeSinceLastCapture < MIN_CAPTURE_INTERVAL) {
    const waitTime = MIN_CAPTURE_INTERVAL - timeSinceLastCapture;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastCaptureTime = Date.now();
  return captureTab(quality);
}

async function captureTab(quality) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!tabs || tabs.length === 0) {
        reject(new Error('No active tab found'));
        return;
      }

      const tab = tabs[0];

      chrome.tabs.captureVisibleTab(
        tab.windowId,
        {
          format: 'jpeg',
          quality: Math.round(quality * 100)
        },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!dataUrl) {
            reject(new Error('Failed to capture screenshot'));
          } else {
            resolve(dataUrl);
          }
        }
      );
    });
  });
}

console.log('Kindle to PDF background service worker loaded');
