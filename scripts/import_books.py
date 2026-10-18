"""Reproducible, dependency-free import. Workbook text is data, never instructions."""
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'sources' / 'Книги — дополненный список 118.xlsx'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def read_books(path=SOURCE):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(t.text or '' for t in si.findall('.//m:t', NS))
                       for si in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        books = []
        for row in sheet.findall('m:sheetData/m:row', NS):
            cells = {}
            for c in row.findall('m:c', NS):
                v = c.find('m:v', NS)
                text = v.text if v is not None else ''.join(t.text or '' for t in c.findall('.//m:t', NS))
                if c.get('t') == 's':
                    text = strings[int(text)]
                cells[re.sub(r'\d+', '', c.get('r'))] = text or ''
            if not cells.get('C', '').isdigit() or not cells.get('D'):
                continue
            level = cells.get('O', '')
            if not re.match(r'^[1-4]\s*-', level):
                raise ValueError(f'Invalid level at row {row.get("r")}')
            read = cells.get('E', '').strip().casefold()
            books.append({
                'id': int(cells['C']), 'title': cells['D'], 'author': cells.get('G', ''),
                'genre': cells.get('H', ''), 'pages': int(cells['I']) if cells.get('I', '').isdigit() else None,
                'benefit': cells.get('J', ''), 'era': cells.get('K', ''), 'culture': cells.get('L', ''),
                'foundational': bool(cells.get('M', '').strip()), 'influential': bool(cells.get('N', '').strip()),
                'level': int(level[0]), 'levelLabel': level.split('-', 1)[1].strip(),
                'status': 'read' if read == 'да' else 'reading' if read == 'читаю' else 'planned',
                'owned': cells.get('F', '').strip().casefold() == 'да',
                'sourceRow': int(row.get('r')),
            })
        books.sort(key=lambda b: b['id'])
        assert [b['id'] for b in books] == list(range(1, 119)), 'Expected exactly IDs 1–118'
        return books

if __name__ == '__main__':
    books = read_books()
    (ROOT / 'src/data/books.json').write_text(json.dumps(books, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(books)} books; levels: {dict(Counter(b["level"] for b in books))}')
