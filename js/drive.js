// js/drive.js
import { google } from 'googleapis';
import fs from 'fs';

// Load the service account key from environment variable
const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
if (!keyFile) {
    console.warn('Google Drive service account key not configured. Drive operations will fail.');
}
const keys = keyFile ? JSON.parse(fs.readFileSync(keyFile, 'utf8')) : null;

let auth, drive;
if (keys) {
    auth = new google.auth.JWT({
        email: keys.client_email,
        key: keys.private_key,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    drive = google.drive({ version: 'v3', auth });
}

const SMART_HUB_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || null;

/**
 * Upload a file buffer to Google Drive
 * @param {Buffer} buffer - File data
 * @param {string} fileName - Name of the file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<{fileId: string, url: string}>}
 */
export async function uploadToDrive(buffer, fileName, mimeType) {
    if (!drive) {
        throw new Error('Google Drive client not initialized. Check your credentials.');
    }

    const fileMetadata = {
        name: fileName,
        parents: SMART_HUB_FOLDER_ID ? [SMART_HUB_FOLDER_ID] : [],
    };
    const media = {
        mimeType: mimeType,
        body: buffer,
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webContentLink, size',
    });

    // Make the file publicly readable
    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    return {
        fileId: response.data.id,
        url: `https://drive.google.com/uc?export=view&id=${response.data.id}`,
        size: response.data.size,
    };
}

/**
 * Delete a file from Google Drive by its file ID
 * @param {string} fileId - The Drive file ID
 * @returns {Promise<void>}
 */
export async function deleteFromDrive(fileId) {
    if (!drive) {
        throw new Error('Google Drive client not initialized');
    }
    await drive.files.delete({ fileId });
}