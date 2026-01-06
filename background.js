// Background service worker for Kindle Auto Screenshot extension

// Import jsPDF library
importScripts('lib/jspdf.umd.min.js');

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureTab') {
    captureTab(message.quality || 0.92)
      .then(dataUrl => {
        sendResponse({ success: true, dataUrl });
      })
      .catch(error => {
        console.error('Capture error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.action === 'generatePDF') {
    generatePDF(message.screenshots)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('PDF generation error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
});

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

async function generatePDF(screenshots) {
  if (!screenshots || screenshots.length === 0) {
    throw new Error('No screenshots to convert');
  }

  // Get image dimensions from first screenshot
  const firstImage = await loadImage(screenshots[0]);
  const imgWidth = firstImage.width;
  const imgHeight = firstImage.height;

  // Calculate PDF dimensions (in mm)
  // A4 is 210 x 297 mm, but we'll use custom size based on image aspect ratio
  const pdfWidth = 210; // mm
  const pdfHeight = (imgHeight / imgWidth) * pdfWidth;

  // Create PDF with custom page size
  const { jsPDF } = jspdf;
  const pdf = new jsPDF({
    orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pdfWidth, pdfHeight]
  });

  for (let i = 0; i < screenshots.length; i++) {
    if (i > 0) {
      pdf.addPage([pdfWidth, pdfHeight]);
    }

    // Add image to PDF
    const imgData = screenshots[i];
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  }

  // Generate PDF blob
  const pdfBlob = pdf.output('blob');

  // Create download
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `kindle-screenshot-${timestamp}.pdf`;

  // Use chrome.downloads API to save the file
  const url = URL.createObjectURL(pdfBlob);

  try {
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
  } finally {
    // Clean up the object URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    // In service worker, we can't use Image() directly
    // So we'll parse the data URL to get dimensions
    // For JPEG, we need to parse the header

    try {
      // Extract base64 data
      const base64Data = dataUrl.split(',')[1];
      const binaryData = atob(base64Data);

      // For JPEG, find dimensions in the header
      if (dataUrl.includes('image/jpeg')) {
        const dimensions = getJpegDimensions(binaryData);
        resolve(dimensions);
      } else if (dataUrl.includes('image/png')) {
        const dimensions = getPngDimensions(binaryData);
        resolve(dimensions);
      } else {
        // Default dimensions if we can't parse
        resolve({ width: 1920, height: 1080 });
      }
    } catch (error) {
      console.error('Error parsing image:', error);
      // Return default dimensions on error
      resolve({ width: 1920, height: 1080 });
    }
  });
}

function getJpegDimensions(binaryData) {
  // JPEG dimensions are in SOF0 marker (0xFF 0xC0)
  let i = 0;
  while (i < binaryData.length - 1) {
    if (binaryData.charCodeAt(i) === 0xFF) {
      const marker = binaryData.charCodeAt(i + 1);
      // SOF0, SOF1, SOF2 markers
      if (marker >= 0xC0 && marker <= 0xC2) {
        const height = (binaryData.charCodeAt(i + 5) << 8) + binaryData.charCodeAt(i + 6);
        const width = (binaryData.charCodeAt(i + 7) << 8) + binaryData.charCodeAt(i + 8);
        return { width, height };
      }
      // Skip to next marker
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
  // PNG dimensions are at byte 16-23 in the IHDR chunk
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
