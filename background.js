// Background service worker for Kindle Auto Screenshot extension

// Import jsPDF library
importScripts('lib/jspdf.umd.min.js');

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

  if (message.action === 'generatePDF') {
    generatePDF(message.screenshots, message.bookTitle)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('PDF generation error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'estimatePDFSize') {
    const size = estimatePDFSize(message.screenshots);
    sendResponse({ success: true, size });
    return false;
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

function estimatePDFSize(screenshots) {
  if (!screenshots || screenshots.length === 0) return 0;

  // Calculate total size of base64 data
  let totalSize = 0;
  for (const screenshot of screenshots) {
    // Base64 is about 4/3 of binary size, and data URL has header
    const base64Part = screenshot.split(',')[1] || '';
    totalSize += (base64Part.length * 3) / 4;
  }

  // PDF overhead is roughly 10-15% additional
  return Math.round(totalSize * 1.12);
}

async function generatePDF(screenshots, bookTitle) {
  if (!screenshots || screenshots.length === 0) {
    throw new Error('No screenshots to convert');
  }

  // Get image dimensions from first screenshot
  const firstImage = await loadImage(screenshots[0]);
  const imgWidth = firstImage.width;
  const imgHeight = firstImage.height;

  // Calculate PDF dimensions (in mm)
  const pdfWidth = 210;
  const pdfHeight = (imgHeight / imgWidth) * pdfWidth;

  // Create PDF with custom page size
  const { jsPDF } = jspdf;
  const pdf = new jsPDF({
    orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pdfWidth, pdfHeight]
  });

  // Set PDF metadata for thumbnail support
  pdf.setProperties({
    title: bookTitle || 'Kindle Screenshot',
    creator: 'Kindle Auto Screenshot Extension'
  });

  for (let i = 0; i < screenshots.length; i++) {
    if (i > 0) {
      pdf.addPage([pdfWidth, pdfHeight]);
    }

    const imgData = screenshots[i];
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  }

  // Generate PDF as base64 data URL (Service Worker compatible)
  const pdfDataUri = pdf.output('datauristring');

  // Create filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeTitle = bookTitle ? bookTitle.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50) : 'kindle-screenshot';
  const filename = `${safeTitle}-${timestamp}.pdf`;

  // Use chrome.downloads API with data URI
  await chrome.downloads.download({
    url: pdfDataUri,
    filename: filename,
    saveAs: true
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve) => {
    try {
      const base64Data = dataUrl.split(',')[1];
      const binaryData = atob(base64Data);

      if (dataUrl.includes('image/jpeg')) {
        const dimensions = getJpegDimensions(binaryData);
        resolve(dimensions);
      } else if (dataUrl.includes('image/png')) {
        const dimensions = getPngDimensions(binaryData);
        resolve(dimensions);
      } else {
        resolve({ width: 1920, height: 1080 });
      }
    } catch (error) {
      console.error('Error parsing image:', error);
      resolve({ width: 1920, height: 1080 });
    }
  });
}

function getJpegDimensions(binaryData) {
  let i = 0;
  while (i < binaryData.length - 1) {
    if (binaryData.charCodeAt(i) === 0xFF) {
      const marker = binaryData.charCodeAt(i + 1);
      if (marker >= 0xC0 && marker <= 0xC2) {
        const height = (binaryData.charCodeAt(i + 5) << 8) + binaryData.charCodeAt(i + 6);
        const width = (binaryData.charCodeAt(i + 7) << 8) + binaryData.charCodeAt(i + 8);
        return { width, height };
      }
      if (marker === 0xD8 || marker === 0xD9) {
        i += 2;
      } else {
        const length = (binaryData.charCodeAt(i + 2) << 8) + binaryData.charCodeAt(i + 3);
        i += length + 2;
      }
    } else {
      i++;
    }
  }
  return { width: 1920, height: 1080 };
}

function getPngDimensions(binaryData) {
  const width = (binaryData.charCodeAt(16) << 24) +
                (binaryData.charCodeAt(17) << 16) +
                (binaryData.charCodeAt(18) << 8) +
                binaryData.charCodeAt(19);
  const height = (binaryData.charCodeAt(20) << 24) +
                 (binaryData.charCodeAt(21) << 16) +
                 (binaryData.charCodeAt(22) << 8) +
                 binaryData.charCodeAt(23);
  return { width, height };
}

console.log('Kindle Auto Screenshot background service worker loaded');
