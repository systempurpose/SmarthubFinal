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

// ---- NEW: Create a post with multiple media (stored as JSON array) ----
export async function createPostWithMedia(text, mediaArray) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('You must be logged in');

    const encryptedContent = await compressAndEncrypt(text);
    const payload = {
        user_id: user.id,
        content: encryptedContent,
        created_at: new Date().toISOString()
    };

    if (mediaArray && mediaArray.length) {
        payload.media_url = mediaArray[0].url;
        payload.media_type = mediaArray[0].type;
        payload.media = mediaArray; // JSONB column
    }

    const { data, error } = await supabase.from('posts').insert(payload).select();
    if (error) throw error;
    return data[0];
}

// Fetch posts with profile, like count, comment count, and current user's reaction
export async function fetchPosts(limit = 20, offset = 0) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');

    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) throw error;

    if (!posts || posts.length === 0) return [];

    const userIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
    const postIds = posts.map(p => p.id);

    // Profiles
    let profiles = [];
    if (userIds.length) {
        const { data: profileData } = await supabase
            .from('social_profiles')
            .select('user_id, display_name, avatar_url, username')
            .in('user_id', userIds);
        if (profileData) profiles = profileData;
    }
    const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));

    // Like counts and current user's reactions (if logged in)
    let likesMap = {};
    let userReactionsMap = {};
    if (postIds.length) {
        const { data: likes } = await supabase
            .from('likes')
            .select('post_id, reaction, user_id')
            .in('post_id', postIds);
        if (likes) {
            likesMap = likes.reduce((acc, l) => {
                acc[l.post_id] = (acc[l.post_id] || 0) + 1;
                return acc;
            }, {});
            if (user) {
                for (const l of likes) {
                    if (l.user_id === user.id) {
                        userReactionsMap[l.post_id] = l.reaction || '❤️';
                    }
                }
            }
        }
    }

    // Comment counts
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
        post.userReaction = userReactionsMap[post.id] || null;
    }
    return posts;
}

// ---- Fetch single post with manual join ----
export async function fetchPostById(postId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');

    const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();
    if (error) throw error;
    if (!post) return null;

    post.decryptedContent = await decryptAndDecompress(post.content);

    const { data: profile } = await supabase
        .from('social_profiles')
        .select('display_name, avatar_url, username')
        .eq('user_id', post.user_id)
        .maybeSingle();
    post.profiles = profile || {};

    const { count: likes } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);
    post.likes_count = likes || 0;

    if (user) {
        const { data: userLike } = await supabase
            .from('likes')
            .select('reaction')
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .maybeSingle();
        post.userReaction = userLike?.reaction || null;
    } else {
        post.userReaction = null;
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

// ---- Like toggle with reaction support ----
export async function toggleLike(postId, reaction) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');

    const { data: existing, error: fetchError } = await supabase
        .from('likes')
        .select('id, reaction')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (fetchError) throw fetchError;

    if (reaction === undefined) {
        if (existing) {
            const { error } = await supabase.from('likes').delete().eq('id', existing.id);
            if (error) throw error;
            return { action: 'unliked' };
        } else {
            const { error } = await supabase
                .from('likes')
                .insert({ post_id: postId, user_id: user.id, reaction: '❤️' });
            if (error) throw error;
            return { action: 'liked', reaction: '❤️' };
        }
    }

    if (existing) {
        const { error } = await supabase
            .from('likes')
            .update({ reaction })
            .eq('id', existing.id);
        if (error) throw error;
        return { action: 'updated', reaction };
    } else {
        const { error } = await supabase
            .from('likes')
            .insert({ post_id: postId, user_id: user.id, reaction });
        if (error) throw error;
        return { action: 'liked', reaction };
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

    const idStr = String(postId);
    ids = ids.map(String);

    if (ids.includes(idStr)) return { action: 'already_saved' };
    ids.push(idStr);
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

    const idStr = String(postId);
    ids = ids.map(String);

    if (!ids.includes(idStr)) return { action: 'not_saved' };
    ids = ids.filter(id => id !== idStr);
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
    try {
        const supabase = await getSupabaseClient();
        const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
        if (!user) return false;
        const { data: saved } = await supabase
            .from('saved_posts')
            .select('post_ids')
            .eq('user_id', user.id)
            .maybeSingle();
        if (!saved) return false;
        const decompressed = LZString.decompressFromUTF16(saved.post_ids);
        const ids = decompressed ? JSON.parse(decompressed) : [];
        const idStr = String(postId);
        return ids.map(String).includes(idStr);
    } catch (e) {
        console.warn('[isPostSaved] Error:', e);
        return false;
    }
}

export async function fetchSavedPostIds() {
    try {
        const supabase = await getSupabaseClient();
        const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
        if (!user) return [];
        const { data: saved } = await supabase
            .from('saved_posts')
            .select('post_ids')
            .eq('user_id', user.id)
            .maybeSingle();
        if (!saved) return [];
        const decompressed = LZString.decompressFromUTF16(saved.post_ids);
        const ids = decompressed ? JSON.parse(decompressed) : [];
        return ids.map(String);
    } catch (e) {
        console.warn('[fetchSavedPostIds] Error:', e);
        return [];
    }
}

// ---- Delete post with storage cleanup (handles multiple media) ----
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

    // Fetch the post with all media info
    const { data: post, error: fetchError } = await supabase
        .from('posts')
        .select('user_id, media_url, media_type, media')
        .eq('id', postId)
        .single();
    if (fetchError) throw fetchError;
    if (post.user_id !== user.id) throw new Error('You can only delete your own posts');

    // ---- Collect all video URLs to delete ----
    const videoUrls = [];

    // 1. Legacy single media (if it's a video)
    if (post.media_url && post.media_type === 'video') {
        videoUrls.push(post.media_url);
    }

    // 2. Multiple media from the JSONB array
    if (post.media && Array.isArray(post.media)) {
        for (const item of post.media) {
            if (item.type === 'video' && item.url) {
                videoUrls.push(item.url);
            }
        }
    }

    // ---- Delete each video file from storage and metadata ----
    for (const url of videoUrls) {
        const storagePath = extractStoragePath(url);
        if (storagePath) {
            try {
                await supabase.storage.from('videos').remove([storagePath]);
                console.log(`[deletePost] Deleted storage: ${storagePath}`);
            } catch (err) {
                console.warn(`[deletePost] Storage delete error for ${storagePath}:`, err);
            }
            try {
                await supabase.from('videos').delete().eq('storage_path', storagePath);
                console.log(`[deletePost] Deleted metadata: ${storagePath}`);
            } catch (err) {
                console.warn(`[deletePost] Metadata delete error for ${storagePath}:`, err);
            }
        }
    }

    // ---- Delete the post itself ----
    await supabase.from('posts').delete().eq('id', postId);
    return { success: true };
}

// ============================================================
// 🆕 Reaction summary & follow/unfollow helpers
// ============================================================

export async function fetchReactionsSummary(postId) {
    try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
            .from('likes')
            .select('reaction')
            .eq('post_id', postId);
        if (error) throw error;
        const summary = {};
        data.forEach(row => {
            const r = row.reaction || '❤️';
            summary[r] = (summary[r] || 0) + 1;
        });
        return summary;
    } catch (e) {
        console.warn('[fetchReactionsSummary] Error:', e);
        return {};
    }
}

export async function fetchReactedUsers(postId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
        .from('likes')
        .select('user_id, reaction, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data.length) return [];

    const userIds = [...new Set(data.map(d => d.user_id))];
    let profiles = {};
    if (userIds.length) {
        const { data: profs } = await supabase
            .from('social_profiles')
            .select('user_id, display_name, avatar_url, username')
            .in('user_id', userIds);
        if (profs) {
            profiles = Object.fromEntries(profs.map(p => [p.user_id, p]));
        }
    }

    const currentUser = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    let followingMap = {};
    if (currentUser) {
        const { data: follows } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', currentUser.id);
        if (follows) {
            followingMap = Object.fromEntries(follows.map(f => [f.following_id, true]));
        }
    }

    return data.map(row => {
        const profile = profiles[row.user_id] || { display_name: 'Unknown', avatar_url: '', username: '' };
        return {
            user_id: row.user_id,
            reaction: row.reaction || '❤️',
            display_name: profile.display_name || 'User',
            username: profile.username || '',
            avatar_url: profile.avatar_url || '',
            is_following: !!followingMap[row.user_id],
        };
    });
}

export async function followUser(targetUserId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');
    if (targetUserId === user.id) throw new Error('Cannot follow yourself');
    const { error } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: targetUserId });
    if (error) throw error;
    return { success: true };
}

export async function unfollowUser(targetUserId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) throw new Error('Not logged in');
    const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);
    if (error) throw error;
    return { success: true };
}

export async function isFollowing(targetUserId) {
    const supabase = await getSupabaseClient();
    const user = JSON.parse(localStorage.getItem('smarthub.user') || 'null');
    if (!user) return false;
    const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .maybeSingle();
    if (error) return false;
    return !!data;
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