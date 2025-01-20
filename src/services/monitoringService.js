const client = require('prom-client');

class MonitoringService {
    constructor() {
        client.collectDefaultMetrics();
        
        // Connection metrics
        this.activeConnections = new client.Gauge({
            name: 'virtual_browser_active_connections',
            help: 'Number of active browser sessions'
        });

        // Stream metrics
        this.fps = new client.Gauge({
            name: 'virtual_browser_fps_current',
            help: 'Current FPS of browser sessions',
            labelNames: ['url']
        });

        this.frameCounter = new client.Counter({
            name: 'virtual_browser_frames_total',
            help: 'Total number of frames captured',
            labelNames: ['url']
        });

        // Error metrics
        this.errors = new client.Counter({
            name: 'virtual_browser_errors_total',
            help: 'Total number of errors',
            labelNames: ['type', 'url']
        });

        // Navigation metrics
        this.navigationDuration = new client.Histogram({
            name: 'virtual_browser_navigation_duration_seconds',
            help: 'Duration of page navigations',
            labelNames: ['url', 'status'],
            buckets: [0.1, 0.3, 0.5, 1, 2, 5]
        });

        // Request metrics
        this.requestDuration = new client.Histogram({
            name: 'virtual_browser_request_duration_seconds',
            help: 'Duration of HTTP requests',
            labelNames: ['method', 'route', 'status'],
            buckets: [0.1, 0.3, 0.5, 1, 2, 5]
        });

        // Streaming status
        this.streamingStatus = new client.Gauge({
            name: 'virtual_browser_streaming_status',
            help: 'Streaming status of browser sessions',
            labelNames: ['url']
        });

        // Recovery attempts
        this.recoveryAttempts = new client.Counter({
            name: 'virtual_browser_recovery_attempts_total',
            help: 'Total number of recovery attempts',
            labelNames: ['url']
        });

        // Initialize default values
        this.initializeDefaultMetrics();
    }

    initializeDefaultMetrics() {
        const defaultUrl = 'none';

        // Initialize connection metrics
        this.activeConnections.set({}, 0);

        // Initialize stream metrics
        this.fps.set({ url: defaultUrl }, 0);
        
        // Initialize frame counter (starts at 0 by default)
        this.frameCounter.inc({ url: defaultUrl }, 0);

        // Initialize error counter
        this.errors.inc({ type: 'none', url: defaultUrl }, 0);

        console.log('[METRICS] Initialized default values');
    }

    // Connection logging
    logConnection(socketId) {
        console.log(`New connection: ${socketId}`);
        this.activeConnections.inc();
        return () => {
            console.log(`Connection closed: ${socketId}`);
            this.activeConnections.dec();
        };
    }

    // Stream stats logging
    logStreamStats(stats) {
        const labels = { url: stats.url };

        // Update FPS
        this.fps.set(labels, parseFloat(stats.fps));

        // Update frame counter
        if (stats.framesCaptures > 0) {
            this.frameCounter.inc(labels, stats.framesCaptures);
        }

        // Update streaming status
        this.streamingStatus.set(labels, stats.isStreaming ? 1 : 0);

        // Update recovery attempts if any
        if (stats.recoveryAttempts > 0) {
            this.recoveryAttempts.inc(labels, stats.recoveryAttempts);
        }

        // Log errors if any
        if (stats.errors > 0) {
            this.errors.inc(labels);
        }

        console.log('[METRICS] Stream metrics:', stats);
    }

    // Error logging
    logError(type, error, url = 'unknown') {
        console.error(`Error [${type}]:`, error);
        this.errors.inc({ type, url });
    }

    // Navigation logging
    startNavigation(url) {
        const start = process.hrtime();
        console.log(`[METRICS] Starting navigation timing for: ${url}`);

        return {
            success: () => {
                const [s, ns] = process.hrtime(start);
                const duration = s + ns / 1e9;
                console.log(`[METRICS] Recording navigation success: ${duration.toFixed(2)}s for ${url}`);
                this.navigationDuration.observe({ 
                    url, 
                    status: 'success' 
                }, duration);
            },
            error: (error) => {
                const [s, ns] = process.hrtime(start);
                const duration = s + ns / 1e9;
                console.log(`[METRICS] Recording navigation error: ${duration.toFixed(2)}s for ${url}`);
                this.navigationDuration.observe({ 
                    url, 
                    status: 'error' 
                }, duration);
                this.logError('navigation', error, url);
            }
        };
    }

    // Request tracking
    trackRequest(method, route) {
        const start = process.hrtime();
        console.log(`[METRICS] Starting request timing: ${method} ${route}`);
        
        return () => {
            const [s, ns] = process.hrtime(start);
            const duration = s + ns / 1e9;
            console.log(`[METRICS] Recording request duration: ${duration.toFixed(2)}s for ${method} ${route}`);
            this.requestDuration.observe({ 
                method, 
                route, 
                status: 'success' 
            }, duration);
        };
    }

    async getMetrics() {
        const metrics = {
            activeConnections: await this.activeConnections.get(),
            fps: await this.fps.get(),
            frameCounter: await this.frameCounter.get(),
            errors: await this.errors.get(),
            navigationDuration: await this.navigationDuration.get(),
            requestDuration: await this.requestDuration.get(),
            streamingStatus: await this.streamingStatus.get(),
            recoveryAttempts: await this.recoveryAttempts.get()
        };

        console.log('[METRICS] Current state:', JSON.stringify(metrics, null, 2));
        
        // Return both formatted JSON and Prometheus format
        return {
            json: metrics,
            prometheus: await client.register.metrics()
        };
    }

    getContentType() {
        return client.register.contentType;
    }
}

module.exports = MonitoringService;