// Simple background script to handle installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed successfully');
});