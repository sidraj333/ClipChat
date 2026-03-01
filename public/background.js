// background.js

const YOUTUBE_ORIGINS = new Set(['https://www.youtube.com', 'https://m.youtube.com']);
const YOUTUBE_PATHNAME = '/watch';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'openSidePanel',
    title: 'Open side panel',
    contexts: ['all']
  });
  // Initialize side panel for the currently active tab on install
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab) {
      try {
        enableSidePanel(tab);
      } catch (e) {
        console.error('enableSidePanel error on install:', e);
      }
      chrome.runtime.sendMessage({
        type: 'TAB_UPDATE',
        tabId: tab.id,
        tabUrl: tab.url,
        tabTitle: tab.title,
      }).catch((err) => console.warn('TAB_UPDATE sendMessage failed on install', err));
    }
  });
});

// Handle browser startup (service worker restarts)
chrome.runtime.onStartup.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab) {
      try {
        enableSidePanel(tab);
      } catch (e) {
        console.error('enableSidePanel error on startup:', e);
      }
      chrome.runtime.sendMessage({
        type: 'TAB_UPDATE',
        tabId: tab.id,
        tabUrl: tab.url,
        tabTitle: tab.title,
      }).catch((err) => console.warn('TAB_UPDATE sendMessage failed on startup', err));
    }
  });
});


//enables user to enable sidepanel using toolbar icon
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openSidePanel') {
    // This will open the panel in all the pages on the current tab.
    chrome.sidePanel.open({ tabId: tab.id });

  }
});

//listener to handle user switching between tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  enableSidePanel(tab);
  chrome.runtime.sendMessage({
    type: 'TAB_UPDATE',
    tabId: tab.id,
    tabUrl: tab.url,
    tabTitle: tab.title
  }).catch((err) => console.warn('TAB_UPDATE sendMessage failed onActivated', err));
});




//listener to handle user changing url in current tab
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  enableSidePanel(tab);
  //send tab info to react app
  chrome.runtime.sendMessage({
    type: 'TAB_UPDATE',
    tabId: tab.id,
    tabUrl: tab.url,
    tabTitle: tab.title
  }).catch((err) => console.warn('TAB_UPDATE sendMessage failed onUpdated', err)); 
  
});


//helper functions

async function enableSidePanel(tab) {
  if (!tab || !tab.url) return;
  try {
    const url = new URL(tab.url);
    if (YOUTUBE_ORIGINS.has(url.origin) && url.pathname === YOUTUBE_PATHNAME) {
      console.log('user has entered youtube video: ', tab.title);
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: './index.html',
        enabled: true
      });
    } else {
      console.log('user exited youtube video');
      // Disables the side panel on all other sites
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        enabled: false
      });
    }
  } catch (e) {
    console.error('enableSidePanel error:', e);
  }

}

