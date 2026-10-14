#!/usr/bin/env python3
"""Import pinned local KJV (eBible VPL), ASV and YLT (GetBible JSON) sources.

Usage: python3 scripts/import-public-bibles.py KJV.zip ASV.json YLT.json
Normal builds never download Scripture. Source hashes and distribution notices
are included with every bundle. WEB is imported by import-web-bible.py.
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

if len(sys.argv) != 4:
    raise SystemExit("Usage: import-public-bibles.py KJV.zip ASV.json YLT.json")

root = Path(__file__).resolve().parent.parent
books = re.findall(r'\["([^"]+)",(\d+)\]', (root / 'src/bible.ts').read_text())
codes = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL 1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV'.split()
assert len(books) == len(codes) == 66

for translation, filename in zip(['kjv', 'asv', 'ylt'], sys.argv[1:]):
    source = Path(filename).read_bytes()
    if translation == 'kjv':
        with zipfile.ZipFile(filename) as archive:
            text = archive.read('eng-kjv_vpl.txt').decode('utf-8-sig')
            notice = archive.read('eng-kjv_about.htm').decode('utf-8')
        mapping = {code: number for number, code in enumerate(codes, 1)}
        selected = {number: [] for number in range(1, 67)}
        for line in text.splitlines():
            match = re.fullmatch(r'(\S+) (\d+):(\d+) (.*)', line)
            if not match:
                raise ValueError(f'Unexpected source line: {line[:80]}')
            code, chapter, verse, words = match.groups()
            if code in mapping:
                selected[mapping[code]].append({'chapter': int(chapter), 'verse': int(verse), 'text': words})
        source_url = 'https://ebible.org/Scriptures/eng-kjv_vpl.zip'
        edition = 'King James Version — standardized 1769 text'
        license_text = 'KJV text is public domain outside the UK. The publisher notes UK letters-patent restrictions on printing and importing printed copies. See the original publisher notice included with this bundle and https://ebible.org/eng-kjv/copr.htm.\n'
    else:
        data = json.loads(source)
        assert data['abbreviation'] == translation
        assert data['distribution_license'] == 'Public Domain'
        selected = {int(book['nr']): [{'chapter': int(verse['chapter']), 'verse': int(verse['verse']), 'text': verse['text']} for chapter in book['chapters'] for verse in chapter['verses']] for book in data['books'] if int(book['nr']) <= 66}
        source_url = f'https://api.getbible.net/v2/{translation}.json'
        edition = data['description']
        notice = None
        license_text = f'{edition}\n\nSource distribution license: {data["distribution_license"]}\n\n'+data.get('distribution_about', '').replace('\\par', '\n')+f'\n\nSource: {source_url}\n'
    output = root / 'public/bible' / translation
    output.mkdir(parents=True, exist_ok=True)
    manifest_books = []
    for number, (name, count) in enumerate(books, 1):
        values = selected[number]
        assert {value['chapter'] for value in values} == set(range(1, int(count)+1)), name
        assert len({(value['chapter'], value['verse']) for value in values}) == len(values), name
        assert values == sorted(values, key=lambda value: (value['chapter'], value['verse'])), name
        assert all(value['verse'] > 0 for value in values), name
        payload = ('[\n'+',\n'.join(json.dumps(value, ensure_ascii=False, separators=(',', ':')) for value in values)+'\n]\n').encode('utf-8')
        (output / f'{number}.json').write_bytes(payload)
        manifest_books.append({'number': number, 'name': name, 'chapters': int(count), 'verses': len(values), 'sha256': hashlib.sha256(payload).hexdigest()})
    manifest = {'translation': translation.upper(), 'edition': edition, 'license': 'Public domain (see LICENSE.txt for distribution notice)', 'source': source_url, 'sourceSha256': hashlib.sha256(source).hexdigest(), 'scope': '66 books of the Old and New Testaments', 'verseCount': sum(book['verses'] for book in manifest_books), 'emptyVerseCount': sum(not verse['text'].strip() for values in selected.values() for verse in values), 'books': manifest_books}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    (output / 'LICENSE.txt').write_text(license_text)
    if notice: (output / 'publisher-notice.html').write_text(notice)
    print(f'Imported {translation.upper()}: 66 books, {manifest["verseCount"]} numbered verses.')

manifests = [json.loads((root / 'public/bible' / code / 'manifest.json').read_text()) for code in ['web', 'kjv', 'asv', 'ylt']]
(root / 'public/bible/manifest.json').write_text(json.dumps({'translations': [{key: item[key] for key in ['translation', 'edition', 'source', 'sourceSha256', 'verseCount']} for item in manifests]}, indent=2)+'\n')
