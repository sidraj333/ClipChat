// background.js

const YOUTUBE_ORIGINS = new Set(['https://www.youtube.com', 'https://m.youtube.com']);
const YOUTUBE_PATHNAME = '/watch';

function isYouTubeWatchTab(tab) {
  if (!tab?.url) return false;
  try {
    const url = new URL(tab.url);
    return YOUTUBE_ORIGINS.has(url.origin) && url.pathname === YOUTUBE_PATHNAME;
  } catch {
    return false;
  }
}

function syncActiveTabSidePanel() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) return;
    enableSidePanel(tab).catch((e) => console.error('enableSidePanel sync error:', e));
    chrome.runtime.sendMessage({
      type: 'TAB_UPDATE',
      tabId: tab.id,
      tabUrl: tab.url,
      windowId: tab.windowId,
      tabTitle: tab.title,
    }).catch((err) => console.warn('TAB_UPDATE sendMessage failed on sync', err));
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'openSidePanel',
    title: 'Open side panel',
    contexts: ['all']
  });
  syncActiveTabSidePanel();
});

// Handle browser startup (service worker restarts)
chrome.runtime.onStartup.addListener(() => {
  syncActiveTabSidePanel();
});

// Also run once when service worker starts/restarts after extension reload.
syncActiveTabSidePanel();

// Open side panel from extension action only on YouTube watch pages
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab?.url) return;
  try {
    if (!isYouTubeWatchTab(tab)) return;

    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: './index.html',
      enabled: true,
    });
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error('action click side panel error:', e);
  }
});


//enables user to enable sidepanel using toolbar icon
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openSidePanel') {
    if (!isYouTubeWatchTab(tab)) return;
    chrome.sidePanel.open({ tabId: tab.id });

  }
});

//listener to handle user switching between tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await enableSidePanel(tab);
  chrome.runtime.sendMessage({
    type: 'TAB_UPDATE',
    tabId: tab.id,
    windowId: tab.windowId,
    tabUrl: tab.url,
    tabTitle: tab.title
  }).catch((err) => console.warn('TAB_UPDATE sendMessage failed onActivated', err));
});




//listener to handle user changing url in current tab
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  await enableSidePanel(tab);
  //send tab info to react app
  chrome.runtime.sendMessage({
    type: 'TAB_UPDATE',
    tabId: tab.id,
    windowId: tab.windowId,
    tabUrl: tab.url,
    tabTitle: tab.title
  }).catch((err) => console.warn('TAB_UPDATE sendMessage failed onUpdated', err)); 
  
});



async function enableSidePanel(tab) {
  if (!tab?.id) return;
  try {
    if (isYouTubeWatchTab(tab)) {
      console.log('user has entered youtube video: ', tab.title);
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: './index.html',
        enabled: true
      });
    } else {
      console.log('user exited youtube video');
      // Disables the side panel on all other sites besides youtube
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        enabled: false
      });
    }
  } catch (e) {
    console.error('enableSidePanel error:', e);
  }

}
