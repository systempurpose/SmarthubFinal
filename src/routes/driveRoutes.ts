// src/routes/driveRoutes.ts
import { Router } from 'express';
import multer from 'multer';
import { uploadToDrive, deleteFromDrive, getAuthUrl, exchangeCode, getDriveClient } from '../lib/drive';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
});

// ---- Logging for /upload ----
router.use('/upload', (req, res, next) => {
    console.log('[Drive] Upload request received');
    console.log('[Drive] Method:', req.method);
    console.log('[Drive] Content-Type:', req.headers['content-type']);
    next();
});

// ---- Upload endpoint ----
router.post('/upload', (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('[Drive] Multer error:', err);
            return res.status(400).json({ error: err.message });
        }
        try {
            if (!req.file) {
                console.error('[Drive] No file in request');
                return res.status(400).json({ error: 'No file uploaded – field "file" missing' });
            }
            // Determine media type from request body (default to 'video')
            const mediaType = req.body.mediaType || 'video';
            console.log(`[Drive] File: ${req.file.originalname}, size: ${req.file.size} bytes, type: ${mediaType}`);
            const result = await uploadToDrive(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                mediaType   // pass media type to select folder
            );
            res.json(result);
        } catch (err: any) {
            console.error('[Drive] Upload error:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// ---- Delete endpoint ----
router.delete('/:fileId', async (req, res) => {
    try {
        await deleteFromDrive(req.params.fileId);
        res.json({ success: true });
    } catch (err: any) {
        console.error('[Drive] Delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---- OAuth: get authorization URL ----
router.get('/auth-url', (req, res) => {
    res.json({ url: getAuthUrl() });
});

// ---- OAuth: callback after user grants permission ----
router.get('/oauth2callback', async (req, res) => {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error) {
        console.error('[OAuth] Google returned an error:', error);
        return res.status(400).send(`❌ Google returned an error: ${error}`);
    }
    if (!code) {
        return res.status(400).send('Missing code parameter');
    }
    try {
        await exchangeCode(code);
        res.send('✅ Authentication successful! You can now upload files.');
    } catch (err: any) {
        console.error('[OAuth] Error exchanging code:', err);
        res.status(500).send(`❌ Authentication failed: ${err.message}`);
    }
});

// ---- Stream file from Drive (proxy) ----
router.get('/stream/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    try {
        const drive = getDriveClient();
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );
        res.setHeader('Content-Type', 'application/octet-stream');
        response.data.pipe(res);
    } catch (err: any) {
        console.error('[Drive] Stream error:', err);
        res.status(500).json({ error: 'Failed to stream file: ' + err.message });
    }
});

export default router;