// js/videoUpload.js
import { getSupabaseClient, getPassphrase, encryptBlob } from './supabase.js';
import { getCurrentUserId } from './sb-utils.js';
import { saveVideoMetadata } from './video_sb.js';
import { compressBlobLossless, isCompressionSupported } from './videoCompression.js';

const MIN_USEFUL_SAVINGS_RATIO = 0.98;

/**
 * Upload a media file (video or image) to Google Drive.
 * @param {File} file - The file to upload
 * @param {string} mediaType - 'video' or 'image' (used to select Drive folder)
 * @param {Function} onProgress - Optional progress callback
 */
export async function uploadMedia(file, mediaType = 'video', onProgress) {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('Please log in to upload.');

    // ---- 1. Lossless compression (only for videos, not for images) ----
    let blobToEncrypt = file;
    let originalSize = file.size;
    let compressedSize = file.size;
    let losslessCompressionUsed = false;

    if (mediaType === 'video' && isCompressionSupported()) {
        try {
            const gzipped = await compressBlobLossless(file);
            if (gzipped.size < originalSize * MIN_USEFUL_SAVINGS_RATIO) {
                blobToEncrypt = gzipped;
                compressedSize = gzipped.size;
                losslessCompressionUsed = true;
                console.log(`[uploadMedia] Lossless compression: ${(originalSize/1024).toFixed(0)}KB → ${(compressedSize/1024).toFixed(0)}KB (${(100 - (compressedSize/originalSize*100)).toFixed(1)}% smaller, no quality loss)`);
            } else {
                console.log(`[uploadMedia] Lossless compression saved <2%, uploading original uncompressed`);
            }
        } catch (err) {
            console.warn('[uploadMedia] Lossless compression failed, using original:', err.message);
            blobToEncrypt = file;
            compressedSize = originalSize;
            losslessCompressionUsed = false;
        }
    } else if (mediaType !== 'video') {
        console.log('[uploadMedia] Compression skipped for non-video media');
    } else {
        console.log('[uploadMedia] CompressionStream not supported in this browser, uploading original uncompressed');
    }

    // ---- 2. Encryption ----
    const passphrase = getPassphrase();
    const encryptedBlob = await encryptBlob(blobToEncrypt, passphrase);

    if (!(encryptedBlob instanceof Blob) || encryptedBlob.size === 0) {
        throw new Error('Encryption failed – invalid blob.');
    }
    console.log(`[uploadMedia] Encrypted blob size: ${(encryptedBlob.size / 1024).toFixed(0)}KB`);

    // ---- 3. Prepare FormData ----
    const formData = new FormData();
    const fileExt = file.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
    const fileName = `${Date.now()}.${fileExt}`;
    formData.append('file', encryptedBlob, `${Date.now()}.encrypted.bin`);
    formData.append('originalName', file.name);
    formData.append('mediaType', mediaType);  // pass media type

    // ---- 4. Send to backend ----
    const response = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        let errorMsg = 'Upload failed';
        try {
            const errData = await response.json();
            errorMsg = errData.error || errorMsg;
        } catch (_) {}
        throw new Error(`Server responded with ${response.status}: ${errorMsg}`);
    }

    const data = await response.json(); // { fileId, url, size }
    console.log('[uploadMedia] Upload successful. File ID:', data.fileId);

    // ---- 5. Save metadata in Supabase ----
    try {
        const videoData = {
            deviceId: null,
            originalName: file.name,
            compressedName: fileName,
            storagePath: data.fileId,
            fileSize: encryptedBlob.size,
            mimeType: file.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
            encrypted: true,
            duration: null,
            width: null,
            height: null,
            metadata: {
                originalSize: originalSize,
                compressedSize: compressedSize,
                losslessCompressionUsed: losslessCompressionUsed,
                driveFileId: data.fileId,
                drivePublicUrl: data.url,
                mediaType: mediaType,
            },
        };
        await saveVideoMetadata(videoData);
        console.log('[uploadMedia] Metadata saved to Supabase.');
    } catch (err) {
        console.warn('[uploadMedia] Metadata save failed (non-critical):', err);
    }

    return {
        url: data.url,
        publicUrl: data.url,
        storagePath: data.fileId,
        fileId: data.fileId,
    };
}

// ---- Legacy alias for video uploads ----
export async function uploadVideo(file, onProgress) {
    return uploadMedia(file, 'video', onProgress);
}

// ---- Image upload helper ----
export async function uploadImage(file, onProgress) {
    return uploadMedia(file, 'image', onProgress);
}