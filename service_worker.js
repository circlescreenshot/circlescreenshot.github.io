// Circle Snip - Service Worker
// Handles capture coordination and messaging

// State
let capturedImageData = null;

// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  await startCircleSnip(tab);
});

// Listen for keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'start-circle-snip') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await startCircleSnip(tab);
    }
  }
});

// Start the circle snip process
async function startCircleSnip(tab) {
  // Check if we can capture this page
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    // Cannot capture restricted pages - notify via content script
    try {
      await injectAndNotifyError(tab.id, "Cannot capture this page (browser restriction)");
    } catch (e) {
      console.error('Cannot inject into this page:', e);
    }
    return;
  }

  try {
    // Capture the visible tab first
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });

    capturedImageData = dataUrl;

    // Inject CSS and scripts
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['overlay.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['image_processor.js', 'content_script.js']
    });

    // Send the captured image to the content script
    await chrome.tabs.sendMessage(tab.id, {
      action: 'startSelection',
      imageData: dataUrl,
      devicePixelRatio: tab.devicePixelRatio || 1
    });

  } catch (error) {
    console.error('Error starting circle snip:', error);
    try {
      await injectAndNotifyError(tab.id, "Failed to capture: " + error.message);
    } catch (e) {
      console.error('Cannot show error:', e);
    }
  }
}

// Inject error notification
async function injectAndNotifyError(tabId, message) {
  await chrome.scripting.insertCSS({
    target: { tabId: tabId },
    files: ['overlay.css']
  });

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: showErrorToast,
    args: [message]
  });
}

// Function to show error toast (injected into page)
function showErrorToast(message) {
  const existing = document.getElementById('circle-snip-error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'circle-snip-error-toast';
  toast.className = 'cs-toast cs-toast-error';
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM7.25 4.5v4h1.5v-4h-1.5zm0 5.5v1.5h1.5V10h-1.5z"/>
    </svg>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('cs-toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImage') {
    // Handle download
    const link = document.createElement('a');
    link.href = request.dataUrl;
    link.download = request.filename;

    // Use chrome.downloads API for better handling
    chrome.downloads.download({
      url: request.dataUrl,
      filename: request.filename,
      saveAs: false
    }).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });

    return true; // Keep message channel open for async response
  }

  if (request.action === 'savePreference') {
    chrome.storage.local.set({ [request.key]: request.value });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'getPreference') {
    chrome.storage.local.get([request.key]).then((result) => {
      sendResponse({ value: result[request.key] });
    });
    return true;
  }

  if (request.action === 'retake') {
    // Start a new capture session immediately
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          // Reset the active state so content script can re-initialize
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => { window.__circleSnipActive = false; }
          });
          // Start fresh
          await startCircleSnip(tab);
        }
      } catch (e) {
        console.error('Retake failed:', e);
      }
    })();
    sendResponse({ success: true });
    return true;
  }
});
