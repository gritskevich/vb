# Virtual Browser

A real-time browser streaming solution that allows you to view and interact with a browser session through a web interface.

## Features

- Real-time browser streaming
- Full keyboard and mouse input support
- Mouse wheel scrolling
- Cross-platform compatibility
- Docker support
- Efficient frame delivery via WebSocket
- Automatic recovery and error handling

## Prerequisites

- Node.js 18+
- Docker and Docker Compose (for containerized deployment)
- Modern web browser

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start the development server
npm run dev:all
```

### Docker Deployment

```bash
# Build and start the container
docker-compose up --build

# Stop the container
docker-compose down
```

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Enter a URL in the address bar
3. Interact with the remote browser session:
   - Click and type as normal
   - Use mouse wheel for scrolling
   - All keyboard shortcuts work as expected

## Development

```bash
# Clean install
npm run clean && npm install

# Start development server with auto-reload
npm run dev:all
```

## Docker Commands

```bash
# Full rebuild
docker-compose down && docker rmi virtual-browser-app && docker-compose up --build

# Start existing container
docker-compose up

# Stop container
docker-compose down
```

## Project Structure

```
virtual-browser/
├── src/
│   ├── browserManager.js    # Browser control and input handling
│   ├── streamManager.js     # Screen capture and streaming
│   └── server.js           # Main server and WebSocket handling
├── public/
│   └── index.html          # Web client interface
├── Dockerfile              # Container definition
├── docker-compose.yml      # Container orchestration
└── package.json           # Project dependencies and scripts
```

## Technical Details

- Uses Puppeteer for browser automation
- WebSocket-based streaming for low latency
- Docker containerization for easy deployment
- Automatic error recovery and session management
