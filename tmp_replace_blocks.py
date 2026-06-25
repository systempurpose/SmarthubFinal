import re
from pathlib import Path

path = Path(r'D:/SmartHubv14/SmartHubv5/src/routes/storageCategoryRoutes.ts')
text = path.read_text(encoding='utf-8')

media_pattern = re.compile(
    r"(\s*case 'media': \{.*?)(\s*case 'system': \{)",
    re.DOTALL
)
other_pattern = re.compile(
    r"(\s*case 'other': \{.*?)(\s*default:)",
    re.DOTALL
)

new_media = """
            case 'media': {
                console.log('[storage] Media scan started...');
                const primaryMedia = await scanFilesWithFind(deviceId, '/storage/emulated/0', true).catch(err => {
                    console.error('[storage] Media primary scan error:', err);
                    return [] as any[];
                });
                items.push(...primaryMedia);

                if (items.length === 0) {
                    console.log('[storage] Media: No items found from primary root. Trying /sdcard fallback...');
                    const fallbackMedia = await scanFilesWithFind(deviceId, '/sdcard', true).catch(err => {
                        console.error('[storage] Media fallback scan error:', err);
                        return [] as any[];
                    });
                    items.push(...fallbackMedia);
                }

                console.log(`[storage] Media complete, found ${items.length} items`);
                break;
            }
"""

new_other = """
            case 'other': {
                console.log('[storage] Other scan started...');
                const primaryOther = await scanFilesWithFind(deviceId, '/storage/emulated/0', false).catch(err => {
                    console.error('[storage] Other primary scan error:', err);
                    return [] as any[];
                });
                items.push(...primaryOther);

                if (items.length === 0) {
                    console.log('[storage] Other: No items found from primary root. Trying /sdcard fallback...');
                    const fallbackOther = await scanFilesWithFind(deviceId, '/sdcard', false).catch(err => {
                        console.error('[storage] Other fallback scan error:', err);
                        return [] as any[];
                    });
                    items.push(...fallbackOther);
                }

                console.log(`[storage] Other complete, found ${items.length} items`);
                break;
            }
"""

text, media_count = media_pattern.subn(lambda m: new_media + m.group(2), text, count=1)
text, other_count = other_pattern.subn(lambda m: new_other + m.group(2), text, count=1)

print('media replacements:', media_count)
print('other replacements:', other_count)
if media_count != 1 or other_count != 1:
    raise SystemExit('Replacement did not match expected blocks')

path.write_text(text, encoding='utf-8')
print('patched storageCategoryRoutes.ts')
