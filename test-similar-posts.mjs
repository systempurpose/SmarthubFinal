// test-similar-posts.mjs
import axios from 'axios';

const keywords = ['malware', 'app', 'battery', 'drain'];
const params = new URLSearchParams();
keywords.forEach(k => params.append('keywords', k));
const url = `http://localhost:3333/api/posts/by-content?${params.toString()}`;

console.log(`🔍 Fetching posts containing: ${keywords.join(', ')}`);
console.log(`📡 URL: ${url}\n`);

try {
    const response = await axios.get(url);
    const data = response.data;
    const posts = data.posts || [];

    if (posts.length === 0) {
        console.log('❌ No similar posts found.');
    } else {
        console.log(`✅ Found ${posts.length} similar post(s):\n`);
        posts.forEach((post, i) => {
            const displayName = post.profiles?.display_name || 'User';
            const contentPreview = post.content ? post.content.substring(0, 120) : 'No content preview';
            console.log(`${i+1}. ${displayName} – ${contentPreview}`);
            console.log(`   Post ID: ${post.id}`);
            console.log(`   Created: ${new Date(post.created_at).toLocaleString()}`);
            console.log('');
        });
    }
} catch (err) {
    console.error('❌ Error:', err.message);
}