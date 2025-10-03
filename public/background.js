// background.js

const YOUTUBE_ORIGINS = new Set(['https://www.youtube.com', 'https://m.youtube.com']);
const YOUTUBE_PATHNAME = '/watch';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'openSidePanel',
    title: 'Open side panel',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openSidePanel') {
    // This will open the panel in all the pages on the current window.
    chrome.sidePanel.open({ tabId: tab.id });
  }
});
//listener to handle user switching between tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url === '') {return;}
  console.log(tab)
  const url = new URL(tab.url);
  if (YOUTUBE_ORIGINS.has(url.origin) && url.pathname === YOUTUBE_PATHNAME) {
    console.log("user has entered youtube video: ", tab.title)
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: './index.html',
      enabled: true
    });
  } else {
    console.log("user exited youtube video")
    // Disables the side panel on all other sites
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      enabled: false
    });
  }
});




//listener to handle user changing url in current tab
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  // if (!tab.url) return;
  const url = new URL(tab.url);
  // Enables the side panel on youtube.com
  if (tab.url === '') {return;}
  if (YOUTUBE_ORIGINS.has(url.origin) && url.pathname === YOUTUBE_PATHNAME) {
    console.log("user has entered youtube video: ", tab.title)
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: './index.html',
      enabled: true
    });
  } else {
    console.log("user exited youtube video")
    // Disables the side panel on all other sites
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      enabled: false
    });
  }
});


