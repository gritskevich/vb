class SocketClient {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.init();
    }

    init() {
        this.socket = io({
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: this.reconnectDelay,
            timeout: 10000
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.tryReconnect();
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.tryReconnect();
        });

        // Set up ping/pong for connection health check
        setInterval(() => {
            if (this.socket.connected) {
                const start = Date.now();
                this.socket.emit('ping', () => {
                    const latency = Date.now() - start;
                    console.log(`Latency: ${latency}ms`);
                });
            }
        }, 5000);
    }

    tryReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.reconnectDelay *= 2; // Exponential backoff
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                if (!this.socket.connected) {
                    this.socket.connect();
                }
            }, this.reconnectDelay);
        } else {
            console.error('Max reconnection attempts reached');
            // Optionally reload the page or show an error message to the user
            alert('Connection lost. Please refresh the page.');
        }
    }

    // Your existing event emitters
    emitMouseMove(data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('mousemove', data);
        }
    }

    emitClick(data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('click', data);
        }
    }
}

// Initialize the client
const socketClient = new SocketClient(); 