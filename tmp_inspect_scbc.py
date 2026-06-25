from pathlib import Path
import re
path = Path(r'D:/SmartHubv14/SmartHubv5/src/routes/storageCategoryRoutes.ts')
text = path.read_text(encoding='utf-8')
for label, pattern in [
    ('media start', "case 'media': {"),
    ('system start', "case 'system': {"),
    ('other start', "case 'other': {"),
    ('default', 'default:'),
]:
    idx = text.find(pattern)
    print(label, idx)
print('media block snippet:')
media_idx = text.find("case 'media': {")
if media_idx != -1:
    print(text[media_idx:media_idx+1200])
print('other block snippet:')
other_idx = text.find("case 'other': {")
if other_idx != -1:
    print(text[other_idx:other_idx+1200])

pattern_media = re.compile(r"(case 'media': \{.*?)(case 'system': \{)", re.DOTALL)
pattern_other = re.compile(r"(case 'other': \{.*?)(default:)" , re.DOTALL)
print('media matches', len(pattern_media.findall(text)))
print('other matches', len(pattern_other.findall(text)))
