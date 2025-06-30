// This script is the background service worker for the extension.
// It listens for the extension's action button (the icon in the toolbar) to be clicked.
chrome.action.onClicked.addListener((tab) => {
  // When the action button is clicked, create a new tab.
  chrome.tabs.create({
    // Set the URL of the new tab to the main page of the extension.
    url: 'index.html'
  });
});
