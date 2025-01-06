const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { BrowserManager } = require('./services/browserManager');
const { StreamManager } = require('./services/streamManager');
const { CleanupService } = require('./services/cleanupService');

class RenderingServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.sessions = new Map(); // Store active sessions
        
        this.setupExpress();
        this.setupSocketIO();
        this.cleanupService = new CleanupService();
        this.startCleanupInterval();

        // Add health check interval
        this.healthCheckInterval = 30000; // 30 seconds
        this.setupSocketHealthCheck();
    }

    setupExpress() {
        this.app.use(express.static('public'));
        
        // Add health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok' });
        });
        
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
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            
            let browserManager = null;
            let streamManager = null;

            socket.on('requestSession', async (url) => {
                try {
                    // Cleanup any existing session
                    if (this.sessions.has(socket.id)) {
                        await this.cleanupSession(socket.id);
                    }

                    // Create new session
                    browserManager = new BrowserManager();
                    await browserManager.initialize();
                    
                    streamManager = new StreamManager(socket);
                    
                    // Add navigation handler
                    browserManager.onNavigate = (url) => {
                        socket.emit('navigation', { url });
                    };

                    // Store session
                    this.sessions.set(socket.id, { browserManager, streamManager });

                    // Navigate and start streaming
                    await browserManager.navigate(url);
                    await streamManager.startStreaming(browserManager);
                } catch (error) {
                    console.error('Session setup error:', error);
                    socket.emit('error', { message: 'Failed to start session' });
                    await this.cleanupSession(socket.id);
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

            socket.on('disconnect', async () => {
                console.log('Client disconnected:', socket.id);
                await this.cleanupSession(socket.id);
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

    setupSocketHealthCheck() {
        setInterval(() => {
            if (this.io) {
                const sockets = Array.from(this.io.sockets.sockets.values());
                sockets.forEach(socket => {
                    if (!socket.pingCount) socket.pingCount = 0;

                    // Check if socket is still responding
                    socket.emit('ping');
                    socket.pingCount++;

                    // If socket hasn't responded to 3 pings, disconnect it
                    if (socket.pingCount > 3) {
                        console.log('Socket not responding, disconnecting:', socket.id);
                        socket.disconnect(true);
                    }
                });
            }
        }, this.healthCheckInterval);
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