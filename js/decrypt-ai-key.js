// src/decrypt-ai-key.js
const crypto = require('crypto');

const PASSPHRASE = 'SmartHub2026!SecureKey';
const SALT_HEX = 'a1b2c3d4e5f67890a1b2c3d4e5f67890';

function hexToBuffer(hex) {
    return Buffer.from(hex, 'hex');
}

function deriveKey(passphrase, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(passphrase, salt, 100000, 32, 'sha256', (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    });
}

function base64Decode(str) {
    return Buffer.from(str, 'base64');
}

async function decryptAIKey(encryptedData) {
    const [ivBase64, ciphertextBase64] = encryptedData.split(':');
    if (!ivBase64 || !ciphertextBase64) {
        throw new Error('Invalid encrypted data format.');
    }
    const iv = base64Decode(ivBase64);
    const ciphertext = base64Decode(ciphertextBase64);
    const salt = hexToBuffer(SALT_HEX);
    const key = await deriveKey(PASSPHRASE, salt);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

async function getAIKey() {
    const { ENCRYPTED_AI_API_KEY } = require('./ai-encrypted-key.js');
    return decryptAIKey(ENCRYPTED_AI_API_KEY);
}

module.exports = { decryptAIKey, getAIKey };