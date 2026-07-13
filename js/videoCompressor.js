// js/videoCompressor.js
export async function uploadAndCompressVideo(file, targetSizeMB = 1) {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('targetSize', targetSizeMB);

    const response = await fetch('/api/compress-video', {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Compression failed');
    }
    return await response.json();
}