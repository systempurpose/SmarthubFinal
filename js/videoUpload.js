// js/videoUpload.js
import { getSupabaseClient, getPassphrase, encryptBlob } from './supabase.js';
import { getCurrentUserId } from './sb-utils.js';
import { saveVideoMetadata } from './video_sb.js';
import { compressBlobLossless, isCompressionSupported } from './videoCompression.js';

// Lossless (gzip) compression instead of lossy ffmpeg re-encoding — quality
// is never affected, decompression always returns the exact original file.
// Video is already compressed by its own codec before it reaches here, so
// gzip typically only shaves off a small amount (sometimes nothing). If
// gzip doesn't actually make the file smaller, we skip it and upload the
// original raw — no point paying compression time for a same-or-larger
// result.
const MIN_USEFUL_SAVINGS_RATIO = 0.98; // only keep compression if it gets below 98% of original size

export async function uploadVideo(file, onProgress) {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('Please log in to upload videos.');

    let blobToEncrypt = file;
    let originalSize = file.size;
    let compressedSize = file.size;
    let losslessCompressionUsed = false;

    if (isCompressionSupported()) {
        try {
            const gzipped = await compressBlobLossless(file);
            if (gzipped.size < originalSize * MIN_USEFUL_SAVINGS_RATIO) {
                blobToEncrypt = gzipped;
                compressedSize = gzipped.size;
                losslessCompressionUsed = true;
                console.log(`[uploadVideo] Lossless compression: ${(originalSize/1024).toFixed(0)}KB → ${(compressedSize/1024).toFixed(0)}KB (${(100 - (compressedSize/originalSize*100)).toFixed(1)}% smaller, no quality loss)`);
            } else {
                console.log(`[uploadVideo] Lossless compression saved <2%, uploading original uncompressed`);
            }
        } catch (err) {
            console.warn('[uploadVideo] Lossless compression failed, using original:', err.message);
            blobToEncrypt = file;
            compressedSize = originalSize;
            losslessCompressionUsed = false;
        }
    } else {
        console.log('[uploadVideo] CompressionStream not supported in this browser, uploading original uncompressed');
    }

    const passphrase = getPassphrase();
    const encryptedBlob = await encryptBlob(blobToEncrypt, passphrase);

    const supabase = await getSupabaseClient();
    const fileExt = file.name.split('.').pop() || 'mp4';
    const fileName = `${Date.now()}.${fileExt}`;
    const storagePath = `videos/user-${userId}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('videos')
        .upload(storagePath, encryptedBlob, {
            contentType: 'application/octet-stream',
            cacheControl: '3600',
            upsert: false,
        });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('videos').getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    try {
        const videoData = {
            deviceId: null,
            originalName: file.name,
            compressedName: fileName,
            storagePath: storagePath,
            fileSize: encryptedBlob.size,
            mimeType: 'video/mp4',
            encrypted: true,
            duration: null,
            width: null,
            height: null,
            metadata: {
                originalSize: originalSize,
                compressedSize: compressedSize,
                // Note: this now describes LOSSLESS gzip compression, not
                // the old lossy ffmpeg re-encoding. The player auto-detects
                // gzip via magic bytes on decrypt, so this flag is
                // informational (for stats/debugging) rather than required
                // for correct playback.
                losslessCompressionUsed: losslessCompressionUsed,
            },
        };
        await saveVideoMetadata(videoData);
    } catch (err) {
        console.warn('[uploadVideo] Metadata save failed:', err);
    }

    return {
        url: publicUrl,
        publicUrl: publicUrl,
        storagePath: storagePath,
    };
}