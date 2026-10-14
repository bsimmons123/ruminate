#!/usr/bin/env python3
"""Import eBible.org's public-domain WEB Classic verse-per-line archive.

Download https://ebible.org/Scriptures/eng-web_vpl.zip separately, then run:
    python3 scripts/import-web-bible.py /path/to/eng-web_vpl.zip
The runtime and normal builds never download Scripture.
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
archive = Path(sys.argv[1])
source = archive.read_bytes()
with zipfile.ZipFile(archive) as bundle:
    raw = bundle.read('eng-web_vpl.txt')
    notice = bundle.read('eng-web_about.htm').decode('utf-8')
books = re.findall(r'\["([^"]+)",(\d+)\]', (root / 'src/bible.ts').read_text())
codes = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV'.split()
assert len(books) == len(codes) == 66
selected = {code: [] for code in codes}
for line in raw.decode('utf-8-sig').splitlines():
    match = re.fullmatch(r'(\S+) (\d+):(\d+) (.*)', line)
    if not match:
        raise ValueError(f'Unexpected source line: {line[:80]}')
    code, chapter, verse, text = match.groups()
    if code in selected:
        selected[code].append({'chapter': int(chapter), 'verse': int(verse), 'text': text})
output = root / 'public/bible/web'
output.mkdir(parents=True, exist_ok=True)
manifest_books = []
for number, (code, (name, chapter_count)) in enumerate(zip(codes, books), 1):
    values = selected[code]
    assert {value['chapter'] for value in values} == set(range(1, int(chapter_count) + 1)), name
    assert len({(value['chapter'], value['verse']) for value in values}) == len(values), name
    assert all(value['verse'] > 0 for value in values), name
    assert values == sorted(values, key=lambda value: (value['chapter'], value['verse'])), name
    payload = ('[\n' + ',\n'.join(json.dumps(value, ensure_ascii=False, separators=(',', ':')) for value in values) + '\n]\n').encode('utf-8')
    (output / f'{number}.json').write_bytes(payload)
    manifest_books.append({'number': number, 'name': name, 'chapters': int(chapter_count), 'verses': len(values), 'sha256': hashlib.sha256(payload).hexdigest()})
manifest = {'translation': 'WEB', 'edition': 'World English Bible Classic — 2020 stable text', 'license': 'Public domain', 'source': 'https://ebible.org/Scriptures/eng-web_vpl.zip', 'sourceSha256': hashlib.sha256(source).hexdigest(), 'sourceTextSha256': hashlib.sha256(raw).hexdigest(), 'scope': '66 books of the Old and New Testaments', 'verseCount': sum(book['verses'] for book in manifest_books), 'emptyVerseCount': sum(not verse['text'].strip() for values in selected.values() for verse in values), 'books': manifest_books}
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
(output / 'publisher-notice.html').write_text(notice)
(output / 'LICENSE.txt').write_text('World English Bible Classic\n\nThe text is in the public domain. World English Bible is a trademark of eBible.org.\nThe publisher permits copying, distribution, and commercial use. If the actual text\nis changed, do not call the changed text World English Bible.\n\nPublisher notice: https://ebible.org/eng-web/copr.htm\nSource: https://ebible.org/Scriptures/eng-web_vpl.zip\n\nThis bundle includes the 66 books used by Ruminate. Verse text is preserved as\nprovided in the publisher\'s verse-per-line export. That export omits notes and formatting.\n')
print(f'Imported {len(manifest_books)} books, {manifest["verseCount"]} verses, from publisher source {manifest["sourceSha256"]}.')
