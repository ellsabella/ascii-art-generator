// videoLoader.js — Extract frames from a video file as ImageData objects

const MAX_FRAMES = 54;

/**
 * Extract frames from a video file.
 * @param {File} file - Video file from <input type="file">
 * @param {Object} options
 * @param {number} options.maxDuration - Max seconds to extract (default 3)
 * @param {number} options.maxFPS - Max frames per second (default 18)
 * @param {number} options.maxWidth - Max pixel width for extracted frames (default 800)
 * @param {function} options.onProgress - Callback(current, total) per frame
 * @returns {Promise<{ frames: ImageData[], fps: number, duration: number }>}
 */
export async function extractVideoFrames(file, options = {}) {
  const {
    maxDuration = 3,
    maxFPS = 18,
    maxWidth = 800,
    onProgress = null,
  } = options;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const url = URL.createObjectURL(file);

  try {
    // Load video metadata
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Failed to load video. Format may not be supported.'));
      video.src = url;
    });

    // Wait for enough data to seek
    await new Promise((resolve, reject) => {
      if (video.readyState >= 2) { resolve(); return; }
      video.oncanplay = resolve;
      video.onerror = () => reject(new Error('Video failed to buffer.'));
    });

    const duration = Math.min(video.duration, maxDuration);
    if (duration <= 0 || !isFinite(duration)) {
      throw new Error('Video has no valid duration.');
    }

    const fps = Math.min(maxFPS, 30); // cap extraction rate
    const totalFrames = Math.min(MAX_FRAMES, Math.max(1, Math.floor(duration * fps)));
    const frameInterval = duration / totalFrames;

    // Compute downscaled dimensions
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (width > maxWidth) {
      const scale = maxWidth / width;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const frames = [];

    for (let i = 0; i < totalFrames; i++) {
      const targetTime = i * frameInterval;

      // Seek to target time
      await new Promise((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          reject(new Error(`Seek failed at ${targetTime.toFixed(2)}s`));
        };
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        video.currentTime = targetTime;
      });

      // Draw frame to canvas and extract pixel data
      ctx.drawImage(video, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      frames.push(imageData);

      if (onProgress) onProgress(i + 1, totalFrames);
    }

    return { frames, fps, duration };
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
    video.load(); // release resources
  }
}
