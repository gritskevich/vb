// Don't run on our virtual browser pages
if (!window.location.href.includes('localhost')) {
    // Get the current URL
    const currentUrl = window.location.href;
    
    // Redirect to our virtual browser
    window.location.href = `http://localhost/?site=${encodeURIComponent(currentUrl)}`;
} 