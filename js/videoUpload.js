// js/videoUpload.js
import { getSupabaseClient, getPassphrase, encryptBlob } from './supabase.js';
import { getCurrentUserId } from './sb-utils.js';
import { saveVideoMetadata } from './video_sb.js';
import { uploadAndCompressVideo } from './videoCompressor.js';

export async function uploadVideo(file, onProgress) {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('Please log in to upload videos.');

    let blobToEncrypt = null;
    let originalSize = file.size;
    let compressedSize = file.size;
    let compressionUsed = false;

    // ---- Try compression using the helper ----
    try {
        const result = await uploadAndCompressVideo(file, 1); // target ~1MB
        // result contains: { path: '/uploads/compressed/filename.mp4' }
        const compressedUrl = result.path;
        const fileResp = await fetch(compressedUrl);
        if (fileResp.ok) {
            blobToEncrypt = await fileResp.blob();
            compressedSize = blobToEncrypt.size;
            compressionUsed = true;
            console.log(`[uploadVideo] Compression OK: ${(originalSize/1024).toFixed(0)}KB → ${(compressedSize/1024).toFixed(0)}KB`);
        } else {
            throw new Error('Failed to fetch compressed file');
        }
    } catch (err) {
        console.warn('[uploadVideo] Compression failed, using original:', err.message);
        blobToEncrypt = file;
        compressedSize = originalSize;
        compressionUsed = false;
    }

    // ---- Encrypt ----
    const passphrase = getPassphrase();
    const encryptedBlob = await encryptBlob(blobToEncrypt, passphrase);

    // ---- Upload to Supabase Storage ----
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

    // ---- Get public URL ----
    const { data: urlData } = supabase.storage.from('videos').getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // ---- Save metadata (optional) ----
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
                compressionUsed: compressionUsed,
            },
        };
        await saveVideoMetadata(videoData);
    } catch (err) {
        console.warn('[uploadVideo] Metadata save failed:', err);
    }

    // ---- Return public URL ----
    return {
        url: publicUrl,
        publicUrl: publicUrl,
        storagePath: storagePath,
    };
}