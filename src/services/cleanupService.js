const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class CleanupService {
    constructor() {
        this.tmpDir = os.tmpdir();
        this.prefix = 'virtual-browser-';
        // 1 hour in milliseconds
        this.maxAge = 60 * 60 * 1000;
    }

    async cleanup() {
        try {
            const files = await fs.readdir(this.tmpDir);
            
            for (const file of files) {
                if (file.startsWith(this.prefix)) {
                    const filePath = path.join(this.tmpDir, file);
                    const stats = await fs.stat(filePath);
                    
                    // Check if directory is older than maxAge
                    if (Date.now() - stats.mtime.getTime() > this.maxAge) {
                        await fs.rm(filePath, { recursive: true, force: true });
                        console.log('Cleaned up:', filePath);
                    }
                }
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
}

module.exports = { CleanupService }; 