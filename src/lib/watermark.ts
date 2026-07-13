/**
 * Client-side watermarking utility using HTML5 Canvas
 * Simulates the server-side watermarking pipeline from the PRD
 */
export function generateWatermarkedPreview(file: File): Promise<{ original: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 1. Setup Canvas sizes
        const maxPreviewWidth = 800;
        let previewWidth = img.width;
        let previewHeight = img.height;

        if (img.width > maxPreviewWidth) {
          previewWidth = maxPreviewWidth;
          previewHeight = (img.height * maxPreviewWidth) / img.width;
        }

        // Create canvas for preview
        const canvas = document.createElement('canvas');
        canvas.width = previewWidth;
        canvas.height = previewHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get 2D context'));
          return;
        }

        // 2. Draw the downscaled image
        ctx.drawImage(img, 0, 0, previewWidth, previewHeight);

        // 3. Add Noise/Grain Overlay
        const imgData = ctx.getImageData(0, 0, previewWidth, previewHeight);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          // Add subtle grain (random offset)
          const grain = (Math.random() - 0.5) * 12; // subtle noise
          data[i] = Math.min(255, Math.max(0, data[i] + grain));     // R
          data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain)); // G
          data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain)); // B
        }
        ctx.putImageData(imgData, 0, 0);

        // 4. Apply diagonal repeating text watermark (Dual-tone for visibility on all backgrounds)
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
        ctx.lineWidth = 1.5;
        ctx.font = 'bold 26px "Outfit", sans-serif';
        
        // Rotate the context to draw diagonal text
        const angle = -30 * Math.PI / 180;
        
        // Draw diagonal grid of watermarks
        const stepX = 240;
        const stepY = 160;
        
        // Cover an area larger than the canvas due to rotation
        const maxDim = Math.max(previewWidth, previewHeight) * 2;
        ctx.translate(previewWidth / 2, previewHeight / 2);
        ctx.rotate(angle);
        
        for (let x = -maxDim; x < maxDim; x += stepX) {
          for (let y = -maxDim; y < maxDim; y += stepY) {
            ctx.fillText('PROOFGUARD PREVIEW', x, y);
            ctx.strokeText('PROOFGUARD PREVIEW', x, y);
          }
        }
        
        ctx.restore();

        // 5. Apply subtle repeating diagonal line hatches for extra protection (Dual-tone)
        ctx.lineWidth = 1.2;
        
        // Draw light lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        for (let i = -previewHeight; i < previewWidth; i += 50) {
          ctx.moveTo(i, 0);
          ctx.lineTo(i + previewHeight, previewHeight);
        }
        ctx.stroke();

        // Draw offset dark lines to match contrast
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.beginPath();
        for (let i = -previewHeight + 25; i < previewWidth; i += 50) {
          ctx.moveTo(i, 0);
          ctx.lineTo(i + previewHeight, previewHeight);
        }
        ctx.stroke();

        // 6. Convert canvas to base64 jpeg (slightly degraded quality: 0.75)
        const previewBase64 = canvas.toDataURL('image/jpeg', 0.75);
        
        // Save original file as base64 string
        resolve({
          original: e.target?.result as string,
          preview: previewBase64
        });
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}
