// js/videoUpload.js
import { getSupabaseClient, getPassphrase, encryptBlob } from './supabase.js';
import { getCurrentUserId } from './sb-utils.js';
import { saveVideoMetadata } from './video_sb.js';

export async function uploadVideo(file, onProgress) {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('Please log in to upload videos.');

    let blobToEncrypt = null;
    let originalSize = file.size;
    let compressedSize = file.size;
    let compressionUsed = false;

    // Try compression (fallback if fails)
    try {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('targetSize', '1');

        const response = await fetch('/api/compress-video', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const result = await response.json();
            const compressedUrl = result.path;
            const fileResp = await fetch(compressedUrl);
            if (fileResp.ok) {
                blobToEncrypt = await fileResp.blob();
                compressedSize = blobToEncrypt.size;
                compressionUsed = true;
            } else {
                throw new Error('Failed to fetch compressed file');
            }
        } else {
            const err = await response.json();
            throw new Error(err.error || 'Compression service error');
        }
    } catch (err) {
        console.warn('[uploadVideo] Compression failed, using original:', err.message);
        blobToEncrypt = file;
        compressedSize = originalSize;
        compressionUsed = false;
    }

    // Encrypt
    const passphrase = getPassphrase();
    const encryptedBlob = await encryptBlob(blobToEncrypt, passphrase);

    // Upload to Supabase Storage
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

    // Get public URL
    const { data: urlData } = supabase.storage.from('videos').getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // Save metadata (optional, don't fail if it errors)
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

    // Return public URL
    return {
        url: publicUrl,
        publicUrl: publicUrl,
        storagePath: storagePath,
    };
}