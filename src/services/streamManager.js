class StreamManager {
    constructor(socket) {
        this.socket = socket;
        this.isStreaming = false;
        this.frameInterval = null;
        this.lastScreenshot = null;
        this.recoveryAttempts = 0;
        this.maxRecoveryAttempts = 3;
        this.lastRecoveryTime = 0;
        this.recoveryTimeout = 5000;
        this.lastValidityCheck = 0;
        this.validityCheckInterval = 2000;
        this.lastStatsTime = 0;
        this.framesSinceLastStats = 0;
        this.browserManager = null;
    }

    logStats() {
        const now = Date.now();
        if (now - this.lastStatsTime >= 5000) { // Every 5 seconds
            const fps = this.framesSinceLastStats / 5; // frames per second over 5 seconds
            const currentUrl = this.browserManager?.page?.url() || 'unknown';
            console.log('Stream stats:', {
                fps: fps.toFixed(1),
                framesCaptures: this.framesSinceLastStats,
                url: currentUrl
            });
            this.framesSinceLastStats = 0;
            this.lastStatsTime = now;
        }
    }

    async startStreaming(browserManager) {
        this.isStreaming = true;
        this.browserManager = browserManager;
        this.framesSinceLastStats = 0;
        this.lastStatsTime = Date.now();
        
        const captureFrame = async () => {
            if (!this.isStreaming) return;
            
            try {
                if (this.browserManager.page) {
                    if (this.browserManager.isNavigating) {
                        this.navigationTimeout = setTimeout(() => {
                            this.isStreaming = true;
                            captureFrame();
                        }, 1000);
                        return;
                    }

                    // Keep the page active with a tiny mouse movement
                    await this.browserManager.page.mouse.move(0, 0).catch(() => {});
                    
                    const screenshot = await this.browserManager.page.screenshot({
                        encoding: 'binary'
                    }).catch(() => null);

                    if (screenshot) {
                        this.socket.emit('frame', screenshot);
                        this.framesSinceLastStats++;
                        this.logStats();
                    }
                }
            } catch (error) {
                this.logError(error);
            }

            if (this.isStreaming) {
                setTimeout(captureFrame, 1000 / 30);
            }
        };

        captureFrame();
    }

    stop() {
        this.isStreaming = false;
        if (this.navigationTimeout) {
            clearTimeout(this.navigationTimeout);
            this.navigationTimeout = null;
        }
        this.lastScreenshot = null;
        this.recoveryAttempts = 0;
        this.lastRecoveryTime = 0;
        this.lastValidityCheck = 0;
        this.framesSinceLastStats = 0;
        this.lastStatsTime = 0;
        this.browserManager = null;
    }

    logError(error) {
        const now = Date.now();
        if (now - this.lastErrorTime > 5000) { // Log errors at most every 5 seconds
            console.error('Stream error:', error.message);
            this.lastErrorTime = now;
        }
    }
}

module.exports = { StreamManager }; 