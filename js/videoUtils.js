// js/videoUtils.js
import { getSupabaseClient } from './supabase.js';
import { decryptBlob, getPassphrase } from './supabase.js';
import { decompressIfGzipped } from './videoCompression.js';

/**
 * Extract a Google Drive file ID from a URL.
 */
export function extractDriveFileId(url) {
    if (!url) return null;
    // Try to match ?id= or &id=
    let match = url.match(/[?&]id=([^&]+)/);
    if (match) return match[1];
    // Try to match /d/ pattern
    match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    // Try to match /uc?id= (already covered)
    // Try to match /file/d/...
    match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return null;
}

/**
 * Resolve a video URL to a public downloadable URL.
 * For Google Drive URLs, returns a proxy URL (same-origin) to avoid CORS.
 * For other HTTP/HTTPS URLs, returns as-is.
 * For storage paths, returns Supabase public URL.
 */
export async function getPublicVideoUrl(videoUrl) {
    if (!videoUrl) return null;

    // If it's a full URL...
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        // Check if it's a Google Drive URL.
        if (videoUrl.includes('drive.google.com') || videoUrl.includes('googleusercontent.com')) {
            const fileId = extractDriveFileId(videoUrl);
            if (fileId) {
                // Return the proxy endpoint (same-origin, no CORS).
                return `/api/drive/stream/${fileId}`;
            } else {
                console.warn('[getPublicVideoUrl] Could not extract Drive file ID from:', videoUrl);
                // Try to use the URL as-is (may fail due to CORS)
                return videoUrl;
            }
        }
        // For other HTTP/HTTPS URLs, return as-is.
        return videoUrl;
    }

    // Otherwise, assume it's a Supabase storage path.
    try {
        const supabase = await getSupabaseClient();
        const { data } = supabase.storage.from('videos').getPublicUrl(videoUrl);
        return data?.publicUrl || null;
    } catch (err) {
        console.warn('[getPublicVideoUrl] Supabase error:', err);
        return null;
    }
}

/**
 * Fetch and decrypt an image from Google Drive (or Supabase), returning a blob URL.
 * Includes comprehensive error handling and logging.
 */
export async function getDecryptedImageBlobUrl(imageUrl) {
    try {
        console.log('[getDecryptedImageBlobUrl] Processing:', imageUrl);

        // Step 1: Resolve the URL
        const publicUrl = await getPublicVideoUrl(imageUrl);
        if (!publicUrl) {
            throw new Error('Could not resolve image URL – got null from getPublicVideoUrl');
        }
        console.log('[getDecryptedImageBlobUrl] Resolved to:', publicUrl);

        // Step 2: Fetch the encrypted blob
        const response = await fetch(publicUrl);
        if (!response.ok) {
            throw new Error(`Fetch failed with status ${response.status}: ${response.statusText}`);
        }
        const encryptedBlob = await response.blob();
        if (encryptedBlob.size === 0) {
            throw new Error('Fetched blob is empty (size 0)');
        }
        console.log('[getDecryptedImageBlobUrl] Fetched blob size:', encryptedBlob.size, 'bytes');

        // Step 3: Decrypt
        const passphrase = getPassphrase();
        let decryptedBlob;
        try {
            decryptedBlob = await decryptBlob(encryptedBlob, passphrase);
        } catch (decryptErr) {
            throw new Error(`Decryption failed: ${decryptErr.message}`);
        }
        if (decryptedBlob.size === 0) {
            throw new Error('Decrypted blob is empty (size 0)');
        }
        console.log('[getDecryptedImageBlobUrl] Decrypted blob size:', decryptedBlob.size, 'bytes');

        // Step 4: Decompress if gzipped
        const finalBlob = await decompressIfGzipped(decryptedBlob);
        console.log('[getDecryptedImageBlobUrl] Final blob size:', finalBlob.size, 'bytes');

        // Step 5: Create blob URL
        const blobUrl = URL.createObjectURL(finalBlob);
        return blobUrl;
    } catch (err) {
        console.error('[getDecryptedImageBlobUrl] ❌ Error:', err.message);
        // Re-throw with a clear message so the caller can handle it
        throw new Error(`Image decryption failed: ${err.message}`);
    }
}