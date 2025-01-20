class StreamManager {
    constructor(socket, monitoring) {
        this.socket = socket;
        this.monitoring = monitoring;
        this.isStreaming = false;
        this.frameInterval = null;
        this.lastScreenshot = null;
        this.recoveryAttempts = 0;
        this.maxRecoveryAttempts = 3;
        this.lastRecoveryTime = 0;
        this.recoveryTimeout = 5000;
        this.framesSinceLastStats = 0;
        this.browserManager = null;
        
        // Start monitoring interval immediately
        this.startMonitoringInterval();
    }

    startMonitoringInterval() {
        // Clear any existing interval
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        // Run every 5 seconds
        this.monitoringInterval = setInterval(() => {
            this.reportMetrics();
        }, 5000);
    }

    reportMetrics() {
        const now = Date.now();
        const currentUrl = this.browserManager?.page?.url() || 'unknown';
        
        // Calculate FPS over the last 5 seconds
        const fps = this.isStreaming ? (this.framesSinceLastStats / 5) : 0;
        
        // Prepare stats object
        const stats = {
            fps: fps.toFixed(1),
            framesCaptures: this.framesSinceLastStats,
            url: currentUrl,
            isStreaming: this.isStreaming,
            recoveryAttempts: this.recoveryAttempts,
            errors: this.lastError ? 1 : 0
        };

        // Send to monitoring
        this.monitoring.logStreamStats(stats);

        // Reset counters
        this.framesSinceLastStats = 0;
        this.lastError = null;
    }

    async startStreaming(browserManager) {
        this.isStreaming = true;
        this.browserManager = browserManager;
        this.framesSinceLastStats = 0;
        
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
                    }
                }
            } catch (error) {
                this.lastError = error;
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

        // Final metrics report before stopping
        this.reportMetrics();

        // Clear monitoring interval
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.lastScreenshot = null;
        this.recoveryAttempts = 0;
        this.lastRecoveryTime = 0;
        this.framesSinceLastStats = 0;
        this.browserManager = null;
    }
}

module.exports = { StreamManager }; 