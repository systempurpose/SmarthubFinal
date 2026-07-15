// js/videoCompression.js
//
// Lossless ("zip-style") compression using the browser's native
// CompressionStream / DecompressionStream APIs (gzip under the hood).
//
// Unlike H.264/H.265 re-encoding, this never discards any video data —
// decompressing always returns byte-for-byte the exact original file. No
// blur, no artifacts, no resolution loss, ever.
//
// The honest tradeoff: video files are already compressed by the codec
// itself before they ever reach this code (H.264/H.265 inside the MP4
// container is already near its entropy limit). Gzipping something that's
// already compressed typically saves very little — often 0-10%, sometimes
// nothing at all, occasionally a few bytes *more* than the original. This
// trades "dramatically smaller" for "guaranteed identical on decompress".
//
// Supported in all current major browsers (Chrome/Edge 80+, Firefox 113+,
// Safari 16.4+). Callers should treat absence of support as "skip
// compression, upload original" rather than a hard failure.

export function isCompressionSupported() {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/**
 * Losslessly compress a Blob. Guaranteed reversible via decompressBlobLossless.
 */
export async function compressBlobLossless(blob) {
    if (!isCompressionSupported()) {
        throw new Error('CompressionStream API not supported in this browser');
    }
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
}

/**
 * Reverse compressBlobLossless. Returns the exact original bytes.
 */
export async function decompressBlobLossless(blob) {
    if (!isCompressionSupported()) {
        throw new Error('DecompressionStream API not supported in this browser');
    }
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).blob();
}

/**
 * Detects whether a blob starts with the gzip magic bytes (0x1f 0x8b).
 * Lets the player auto-detect old uncompressed uploads vs. new gzipped
 * ones without needing a separate metadata flag round-trip.
 */
export async function isGzipBlob(blob) {
    if (!blob || blob.size < 2) return false;
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    return head[0] === 0x1f && head[1] === 0x8b;
}

/**
 * Decompresses a blob only if it's actually gzipped; otherwise returns it
 * unchanged. Safe to call unconditionally on any decrypted video blob,
 * regardless of whether it was uploaded compressed or not.
 */
export async function decompressIfGzipped(blob) {
    if (await isGzipBlob(blob)) {
        return decompressBlobLossless(blob);
    }
    return blob;
}