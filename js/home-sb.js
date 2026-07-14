// ============================================================
// home-sb.js – Supabase helpers (with saved posts, manual joins)
// ============================================================

import { getSupabaseClient, encryptSecret, decryptSecret, getPassphrase } from './supabase.js';

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
        const { data: profileData } = await supabase
            .from('social_profiles')
            .select('user_id, display_name, avatar_url, username')
            .in('user_id', userIds);
        if (profileData) profiles = profileData;
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

// ---- Fetch single post with manual join ----
export async function fetchPostById(postId) {
    const supabase = await getSupabaseClient();
    // 1. Fetch post
    const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();
    if (error) throw error;
    if (!post) return null;
    post.decryptedContent = await decryptAndDecompress(post.content);
    // 2. Fetch profile
    const { data: profile } = await supabase
        .from('social_profiles')
        .select('display_name, avatar_url, username')
        .eq('user_id', post.user_id)
        .maybeSingle();
    post.profiles = profile || {};
    // 3. Like count
    const { count: likes } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);
    post.likes_count = likes || 0;
    // 4. Check if user liked
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (user) {
        const { count: userLiked } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId)
            .eq('user_id', user.id);
        post.userLiked = userLiked > 0;
    }
    return post;
}

// ---- Fetch comments with manual join ----
export async function fetchComments(postId) {
    const supabase = await getSupabaseClient();
    const { data: comments, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    const userIds = [...new Set(comments.map(c => c.user_id).filter(Boolean))];
    let profileMap = {};
    if (userIds.length) {
        const { data: profiles } = await supabase
            .from('social_profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', userIds);
        if (profiles) {
            profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));
        }
    }
    for (const comment of comments) {
        comment.decryptedContent = await decryptAndDecompress(comment.content);
        comment.user_name = profileMap[comment.user_id]?.display_name || 'User';
        comment.profiles = profileMap[comment.user_id] || {};
    }
    return comments;
}

// ---- Like toggle ----
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

// ---- Add comment ----
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

// ---- Saved Posts ----
export async function savePost(postId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    // Fetch current saved list
    const { data: saved } = await supabase
        .from('saved_posts')
        .select('post_ids')
        .eq('user_id', user.id)
        .maybeSingle();

    let ids = [];
    if (saved) {
        try {
            const decompressed = LZString.decompressFromUTF16(saved.post_ids);
            ids = decompressed ? JSON.parse(decompressed) : [];
        } catch (e) {
            ids = [];
        }
    }
    if (ids.includes(postId)) return { action: 'already_saved' };
    ids.push(postId);
    const compressed = LZString.compressToUTF16(JSON.stringify(ids));
    const { error } = await supabase
        .from('saved_posts')
        .upsert({
            user_id: user.id,
            post_ids: compressed,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    if (error) throw error;
    return { action: 'saved' };
}

export async function unsavePost(postId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    const { data: saved } = await supabase
        .from('saved_posts')
        .select('post_ids')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!saved) return { action: 'not_saved' };
    let ids = [];
    try {
        const decompressed = LZString.decompressFromUTF16(saved.post_ids);
        ids = decompressed ? JSON.parse(decompressed) : [];
    } catch (e) {
        ids = [];
    }
    if (!ids.includes(postId)) return { action: 'not_saved' };
    ids = ids.filter(id => id !== postId);
    const compressed = LZString.compressToUTF16(JSON.stringify(ids));
    const { error } = await supabase
        .from('saved_posts')
        .upsert({
            user_id: user.id,
            post_ids: compressed,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    if (error) throw error;
    return { action: 'unsaved' };
}

export async function isPostSaved(postId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) return false;
    const { data: saved } = await supabase
        .from('saved_posts')
        .select('post_ids')
        .eq('user_id', user.id)
        .maybeSingle();
    if (!saved) return false;
    try {
        const decompressed = LZString.decompressFromUTF16(saved.post_ids);
        const ids = decompressed ? JSON.parse(decompressed) : [];
        return ids.includes(postId);
    } catch (e) {
        return false;
    }
}

// ---- Delete post with storage cleanup ----
function extractStoragePath(mediaUrl) {
    if (!mediaUrl) return null;
    const match = mediaUrl.match(/\/videos\/(videos\/user-[^\/]+\/[^?]+)/);
    if (match) return match[1];
    if (mediaUrl.startsWith('videos/')) return mediaUrl;
    return null;
}

export async function deletePost(postId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    const { data: post, error: fetchError } = await supabase
        .from('posts')
        .select('user_id, media_url, media_type')
        .eq('id', postId)
        .single();
    if (fetchError) throw fetchError;
    if (post.user_id !== user.id) throw new Error('You can only delete your own posts');

    if (post.media_url && post.media_type === 'video') {
        const storagePath = extractStoragePath(post.media_url);
        if (storagePath) {
            try {
                await supabase.storage.from('videos').remove([storagePath]);
            } catch (err) {
                console.warn('[deletePost] Storage delete error:', err);
            }
            try {
                await supabase.from('videos').delete().eq('storage_path', storagePath);
            } catch (err) {
                console.warn('[deletePost] Metadata delete error:', err);
            }
        }
    }
    await supabase.from('posts').delete().eq('id', postId);
    return { success: true };
}

// ---- Realtime ----
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