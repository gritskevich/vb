const toggle = document.getElementById('proxyToggle');

// Load initial state
chrome.storage.local.get(['proxyEnabled'], (result) => {
    if (chrome.runtime.lastError) {
        console.error('Failed to load proxy state:', chrome.runtime.lastError);
        return;
    }
    toggle.checked = result.proxyEnabled || false;
});

// Handle toggle changes
toggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    
    // Update storage
    chrome.storage.local.set({ proxyEnabled: enabled }, () => {
        if (chrome.runtime.lastError) {
            console.error('Failed to save proxy state:', chrome.runtime.lastError);
            // Revert the toggle if saving failed
            toggle.checked = !enabled;
            return;
        }

        // Send message to background script
        chrome.runtime.sendMessage({ 
            action: 'toggleProxy', 
            enabled: enabled 
        }, response => {
            if (chrome.runtime.lastError || !response || response.status !== 'ok') {
                console.error('Failed to toggle proxy:', chrome.runtime.lastError || 'Invalid response');
                // Revert the toggle if the operation failed
                toggle.checked = !enabled;
                chrome.storage.local.set({ proxyEnabled: !enabled });
            }
        });
    });
}); 