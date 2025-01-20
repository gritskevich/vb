const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class BrowserManager {
    constructor(monitoring) {
        this.monitoring = monitoring;
        this.browser = null;
        this.page = null;
        this.isNavigating = false;
        this.userDataDir = path.join(os.tmpdir(), 'virtual-browser-' + Date.now());
        this.currentUrl = null;
        this.onNavigate = null;
    }

    async initialize() {
        if (!this.browser) {
            await fs.mkdir(this.userDataDir, { recursive: true });

            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ],
                userDataDir: this.userDataDir
            });
            
            await this.createNewPage();
        }
    }

    async createNewPage() {
        if (this.page) {
            await this.page.close().catch(() => {});
        }

        this.page = await this.browser.newPage();
        await this.setupPage(this.page);
    }

    async setupPage(page) {
        await page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1,
        });

        // Handle new windows/popups
        page.on('popup', async (newPage) => {
            try {
                const url = await newPage.url();
                console.log('Popup detected:', url);
                await newPage.close();
                await this.navigate(url);
            } catch (error) {
                console.error('Popup handling error:', error);
            }
        });

        // Handle page load
        page.on('load', async () => {
            try {
                const url = await page.url();
                console.log('Page loaded:', url);
                this.currentUrl = url;
                if (this.onNavigate) {
                    this.onNavigate(url);
                }
            } catch (error) {
                console.error('Page load handler error:', error);
            }
        });

        // Log navigation attempts
        page.on('framenavigated', async frame => {
            if (frame === page.mainFrame()) {
                const url = await frame.url();
                console.log('Frame navigation detected:', url);
            }
        });
    }

    async navigate(url) {
        if (!this.page) {
            await this.createNewPage();
        }
        
        this.isNavigating = true;
        try {
            const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
            console.log('Starting navigation to:', formattedUrl);

            // Handle Google redirect URLs
            if (formattedUrl.includes('google.com/url?')) {
                const urlParams = new URL(formattedUrl).searchParams;
                const actualUrl = urlParams.get('url') || urlParams.get('q');
                if (actualUrl) {
                    console.log('Detected Google redirect, navigating to:', actualUrl);
                    return await this.navigate(actualUrl);
                }
            }

            const response = await this.page.goto(formattedUrl, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            if (!response) {
                throw new Error('Navigation failed');
            }

            const finalUrl = await this.page.url();
            this.currentUrl = finalUrl;

            // Emit navigation event
            if (this.onNavigate) {
                this.onNavigate(finalUrl);
            }

            return response;
        } catch (error) {
            console.error('Navigation error:', error.message);
            throw error;
        } finally {
            this.isNavigating = false;
        }
    }

    async isPageValid() {
        try {
            if (!this.page) return false;
            const title = await this.page.title();
            const url = await this.page.url();
            return { hasTitle: !!title, url };
        } catch (error) {
            return false;
        }
    }

    async close() {
        if (this.page) {
            await this.page.close().catch(() => {});
            this.page = null;
        }
        if (this.browser) {
            await this.browser.close().catch(() => {});
            this.browser = null;
        }
    }

    handlePageLoad() {
        this.page.url().then(url => {
            console.log('Page loaded:', {
                url,
                currentUrl: this.currentUrl
            });
        });
    }

    async restart() {
        console.log('Restarting browser');
        await this.cleanup();
        await this.initialize();
        if (this.currentUrl) {
            await this.navigate(this.currentUrl);
        }
    }

    async handleInput(data) {
        try {
            if (!await this.isPageValid()) {
                console.log('Page not valid, creating new page');
                await this.createNewPage();
                return;
            }
            
            console.log('Input received:', data.type, data);
            
            switch (data.type) {
                case 'click':
                    console.log('Processing click at:', data.x, data.y);
                    await this.page.mouse.click(data.x, data.y);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    break;
                    
                case 'mousemove':
                    await this.page.mouse.move(data.x, data.y);
                    break;
                    
                case 'mousedown':
                    await this.page.mouse.down();
                    break;
                    
                case 'mouseup':
                    await this.page.mouse.up();
                    break;
                    
                case 'wheel':
                case 'scroll':
                    console.log('Scrolling by:', data.deltaY);
                    await this.page.evaluate((deltaY) => {
                        window.scrollBy({
                            top: deltaY,
                            behavior: 'auto'
                        });
                    }, data.deltaY);
                    break;
                    
                case 'keyboard':
                    switch (data.key) {
                        case 'Enter':
                            await this.page.keyboard.press('Enter');
                            break;
                        case 'Backspace':
                            await this.page.keyboard.press('Backspace');
                            break;
                        case 'Delete':
                            await this.page.keyboard.press('Delete');
                            break;
                        case 'ArrowLeft':
                            await this.page.keyboard.press('ArrowLeft');
                            break;
                        case 'ArrowRight':
                            await this.page.keyboard.press('ArrowRight');
                            break;
                        case 'ArrowUp':
                            await this.page.keyboard.press('ArrowUp');
                            break;
                        case 'ArrowDown':
                            await this.page.keyboard.press('ArrowDown');
                            break;
                        case 'Shift':
                            if (data.down) {
                                await this.page.keyboard.down('Shift');
                            } else {
                                await this.page.keyboard.up('Shift');
                            }
                            break;
                        case '\\':
                            await this.page.keyboard.press('\\');
                            break;
                        default:
                            if (data.text) {
                                await this.page.keyboard.type(data.text);
                            }
                    }
                    break;
                    
                default:
                    console.log('Unknown input type:', data.type);
            }
        } catch (error) {
            console.error('Input handling error:', error);
            if (error.message.includes('Not attached')) {
                await this.createNewPage();
            }
        }
    }

    async clearCache() {
        if (!this.page || !this.browser) return;

        try {
            const client = await this.page.target().createCDPSession();
            await client.send('Network.clearBrowserCache');
            await client.send('Network.clearBrowserCookies');
            await client.detach();
        } catch (error) {
            console.log('Cache clearing skipped:', error.message);
        }
    }

    async cleanup() {
        try {
            // Close the browser first
            if (this.browser) {
                await this.browser.close().catch(() => {});
            }

            // Wait a bit for processes to clean up
            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to remove the directory
            try {
                const files = await fs.readdir(this.userDataDir);
                for (const file of files) {
                    const filePath = path.join(this.userDataDir, file);
                    await fs.rm(filePath, { recursive: true, force: true });
                }
                await fs.rm(this.userDataDir, { recursive: true, force: true });
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Directory cleanup error:', error.message);
                }
            }
        } catch (error) {
            console.error('Cleanup error:', error.message);
        } finally {
            this.browser = null;
            this.page = null;
        }
    }
}

module.exports = { BrowserManager }; 