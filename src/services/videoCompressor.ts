// src/services/videoCompressor.ts
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs/promises';

// Set FFmpeg binary path
ffmpeg.setFfmpegPath(ffmpegStatic || '');

export interface CompressionOptions {
    inputPath: string;
    outputPath: string;
    targetSizeMB: number;       // e.g., 1
    maxWidth?: number;          // e.g., 640
    maxHeight?: number;         // e.g., 480
    codec?: 'libx264' | 'libx265';
}

/**
 * Compress a video to a target file size (MB) using two-pass encoding.
 * Returns the output file path.
 */
export async function compressVideo(options: CompressionOptions): Promise<string> {
    const { inputPath, outputPath, targetSizeMB, maxWidth = 640, maxHeight = 480, codec = 'libx264' } = options;

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Calculate target bitrate in kbps (rough estimate)
    // Formula: targetSize (bits) = bitrate (bps) * duration (s) * 0.9 (overhead)
    // We'll get duration first.
    const duration = await getVideoDuration(inputPath);
    const targetBits = targetSizeMB * 1024 * 1024 * 8; // MB -> bits
    // Account for audio and container overhead (~10%)
    const targetBitrate = Math.round((targetBits * 0.9) / duration / 1000); // kbps
    // Clamp to reasonable range (min 200 kbps, max 5000)
    const bitrate = Math.min(5000, Math.max(200, targetBitrate));

    return new Promise((resolve, reject) => {
        const command = ffmpeg(inputPath)
            .videoCodec(codec)
            .size(`${maxWidth}x${maxHeight}`)
            .videoBitrate(`${bitrate}k`)
            .audioCodec('aac')
            .audioBitrate('64k')
            .outputOptions([
                '-movflags +faststart', // for web streaming
                '-preset slow',         // better compression
                '-pix_fmt yuv420p',     // compatibility
                '-profile:v baseline',  // for H.264
                '-level 3.0',
                '-c:a aac',
                '-b:a 64k',
                '-ac 2',
                // Two-pass: first pass writes stats, second pass encodes
                '-pass 1',
                '-passlogfile', path.join(path.dirname(outputPath), 'ffmpeg2pass'),
                '-f mp4',
                '-y',
                '/dev/null' // first pass output to null
            ]);

        // First pass
        command.on('end', () => {
            // Second pass
            ffmpeg(inputPath)
                .videoCodec(codec)
                .size(`${maxWidth}x${maxHeight}`)
                .videoBitrate(`${bitrate}k`)
                .audioCodec('aac')
                .audioBitrate('64k')
                .outputOptions([
                    '-movflags +faststart',
                    '-preset slow',
                    '-pix_fmt yuv420p',
                    '-profile:v baseline',
                    '-level 3.0',
                    '-c:a aac',
                    '-b:a 64k',
                    '-ac 2',
                    '-pass 2',
                    '-passlogfile', path.join(path.dirname(outputPath), 'ffmpeg2pass'),
                ])
                .output(outputPath)
                .on('end', () => {
                    // Clean up pass logs
                    fs.unlink(path.join(path.dirname(outputPath), 'ffmpeg2pass-0.log')).catch(() => {});
                    fs.unlink(path.join(path.dirname(outputPath), 'ffmpeg2pass-0.log.mbtree')).catch(() => {});
                    resolve(outputPath);
                })
                .on('error', (err) => reject(err))
                .run();
        }).on('error', (err) => reject(err))
        .run();
    });
}

function getVideoDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata.format.duration || 0);
        });
    });
}