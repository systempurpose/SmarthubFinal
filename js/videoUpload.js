// js/videoUpload.js
import { getSupabaseClient, getPassphrase, encryptBlob } from './supabase.js';
import { getCurrentUserId } from './sb-utils.js';
import { saveVideoMetadata } from './video_sb.js';

/**
 * Upload a video: compress via backend, encrypt, then store in Supabase Storage.
 * @param {File} file - The video file to upload.
 * @param {Function} onProgress - Optional progress callback (0-100).
 * @returns {Promise<Object>} Saved video metadata.
 */
export async function uploadVideo(file, onProgress) {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('Please log in to upload videos.');

    // 1. Send to backend for compression
    const formData = new FormData();
    formData.append('video', file);
    formData.append('targetSize', '1'); // target ~1MB

    const response = await fetch('/api/compress-video', {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Compression failed');
    }
    const compressionResult = await response.json();

    // 2. Fetch the compressed file from the server (local path)
    const compressedUrl = compressionResult.path; // e.g., /uploads/compressed/filename.mp4
    const fileResp = await fetch(compressedUrl);
    if (!fileResp.ok) throw new Error('Failed to fetch compressed file');
    const blob = await fileResp.blob();

    // 3. Encrypt the blob
    const passphrase = getPassphrase();
    const encryptedBlob = await encryptBlob(blob, passphrase);

    // 4. Upload to Supabase Storage
    const supabase = await getSupabaseClient();
    const fileExt = file.name.split('.').pop() || 'mp4';
    const fileName = `${Date.now()}.${fileExt}`;
    const storagePath = `videos/user-${userId}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(storagePath, encryptedBlob, {
            contentType: 'application/octet-stream', // encrypted binary
            cacheControl: '3600',
            upsert: false,
        });
    if (uploadError) throw uploadError;

    // 5. Save metadata to the `videos` table
    const videoData = {
        deviceId: null,
        originalName: file.name,
        compressedName: fileName,
        storagePath: storagePath,
        fileSize: encryptedBlob.size,
        mimeType: 'video/mp4',
        encrypted: true, // mark as encrypted
        duration: null,
        width: null,
        height: null,
        metadata: { originalSize: blob.size, compressedSize: encryptedBlob.size },
    };
    const saved = await saveVideoMetadata(videoData);
    return saved;
}