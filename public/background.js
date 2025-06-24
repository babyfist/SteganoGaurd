
chrome.action.onClicked.addListener((tab) => {
  const extensionPageUrl = chrome.runtime.getURL('index.html');

  chrome.tabs.query({ url: extensionPageUrl }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: extensionPageUrl });
    }
  });
});
