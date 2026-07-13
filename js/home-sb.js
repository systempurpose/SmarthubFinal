// ============================================================
// home-sb.js – Supabase helpers for posts (with delete)
// ============================================================

import { getSupabaseClient, encryptSecret, decryptSecret, getPassphrase } from './supabase.js';
import { sha256 } from './auth.js';

const LZString = window.LZString;

export async function compressAndEncrypt(plainText) {
    if (!LZString) {
        console.warn('LZString not loaded, skipping compression');
        const passphrase = getPassphrase();
        return await encryptSecret(plainText, passphrase);
    }
    const compressed = LZString.compressToUTF16(plainText);
    const passphrase = getPassphrase();
    return await encryptSecret(compressed, passphrase);
}

export async function decryptAndDecompress(encrypted) {
    const passphrase = getPassphrase();
    const decrypted = await decryptSecret(encrypted, passphrase);
    if (!LZString) return decrypted;
    const decompressed = LZString.decompressFromUTF16(decrypted);
    return decompressed || decrypted;
}

export async function createPost(content, mediaUrl = null, mediaType = null) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('You must be logged in');

    const encryptedContent = await compressAndEncrypt(content);
    const payload = {
        user_id: user.id,
        content: encryptedContent,
        media_url: mediaUrl,
        media_type: mediaType,
        created_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('posts').insert(payload).select();
    if (error) throw error;
    return data[0];
}

export async function fetchPosts(limit = 20, offset = 0) {
    const supabase = await getSupabaseClient();

    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) throw error;

    if (!posts || posts.length === 0) return [];

    const userIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
    const postIds = posts.map(p => p.id);

    let profiles = [];
    if (userIds.length) {
        const { data: profileData, error: profileError } = await supabase
            .from('social_profiles')
            .select('user_id, display_name, avatar_url, username')
            .in('user_id', userIds);
        if (!profileError) profiles = profileData || [];
    }
    const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));

    let likesMap = {};
    if (postIds.length) {
        const { data: likes } = await supabase
            .from('likes')
            .select('post_id')
            .in('post_id', postIds);
        if (likes) {
            likesMap = likes.reduce((acc, l) => {
                acc[l.post_id] = (acc[l.post_id] || 0) + 1;
                return acc;
            }, {});
        }
    }

    let commentsMap = {};
    if (postIds.length) {
        const { data: comments } = await supabase
            .from('comments')
            .select('post_id')
            .in('post_id', postIds);
        if (comments) {
            commentsMap = comments.reduce((acc, c) => {
                acc[c.post_id] = (acc[c.post_id] || 0) + 1;
                return acc;
            }, {});
        }
    }

    for (const post of posts) {
        try {
            post.decryptedContent = await decryptAndDecompress(post.content);
        } catch (e) {
            post.decryptedContent = '[Unable to decrypt]';
        }
        post.profiles = profileMap[post.user_id] || {};
        post.likes_count = [{ count: likesMap[post.id] || 0 }];
        post.comments_count = [{ count: commentsMap[post.id] || 0 }];
    }
    return posts;
}

export async function toggleLike(postId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    const { data: existing } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase.from('likes').delete().eq('id', existing.id);
        if (error) throw error;
        return { action: 'unliked' };
    } else {
        const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
        return { action: 'liked' };
    }
}

export async function addComment(postId, content) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    const encrypted = await compressAndEncrypt(content);
    const { data, error } = await supabase
        .from('comments')
        .insert({ post_id: postId, user_id: user.id, content: encrypted })
        .select();
    if (error) throw error;
    return data[0];
}

// ---- Helper: Extract storage path from media_url ----
function extractStoragePath(mediaUrl) {
    if (!mediaUrl) return null;
    // If it's a public URL: https://.../storage/v1/object/public/videos/videos/user-xxx/file
    // We need the part after 'videos/'
    const match = mediaUrl.match(/\/videos\/(videos\/user-[^\/]+\/[^?]+)/);
    if (match) return match[1];
    // If it's already a relative path: videos/user-xxx/file
    if (mediaUrl.startsWith('videos/')) return mediaUrl;
    return null;
}

// ---- Delete a post (owner only) with storage cleanup ----
export async function deletePost(postId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    // 1. Fetch the post to get media info
    const { data: post, error: fetchError } = await supabase
        .from('posts')
        .select('user_id, media_url, media_type')
        .eq('id', postId)
        .single();
    if (fetchError) throw fetchError;
    if (post.user_id !== user.id) throw new Error('You can only delete your own posts');

    // 2. If media exists, delete from storage
    if (post.media_url && post.media_type === 'video') {
        const storagePath = extractStoragePath(post.media_url);
        if (storagePath) {
            try {
                const { error: storageError } = await supabase.storage
                    .from('videos')
                    .remove([storagePath]);
                if (storageError) {
                    console.warn('[deletePost] Failed to delete video from storage:', storageError);
                } else {
                    console.log('[deletePost] Video deleted from storage:', storagePath);
                }
            } catch (err) {
                console.warn('[deletePost] Error deleting video:', err);
            }

            // Also delete from videos table (if metadata exists)
            try {
                const { error: metaError } = await supabase
                    .from('videos')
                    .delete()
                    .eq('storage_path', storagePath);
                if (metaError) {
                    console.warn('[deletePost] Failed to delete video metadata:', metaError);
                } else {
                    console.log('[deletePost] Video metadata deleted');
                }
            } catch (err) {
                console.warn('[deletePost] Error deleting video metadata:', err);
            }
        }
    }

    // 3. Delete the post (cascades to likes/comments)
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) throw error;
    return { success: true };
}

export function subscribeToPosts(callback) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase || typeof supabase.channel !== 'function') {
            console.warn('Realtime not available');
            return null;
        }
        const subscription = supabase
            .channel('public:posts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, callback)
            .subscribe();
        return subscription;
    } catch (err) {
        console.warn('Failed to subscribe:', err);
        return null;
    }
}