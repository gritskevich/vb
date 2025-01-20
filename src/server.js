const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { BrowserManager } = require('./services/browserManager');
const { StreamManager } = require('./services/streamManager');
const { CleanupService } = require('./services/cleanupService');
const MonitoringService = require('./services/monitoringService');

// Debug check
if (typeof MonitoringService !== 'function') {
    throw new Error(`MonitoringService is ${typeof MonitoringService}, expected function`);
}

console.log('MonitoringService:', MonitoringService);

class RenderingServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.sessions = new Map(); // Store active sessions
        
        // Add debug log
        console.log('Initializing MonitoringService');
        this.monitoring = new MonitoringService();
        
        // Add request tracking middleware FIRST
        this.app.use((req, res, next) => {
            const endTimer = this.monitoring.trackRequest(req.method, req.path);
            res.on('finish', endTimer);
            next();
        });

        this.setupExpress();
        this.setupSocketIO();
        this.cleanupService = new CleanupService();
        this.startCleanupInterval();
    }

    setupExpress() {
        this.app.use(express.static('public'));
        
        // Add cleanup endpoint
        this.app.post('/cleanup', async (req, res) => {
            try {
                for (const [socketId, session] of this.sessions) {
                    if (session.browserManager) {
                        await session.browserManager.clearCache();
                    }
                }
                await this.cleanupService.cleanup();
                res.json({ success: true, message: 'Cleanup completed' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/metrics', async (req, res) => {
            const metrics = await this.monitoring.getMetrics();
            
            // Return JSON if requested
            if (req.headers.accept === 'application/json') {
                return res.json(metrics.json);
            }
            
            // Default to Prometheus format
            res.set('Content-Type', this.monitoring.getContentType());
            res.end(metrics.prometheus);
        });

        // Add request timing middleware
        this.app.use((req, res, next) => {
            console.log(`[METRICS] Request started: ${req.method} ${req.path}`);
            const end = this.monitoring.trackRequest(req.method, req.path);
            res.on('finish', () => {
                console.log(`[METRICS] Request finished: ${req.method} ${req.path}`);
                end();
            });
            next();
        });
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {
            const removeConnection = this.monitoring.logConnection(socket.id);
            
            let browserManager = null;
            let streamManager = null;

            socket.on('requestSession', async (url) => {
                try {
                    // Cleanup any existing session
                    if (this.sessions.has(socket.id)) {
                        await this.cleanupSession(socket.id);
                    }

                    // Create new session
                    const browserManager = new BrowserManager(this.monitoring);
                    await browserManager.initialize();
                    
                    streamManager = new StreamManager(socket, this.monitoring);
                    
                    // Add navigation handler
                    browserManager.onNavigate = (url) => {
                        socket.emit('navigation', { url });
                    };

                    // Store session
                    this.sessions.set(socket.id, { browserManager, streamManager });

                    // Navigate using the monitored method
                    await browserManager.navigate(url);
                    await streamManager.startStreaming(browserManager);
                } catch (error) {
                    this.monitoring.logError('session', error);
                }
            });

            socket.on('userInput', async (data) => {
                try {
                    const session = this.sessions.get(socket.id);
                    if (session?.browserManager) {
                        await session.browserManager.handleInput(data);
                    }
                } catch (error) {
                    console.error('Input handling error:', error);
                }
            });

            socket.on('disconnect', removeConnection);

            socket.on('page', async ({ url }) => {
                try {
                    const session = this.sessions.get(socket.id);
                    if (!session) return;

                    // Start timing the navigation
                    const navigation = this.monitoring.startNavigation(url);

                    try {
                        await session.page.goto(url, {
                            waitUntil: 'networkidle0',
                            timeout: 30000
                        });
                        navigation.success();
                    } catch (error) {
                        navigation.error(error);
                        throw error;
                    }
                } catch (error) {
                    console.error('Navigation error:', error);
                }
            });
        });
    }

    startCleanupInterval() {
        // Run cleanup every hour
        setInterval(() => {
            this.cleanupService.cleanup();
        }, 60 * 60 * 1000);
    }

    async cleanupSession(socketId) {
        try {
            const session = this.sessions.get(socketId);
            if (session) {
                if (session.streamManager) {
                    session.streamManager.stop();
                }
                if (session.browserManager) {
                    try {
                        await session.browserManager.clearCache();
                    } catch (error) {
                        console.log('Cache clear failed:', error.message);
                    }
                    await session.browserManager.close();
                }
                this.sessions.delete(socketId);
                console.log('Session cleaned up:', socketId);
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`Rendering server listening on port ${this.port}`);
        });
    }

    // Cleanup all sessions on server shutdown
    async shutdown() {
        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Cleanup all sessions
        for (const socketId of this.sessions.keys()) {
            await this.cleanupSession(socketId);
        }
        
        // Final cleanup of temp directories
        await this.cleanupService.cleanup();
    }
}

const server = new RenderingServer();
server.start();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    await server.shutdown();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await server.shutdown();
    process.exit(0);
});

module.exports = RenderingServer; 