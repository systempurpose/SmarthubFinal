// src/routes/videoCompressRoutes.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { compressVideo } from '../services/videoCompressor';

// Import the encryption helpers from server.ts (make sure they are exported)
import { encryptSecret, decryptSecret, getPassphrase } from '../server';

const router = Router();

// ---- Multer config ----
const upload = multer({
    dest: 'uploads/videos/',
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max original
    fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported video format'));
        }
    }
});

// ---- Helper: encrypt a buffer ----
async function encryptBlobBuffer(buffer: Buffer, passphrase: string): Promise<Buffer> {
    const base64 = buffer.toString('base64');
    const encrypted = await encryptSecret(base64, passphrase);
    return Buffer.from(encrypted, 'utf8');
}

// ---- Helper: decrypt a buffer ----
async function decryptBlobBuffer(encryptedBuffer: Buffer, passphrase: string): Promise<Buffer> {
    const text = encryptedBuffer.toString('utf8');
    const decryptedBase64 = await decryptSecret(text, passphrase);
    return Buffer.from(decryptedBase64, 'base64');
}

// ---- POST /api/compress-video ----
router.post('/compress-video', upload.single('video'), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: 'No video file uploaded.' });
    }

    try {
        // 1. Parse parameters
        const targetSizeMB = req.body.targetSize ? parseFloat(req.body.targetSize) : 1;
        const maxWidth = req.body.maxWidth ? parseInt(req.body.maxWidth) : 640;
        const maxHeight = req.body.maxHeight ? parseInt(req.body.maxHeight) : 480;

        // 2. Define paths
        const inputPath = file.path;
        const uniqueId = randomUUID();
        const outputFilename = `compressed_${uniqueId}.mp4`;
        const encryptedFilename = `encrypted_${uniqueId}.bin`;
        const outputDir = path.join('uploads', 'compressed');
        const outputPath = path.join(outputDir, outputFilename);
        const encryptedPath = path.join(outputDir, encryptedFilename);

        await fs.mkdir(outputDir, { recursive: true });

        // 3. Compress the video
        const compressedPath = await compressVideo({
            inputPath,
            outputPath,
            targetSizeMB,
            maxWidth,
            maxHeight,
            codec: 'libx264'
        });

        // 4. Read compressed file and encrypt
        const compressedBuffer = await fs.readFile(compressedPath);
        const passphrase = getPassphrase();
        const encryptedBuffer = await encryptBlobBuffer(compressedBuffer, passphrase);

        // 5. Save encrypted file
        await fs.writeFile(encryptedPath, encryptedBuffer);

        // 6. Optionally delete the plaintext compressed file (keep only encrypted)
        await fs.unlink(compressedPath).catch(() => {});

        // 7. Clean up original upload
        await fs.unlink(inputPath).catch(() => {});

        // 8. Respond with encrypted file info
        const stats = await fs.stat(encryptedPath);
        res.json({
            success: true,
            original: file.originalname,
            encrypted: encryptedFilename,
            size: stats.size,
            path: `/uploads/compressed/${encryptedFilename}`,
            // For direct playback, you can also include a decryption endpoint
            playbackUrl: `/api/decrypt-video/${encryptedFilename}`
        });

    } catch (err) {
        console.error('Compression/encryption error:', err);
        // Clean up uploaded file if still exists
        if (file?.path) {
            await fs.unlink(file.path).catch(() => {});
        }
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

// ---- GET /api/decrypt-video/:file - Decrypt and stream video ----
router.get('/decrypt-video/:file', async (req: Request, res: Response) => {
    const filename = req.params.file;
    if (!filename.endsWith('.bin')) {
        return res.status(400).json({ error: 'Invalid file type' });
    }

    const filePath = path.join('uploads', 'compressed', filename);
    try {
        const encryptedBuffer = await fs.readFile(filePath);
        const passphrase = getPassphrase();
        const decryptedBuffer = await decryptBlobBuffer(encryptedBuffer, passphrase);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `inline; filename="${filename.replace('.bin', '.mp4')}"`);
        res.send(decryptedBuffer);
    } catch (err) {
        console.error('Decryption error:', err);
        res.status(500).json({ error: 'Failed to decrypt video' });
    }
});

// ---- (Optional) Serve encrypted files directly (no decryption) ----
router.get('/uploads/compressed/:file', async (req: Request, res: Response) => {
    const filename = req.params.file;
    const filePath = path.join('uploads', 'compressed', filename);
    try {
        await fs.access(filePath);
        res.sendFile(filePath, { root: process.cwd() });
    } catch {
        res.status(404).json({ error: 'File not found' });
    }
});

export default router;