/*
button logic to enable users to enable sidepanel by clicking
*/

/**
 * button.js (content script)
 * - Injects a floating "ClipChat" launcher on YouTube /watch pages
 * - Works in normal view and fullscreen
 * - On click: exits fullscreen if needed, then asks background to open the side panel
 */

const YT_PATH = '/watch';
const isYouTube = () => location.hostname.endsWith('youtube.com');
const onWatchPage = () => isYouTube() && location.pathname === YT_PATH;

let launcher;

// Create the button once and attach behaviors
function createLauncher() {
  if (launcher) return launcher;

  launcher = document.createElement('button');
  launcher.className = 'clipchat-launcher clipchat-hidden';
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open ClipChat');

  launcher.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Side Panel cannot render over fullscreen; exit if needed
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (_) {}
    }

    // Send message to background.js to open the side panel
    chrome.runtime.sendMessage({ type: 'OPEN_PANEL' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Message failed:", chrome.runtime.lastError);
      } else {
        console.log("Background responded:", response);
      }
    });
  });

  document.documentElement.appendChild(launcher);
  return launcher;
}

// Show/hide based on current URL (/watch only)
function updateVisibility() {
  createLauncher();
  if (!launcher) return;
  const shouldShow = onWatchPage();
  launcher.classList.toggle('clipchat-hidden', !shouldShow);
}

// Handle YouTube’s SPA navigation (URL changes without reload)
function watchSpaNavigation() {
  let last = location.href;
  const tick = () => {
    if (location.href !== last) {
      last = location.href;
      updateVisibility();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Keep button visible in fullscreen
function watchFullscreen() {
  document.addEventListener('fullscreenchange', () => {
    updateVisibility();
  });
}

// Initialize
function init() {
  createLauncher();
  updateVisibility();
  watchSpaNavigation();
  watchFullscreen();
  console.log("[CS] button.js init on", location.href);
}

if (document.readyState === 'loading') {
    console.log("loading", location.href);
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
