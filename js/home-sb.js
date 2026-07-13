// ============================================================
// home-sb.js – Supabase helpers for posts (manual joins)
// ============================================================

import { getSupabaseClient, encryptSecret, decryptSecret, getPassphrase } from './supabase.js';
import { sha256 } from './auth.js';

const LZString = window.LZString;

// ---- Compress + encrypt text ----
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

// ---- Decrypt + decompress text ----
export async function decryptAndDecompress(encrypted) {
    const passphrase = getPassphrase();
    const decrypted = await decryptSecret(encrypted, passphrase);
    if (!LZString) return decrypted;
    const decompressed = LZString.decompressFromUTF16(decrypted);
    return decompressed || decrypted;
}

// ---- Create a new post ----
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

// ---- Fetch posts with manual joins ----
export async function fetchPosts(limit = 20, offset = 0) {
    const supabase = await getSupabaseClient();

    // 1. Fetch posts
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) throw error;

    if (!posts || posts.length === 0) return [];

    // 2. Get unique user IDs
    const userIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
    const postIds = posts.map(p => p.id);

    // 3. Fetch social_profiles for these users (UPDATED)
    let profiles = [];
    if (userIds.length) {
        const { data: profileData, error: profileError } = await supabase
            .from('social_profiles')   // ← changed from 'profiles'
            .select('user_id, display_name, avatar_url, username')
            .in('user_id', userIds);
        if (profileError) console.warn('Failed to fetch social_profiles:', profileError);
        else profiles = profileData || [];
    }
    const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));

    // 4. Fetch likes & comments counts (unchanged)
    let likesMap = {};
    if (postIds.length) {
        const { data: likes, error: likesError } = await supabase
            .from('likes')
            .select('post_id')
            .in('post_id', postIds);
        if (!likesError && likes) {
            likesMap = likes.reduce((acc, l) => {
                acc[l.post_id] = (acc[l.post_id] || 0) + 1;
                return acc;
            }, {});
        }
    }

    let commentsMap = {};
    if (postIds.length) {
        const { data: comments, error: commentsError } = await supabase
            .from('comments')
            .select('post_id')
            .in('post_id', postIds);
        if (!commentsError && comments) {
            commentsMap = comments.reduce((acc, c) => {
                acc[c.post_id] = (acc[c.post_id] || 0) + 1;
                return acc;
            }, {});
        }
    }

    // 5. Decrypt and attach data
    for (const post of posts) {
        post.decryptedContent = await decryptAndDecompress(post.content);
        post.profiles = profileMap[post.user_id] || {};
        post.likes_count = [{ count: likesMap[post.id] || 0 }];
        post.comments_count = [{ count: commentsMap[post.id] || 0 }];
    }

    return posts;
}

// ---- Like / unlike ----
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

// ---- Add a comment ----
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

// ---- Real-time subscription (fallback) ----
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