// Circle Snip - Image Processor
// Handles canvas masking and PNG export with transparency

class CircleSnipProcessor {
    constructor() {
        this.canvas = null;
        this.ctx = null;
    }

    /**
     * Process the captured screenshot with a circular mask
     * @param {string} imageDataUrl - The captured screenshot as data URL
     * @param {Object} circle - Circle parameters {x, y, diameter} in CSS pixels
     * @param {Object} viewport - Viewport dimensions {width, height} in CSS pixels
     * @returns {Promise<string>} - Processed image as data URL
     */
    async process(imageDataUrl, circle, viewport) {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                try {
                    // Calculate the ACTUAL scale between captured image and viewport
                    // This is the key fix - we derive scale from actual image dimensions
                    const scaleX = img.naturalWidth / viewport.width;
                    const scaleY = img.naturalHeight / viewport.height;
                    // Use the average scale (they should be the same, but just in case)
                    const scale = (scaleX + scaleY) / 2;

                    console.log(`[CircleSnip] Image: ${img.naturalWidth}x${img.naturalHeight}, Viewport: ${viewport.width}x${viewport.height}, Scale: ${scale.toFixed(2)}`);

                    // Calculate actual pixel values using the derived scale
                    const actualDiameter = Math.round(circle.diameter * scale);
                    const actualX = Math.round(circle.x * scale);
                    const actualY = Math.round(circle.y * scale);
                    const radius = actualDiameter / 2;

                    // Create canvas with the exact circle size
                    this.canvas = document.createElement('canvas');
                    this.canvas.width = actualDiameter;
                    this.canvas.height = actualDiameter;
                    this.ctx = this.canvas.getContext('2d', {
                        willReadFrequently: false,
                        alpha: true
                    });

                    // Enable high-quality image rendering
                    this.ctx.imageSmoothingEnabled = true;
                    this.ctx.imageSmoothingQuality = 'high';

                    // Clear with transparency
                    this.ctx.clearRect(0, 0, actualDiameter, actualDiameter);

                    // Create circular clipping path with anti-aliasing
                    this.ctx.beginPath();
                    this.ctx.arc(radius, radius, radius, 0, Math.PI * 2, false);
                    this.ctx.closePath();
                    this.ctx.clip();

                    // Calculate source position (top-left of circle in the source image)
                    const sourceX = actualX - radius;
                    const sourceY = actualY - radius;

                    console.log(`[CircleSnip] Circle CSS: (${circle.x}, ${circle.y}) d=${circle.diameter}`);
                    console.log(`[CircleSnip] Circle Actual: (${actualX}, ${actualY}) d=${actualDiameter}`);
                    console.log(`[CircleSnip] Source rect: (${sourceX}, ${sourceY})`);

                    // Draw the portion of the image that falls within the circle
                    this.ctx.drawImage(
                        img,
                        sourceX, sourceY, actualDiameter, actualDiameter, // Source rect
                        0, 0, actualDiameter, actualDiameter              // Dest rect
                    );

                    // Export as PNG with transparency
                    const resultDataUrl = this.canvas.toDataURL('image/png');
                    resolve(resultDataUrl);

                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => {
                reject(new Error('Failed to load image for processing'));
            };

            img.src = imageDataUrl;
        });
    }

    /**
     * Generate a clean filename with timestamp
     * @returns {string} - Filename like circle-snip_2026-01-28_09-30-00.png
     */
    static generateFilename() {
        const now = new Date();
        const date = now.toISOString().split('T')[0]; // 2026-01-28
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // 09-30-00
        return `circle-snip_${date}_${time}.png`;
    }

    /**
     * Copy image to clipboard
     * @param {string} dataUrl - Image data URL
     * @returns {Promise<boolean>} - Success status
     */
    async copyToClipboard(dataUrl) {
        try {
            // Convert data URL to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // Use Clipboard API
            await navigator.clipboard.write([
                new ClipboardItem({
                    'image/png': blob
                })
            ]);

            return true;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    /**
     * Trigger download of the image
     * @param {string} dataUrl - Image data URL
     * @param {string} filename - Filename for download
     */
    download(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Convert data URL to Blob
     * @param {string} dataUrl - Data URL to convert
     * @returns {Blob} - Blob object
     */
    static dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }
}

// Make available globally
window.CircleSnipProcessor = CircleSnipProcessor;
