// src/routes/videoCompressRoutes.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { compressVideo } from '../services/videoCompressor';

const router = Router();

const upload = multer({
    dest: 'uploads/videos/',
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported video format'));
        }
    }
});

router.post('/compress-video', upload.single('video'), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: 'No video file uploaded.' });
    }

    try {
        const targetSizeMB = req.body.targetSize ? parseFloat(req.body.targetSize) : 1;
        const maxWidth = req.body.maxWidth ? parseInt(req.body.maxWidth) : 640;
        const maxHeight = req.body.maxHeight ? parseInt(req.body.maxHeight) : 480;

        const inputPath = file.path;
        const uniqueId = randomUUID();
        const outputFilename = `compressed_${uniqueId}.mp4`;
        const outputDir = path.join('uploads', 'compressed');
        const outputPath = path.join(outputDir, outputFilename);

        await fs.mkdir(outputDir, { recursive: true });

        // Compress (outputs plain video)
        const compressedPath = await compressVideo({
            inputPath,
            outputPath,
            targetSizeMB,
            maxWidth,
            maxHeight,
            codec: 'libx264'
        });

        // Clean up original upload
        await fs.unlink(inputPath).catch(() => {});

        const stats = await fs.stat(compressedPath);
        res.json({
            success: true,
            path: `/uploads/compressed/${outputFilename}`,
            size: stats.size,
        });

    } catch (err) {
        console.error('Compression error:', err);
        if (file?.path) {
            await fs.unlink(file.path).catch(() => {});
        }
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
    }
});

export default router;