// background.js

const YOUTUBE_ORIGINS = new Set(['https://www.youtube.com', 'https://m.youtube.com']);
const YOUTUBE_PATHNAME = '/watch';

chrome.runtime.onInstalled.addListener(() => {
  console.log("Clipchat was installed by user")
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});


chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  console.log("listening for tabs")
  if (!tab.url || info.status !== 'complete') return;


  const url = new URL(tab.url);
  const onYouTubeWatch = YOUTUBE_ORIGINS.has(url.origin) && url.pathname === YOUTUBE_PATHNAME;

  
  if (onYouTubeWatch) {
    console.log(`user has entered a youtube video: ${tab.title}`);
    await chrome.sidePanel.setOptions({ tabId, path: 'index.html', enabled: true }); //enable sidebar when user is on a youtube video
  } else {
    console.log('user has exited a youtube video');
    await chrome.sidePanel.setOptions({ tabId, enabled: false }); //disable sidebar when user exites a youtube video
  }
});

// Correct message pipe from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("listening for user to press panel")
  if (msg?.type === 'OPEN_PANEL' && sender?.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(console.error);
    sendResponse({ ok: true });
  }
});


