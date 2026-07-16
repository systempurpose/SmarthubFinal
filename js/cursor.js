// js/cursor.js
// Custom cursor inspired by Threads desktop – always circular, scales on hover.

const MAGNETIC_SELECTOR = [
    'button',
    'a',
    '.bottom-nav-item',
    '.feed-tabs button',
    '.composer-submit',
    '.composer-tools button',
    '.reaction-summary',
    '.emoji-picker span',
].join(', ');

const MEDIA_SELECTOR = [
    'img',
    'video',
    '.video-thumbnail-container',
    '.media-preview-item',
    '.profile-cover',
    '.profile-avatar-wrap',
].join(', ');

const TEXT_SELECTOR = 'input, textarea, [contenteditable="true"]';

let destroyFn = null;

export function initCustomCursor() {
    if (destroyFn) return destroyFn;

    if (!window.matchMedia('(pointer: fine)').matches) {
        return () => {};
    }

    document.documentElement.classList.add('hca-custom-cursor-active');

    const dot = document.createElement('div');
    dot.id = 'hcaCursorDot';
    const ring = document.createElement('div');
    ring.id = 'hcaCursorRing';
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let rafId = null;
    let hasMoved = false;

    function onMove(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        if (!hasMoved) {
            hasMoved = true;
            ringX = mouseX;
            ringY = mouseY;
        }
        dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
    }

    function loop() {
        const ease = 0.18;
        ringX += (mouseX - ringX) * ease;
        ringY += (mouseY - ringY) * ease;
        ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
        rafId = requestAnimationFrame(loop);
    }

    function onOver(e) {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const magnetic = target.closest(MAGNETIC_SELECTOR);
        const media = !magnetic && target.closest(MEDIA_SELECTOR);
        const text = !magnetic && !media && target.closest(TEXT_SELECTOR);

        dot.classList.toggle('hca-cursor-dot-hidden', !!(magnetic || media || text));

        // Remove all state classes first
        ring.classList.remove(
            'hca-cursor-ring-button',
            'hca-cursor-ring-media',
            'hca-cursor-ring-text'
        );

        if (magnetic) {
            ring.classList.add('hca-cursor-ring-button');
        } else if (media) {
            ring.classList.add('hca-cursor-ring-media');
        } else if (text) {
            ring.classList.add('hca-cursor-ring-text');
        }
    }

    function onDown() {
        ring.classList.add('hca-cursor-click');
    }
    function onUp() {
        ring.classList.remove('hca-cursor-click');
    }
    function onLeaveWindow() {
        dot.classList.add('hca-cursor-away');
        ring.classList.add('hca-cursor-away');
    }
    function onEnterWindow() {
        dot.classList.remove('hca-cursor-away');
        ring.classList.remove('hca-cursor-away');
    }

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('mouseleave', onLeaveWindow);
    document.addEventListener('mouseenter', onEnterWindow);

    rafId = requestAnimationFrame(loop);

    destroyFn = function destroy() {
        cancelAnimationFrame(rafId);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseover', onOver);
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('mouseleave', onLeaveWindow);
        document.removeEventListener('mouseenter', onEnterWindow);
        dot.remove();
        ring.remove();
        document.documentElement.classList.remove('hca-custom-cursor-active');
        destroyFn = null;
    };

    return destroyFn;
}

// Self-initialize
initCustomCursor();

export function destroyCustomCursor() {
    if (destroyFn) destroyFn();
}