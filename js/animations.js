// js/animations.js
// Companion module for css/animations.css. Pure DOM helpers, no
// framework dependency — designed to drop into home.js, home-loader.js,
// postView.js, etc. with a couple of one-line calls at existing hooks.

/* ------------------------------------------------------------
   1. Like burst
   Call from your like button click handler, e.g.:
     likeBtn.addEventListener('click', () => {
       burstLike(likeBtn);
       toggleLike(postId); // your existing logic
     });
------------------------------------------------------------- */
export function burstLike(buttonEl, { count = 6, emoji = '❤️' } = {}) {
    if (!buttonEl) return;
    const wrapper = buttonEl.closest('.like-wrapper') || buttonEl.parentElement;
    if (!wrapper) return;

    buttonEl.classList.add('hca-liking');
    buttonEl.addEventListener('animationend', () => {
        buttonEl.classList.remove('hca-liking');
    }, { once: true });

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('span');
        particle.className = 'hca-particle';
        particle.textContent = emoji;

        const angle = (Math.random() * 100 - 50) * (Math.PI / 180); // spread ~±50deg from vertical
        const distance = 28 + Math.random() * 26;
        const tx = Math.sin(angle) * distance;
        const ty = -Math.abs(Math.cos(angle) * distance) - 10;
        const rot = (Math.random() * 40 - 20).toFixed(0);

        particle.style.setProperty('--tx', `${tx.toFixed(1)}px`);
        particle.style.setProperty('--ty', `${ty.toFixed(1)}px`);
        particle.style.setProperty('--rot', `${rot}deg`);
        particle.style.animationDelay = `${i * 25}ms`;

        wrapper.appendChild(particle);
        particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
}

/** Small bump on the reaction-summary chip when a new reaction lands. */
export function bumpReactionChip(chipEl) {
    if (!chipEl) return;
    chipEl.classList.remove('hca-bump');
    // force reflow so the animation can replay if it's already applied
    void chipEl.offsetWidth;
    chipEl.classList.add('hca-bump');
    chipEl.addEventListener('animationend', () => chipEl.classList.remove('hca-bump'), { once: true });
}

/* ------------------------------------------------------------
   2. Post feed entrance
   Call once after you render a batch of posts into #homeContent:
     container.innerHTML = postsHtml;
     staggerFeedIn(container.querySelectorAll('.post-card'));
------------------------------------------------------------- */
export function staggerFeedIn(cards, { step = 45, max = 8 } = {}) {
    cards.forEach((card, i) => {
        card.classList.add('hca-post-in');
        card.style.animationDelay = `${Math.min(i, max) * step}ms`;
        card.addEventListener('animationend', () => {
            card.classList.remove('hca-post-in');
            card.style.animationDelay = '';
        }, { once: true });
    });
}

/** For a single optimistically-inserted post (e.g. right after posting). */
export function markPostAsNew(cardEl) {
    if (!cardEl) return;
    cardEl.classList.add('hca-post-new');
    cardEl.addEventListener('animationend', () => cardEl.classList.remove('hca-post-new'), { once: true });
}

/* ------------------------------------------------------------
   3. Composer submit + media upload
------------------------------------------------------------- */
export function setComposerSending(buttonEl, isSending) {
    if (!buttonEl) return;
    buttonEl.classList.toggle('hca-sending', isSending);
}

/** Flash a success state on the submit button, then restore its original label. */
export function flashComposerSuccess(buttonEl, { label = 'Post', duration = 900 } = {}) {
    if (!buttonEl) return;
    const original = buttonEl.textContent;
    buttonEl.innerHTML = '<i class="fas fa-check hca-check"></i>';
    buttonEl.classList.add('hca-success');
    setTimeout(() => {
        buttonEl.classList.remove('hca-success');
        buttonEl.textContent = label ?? original;
    }, duration);
}

/**
 * Drive an upload progress bar. Pass the container where the bar should
 * live (e.g. #composerUploadProgress) and either a 0-100 percent, or
 * omit percent for an indeterminate sweep.
 */
export function renderUploadProgress(containerEl, percent = null) {
    if (!containerEl) return;
    let track = containerEl.querySelector('.hca-progress-track');
    let fill = containerEl.querySelector('.hca-progress-fill');
    if (!track) {
        track = document.createElement('div');
        track.className = 'hca-progress-track';
        fill = document.createElement('div');
        fill.className = 'hca-progress-fill';
        track.appendChild(fill);
        containerEl.appendChild(track);
    }
    if (percent === null) {
        fill.classList.add('hca-indeterminate');
    } else {
        fill.classList.remove('hca-indeterminate');
        fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
}

export function clearUploadProgress(containerEl) {
    const track = containerEl?.querySelector('.hca-progress-track');
    if (track) track.remove();
}

/** Animate a freshly-added media thumbnail into the composer preview row. */
export function animateThumbIn(thumbEl) {
    if (!thumbEl) return;
    thumbEl.classList.add('hca-thumb-in');
    thumbEl.addEventListener('animationend', () => thumbEl.classList.remove('hca-thumb-in'), { once: true });
}

/* ------------------------------------------------------------
   4. Reaction modal row stagger
   Call after you render the list of users into .reaction-modal-body:
     staggerReactionRows(modalBody.querySelectorAll('.reaction-user-item'));
------------------------------------------------------------- */
export function staggerReactionRows(rows, { step = 30 } = {}) {
    rows.forEach((row, i) => {
        row.classList.add('hca-row-in');
        row.style.animationDelay = `${i * step}ms`;
        row.addEventListener('animationend', () => {
            row.classList.remove('hca-row-in');
            row.style.animationDelay = '';
        }, { once: true });
    });
}

/* ------------------------------------------------------------
   5. Pull-to-refresh
   Attaches touch handlers to a scrollable container (e.g. #homeContent).
   Only triggers when the container is already scrolled to the top.
   Usage:
     initPullToRefresh(document.getElementById('homeContent'), async () => {
       await loadHomeFeed('homeContent');
     });
------------------------------------------------------------- */
export function initPullToRefresh(scrollEl, onRefresh, { threshold = 70 } = {}) {
    if (!scrollEl || typeof onRefresh !== 'function') return () => {};

    const indicator = document.createElement('div');
    indicator.className = 'hca-pull-indicator';
    indicator.innerHTML = '<i class="fas fa-arrow-rotate-right"></i>';
    scrollEl.parentElement.insertBefore(indicator, scrollEl);

    let startY = 0;
    let pulling = false;
    let refreshing = false;

    function onTouchStart(e) {
        if (scrollEl.scrollTop > 0 || refreshing) return;
        startY = e.touches[0].clientY;
        pulling = true;
    }

    function onTouchMove(e) {
        if (!pulling || refreshing) return;
        const delta = e.touches[0].clientY - startY;
        if (delta <= 0) return;
        const height = Math.min(delta * 0.5, threshold + 20);
        indicator.style.height = `${height}px`;
        indicator.classList.toggle('hca-pull-ready', height >= threshold);
    }

    async function onTouchEnd() {
        if (!pulling || refreshing) { pulling = false; return; }
        pulling = false;
        const ready = indicator.classList.contains('hca-pull-ready');
        if (ready) {
            refreshing = true;
            indicator.style.height = '44px';
            try {
                await onRefresh();
            } finally {
                refreshing = false;
                indicator.style.height = '0px';
                indicator.classList.remove('hca-pull-ready');
            }
        } else {
            indicator.style.height = '0px';
        }
    }

    scrollEl.addEventListener('touchstart', onTouchStart, { passive: true });
    scrollEl.addEventListener('touchmove', onTouchMove, { passive: true });
    scrollEl.addEventListener('touchend', onTouchEnd);

    // Return a cleanup function for when the page unmounts
    return function destroy() {
        scrollEl.removeEventListener('touchstart', onTouchStart);
        scrollEl.removeEventListener('touchmove', onTouchMove);
        scrollEl.removeEventListener('touchend', onTouchEnd);
        indicator.remove();
    };
}

/* ------------------------------------------------------------
   6. Toasts
   showToast('Post published!', 'success');
   showToast('Failed to post: ' + err.message, 'error');
------------------------------------------------------------- */
const TOAST_ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info',
};

function getToastContainer() {
    let el = document.getElementById('hcaToastContainer');
    if (!el) {
        el = document.createElement('div');
        el.id = 'hcaToastContainer';
        document.body.appendChild(el);
    }
    return el;
}

export function showToast(message, type = 'info', duration = 3200) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `hca-toast hca-toast-${type}`;
    toast.innerHTML = `<i class="fas ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span></span>`;
    toast.querySelector('span').textContent = message;
    container.appendChild(toast);

    const remove = () => {
        toast.classList.add('hca-toast-out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };
    const timer = setTimeout(remove, duration);
    toast.addEventListener('click', () => {
        clearTimeout(timer);
        remove();
    });

    return remove;
}