// js/follow.js
import { getSupabaseClient } from './supabase.js';

/**
 * Follow a user.
 * @param {string} targetUserId - The ID of the user to follow.
 * @returns {Promise<{success: boolean}>}
 */
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

/**
 * Unfollow a user.
 * @param {string} targetUserId - The ID of the user to unfollow.
 * @returns {Promise<{success: boolean}>}
 */
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

/**
 * Check if the current user is following a given user.
 * @param {string} targetUserId
 * @returns {Promise<boolean>}
 */
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