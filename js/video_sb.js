// js/video_sb.js
import { getSupabaseClient } from './supabase.js';
import { getCurrentUserId } from './sb-utils.js';

/**
 * Save video metadata after successful upload to storage.
 */
export async function saveVideoMetadata(videoData) {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not logged in');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('videos')
        .insert({
            user_id: userId,
            device_id: videoData.deviceId || null,
            original_name: videoData.originalName,
            compressed_name: videoData.compressedName,
            storage_path: videoData.storagePath,
            file_size: videoData.fileSize,
            mime_type: videoData.mimeType || 'video/mp4',
            encrypted: videoData.encrypted || false,
            compressed: true,
            duration: videoData.duration || null,
            width: videoData.width || null,
            height: videoData.height || null,
            metadata: videoData.metadata || {},
        })
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

/**
 * Get all videos for the current user.
 */
export async function getVideos(limit = 20) {
    const userId = getCurrentUserId();
    if (!userId) return [];

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

/**
 * Get a single video by ID.
 */
export async function getVideoById(videoId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single();
    if (error) throw error;
    return data;
}

/**
 * Delete a video (and its storage file).
 */
export async function deleteVideo(videoId) {
    const supabase = await getSupabaseClient();
    // First get the storage path
    const { data: video, error: fetchError } = await supabase
        .from('videos')
        .select('storage_path')
        .eq('id', videoId)
        .single();
    if (fetchError) throw fetchError;
    if (!video) throw new Error('Video not found');

    // Delete from storage
    const { error: storageError } = await supabase.storage
        .from('videos')
        .remove([video.storage_path]);
    if (storageError) throw storageError;

    // Delete from table
    const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);
    if (error) throw error;
}