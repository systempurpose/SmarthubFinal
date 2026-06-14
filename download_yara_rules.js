const https = require('https');
const fs = require('fs');
const path = require('path');

const rulesUrl = 'https://raw.githubusercontent.com/Yara-Rules/rules/master/android/android.yar';
const dest = path.join(__dirname, 'yara-rules', 'android_rules.yar');

https.get(rulesUrl, (res) => {
    const fileStream = fs.createWriteStream(dest);
    res.pipe(fileStream);
    fileStream.on('finish', () => console.log('Rules downloaded to', dest));
});