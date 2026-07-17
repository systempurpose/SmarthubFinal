// src/lib/drive.ts
import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

// ---- Read env vars ----
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI?.trim() || '';

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    console.error('[Drive] ❌ Missing Google OAuth credentials in .env.');
    console.error('[Drive]   GOOGLE_CLIENT_ID present?', !!CLIENT_ID);
    console.error('[Drive]   GOOGLE_CLIENT_SECRET present?', !!CLIENT_SECRET);
    console.error('[Drive]   GOOGLE_REDIRECT_URI present?', !!REDIRECT_URI);
}

// ---- Single OAuth2 client instance ----
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// ---- Token storage ----
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

// ---- Load existing token if available ----
if (fs.existsSync(TOKEN_PATH)) {
    try {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oauth2Client.setCredentials(token);
        console.log('[Drive] ✅ Loaded existing OAuth token.');
        console.log('[Drive] Token has refresh_token?', !!token.refresh_token);
    } catch (err) {
        console.warn('[Drive] Failed to load token:', err);
    }
} else {
    console.log('[Drive] ⚠️ No token.json found. Please visit /api/drive/auth-url to authorize.');
}

/**
 * Get the authorization URL (manual construction to guarantee all parameters).
 */
export function getAuthUrl(): string {
    if (!CLIENT_ID || !REDIRECT_URI) {
        throw new Error('Cannot build auth URL — GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI is missing.');
    }
    const base = 'https://accounts.google.com/o/oauth2/v2/auth';
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline',
        prompt: 'consent',
    });
    return `${base}?${params.toString()}`;
}

/**
 * Exchange the authorization code for tokens and save them.
 */
export async function exchangeCode(code: string) {
    try {
        const { tokens } = await oauth2Client.getToken({
            code: code,
            redirect_uri: REDIRECT_URI,
        });
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('[Drive] ✅ OAuth tokens saved to token.json');
        return tokens;
    } catch (err: any) {
        console.error('[Drive] Failed to exchange code:', err.message);
        if (err.message?.includes('redirect_uri_mismatch')) {
            console.error(`[Drive] 🔎 The redirect_uri sent was: ${REDIRECT_URI}`);
            console.error('[Drive] 🔎 Confirm this EXACT string is listed under "Authorized redirect URIs" in Google Cloud Console.');
        }
        throw new Error(`Token exchange failed: ${err.message}`);
    }
}

/**
 * Get a Drive client instance (uses the existing authorized OAuth client).
 * This is exported for use in routes.
 */
export function getDriveClient() {
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
        throw new Error('OAuth client not authorized. Please visit /api/drive/auth-url to authenticate.');
    }
    return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Get the appropriate folder ID based on media type.
 * @param mediaType - 'video' or 'image' (or anything else falls back to default)
 */
function getFolderIdForMediaType(mediaType: string): string | undefined {
    const type = mediaType?.toLowerCase() || '';
    let folderId: string | undefined;

    if (type === 'video') {
        folderId = process.env.GOOGLE_DRIVE_VIDEO_FOLDER_ID?.trim() || 
                   process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    } else if (type === 'image') {
        folderId = process.env.GOOGLE_DRIVE_IMAGE_FOLDER_ID?.trim() || 
                   process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    } else {
        // Fallback to generic folder
        folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    }
    return folderId || undefined;
}

/**
 * Upload a file buffer to Google Drive.
 * @param buffer - file data
 * @param fileName - desired file name
 * @param mimeType - MIME type of the file
 * @param mediaType - 'video', 'image', or other (used to select folder)
 */
export async function uploadToDrive(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    mediaType: string = 'video'
) {
    const drive = getDriveClient();

    const folderId = getFolderIdForMediaType(mediaType);
    const fileMetadata: any = { name: fileName };
    if (folderId) {
        fileMetadata.parents = [folderId];
    }

    const media = {
        mimeType: mimeType,
        body: Readable.from(buffer),
    };

    const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webContentLink, size',
    });

    const fileId = response.data.id;
    if (!fileId) {
        throw new Error('Google Drive did not return a file ID.');
    }

    // Make file publicly readable so it can be embedded
    await drive.permissions.create({
        fileId: fileId,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    // Return the webContentLink (direct download) if available, else fallback
    const downloadUrl = response.data.webContentLink || `https://drive.google.com/uc?export=download&id=${fileId}`;

    return {
        fileId: fileId,
        url: downloadUrl,
        size: response.data.size,
    };
}

/**
 * Delete a file from Google Drive by its file ID.
 */
export async function deleteFromDrive(fileId: string) {
    if (!fileId) {
        throw new Error('File ID is required.');
    }
    const drive = getDriveClient();
    await drive.files.delete({ fileId });
}