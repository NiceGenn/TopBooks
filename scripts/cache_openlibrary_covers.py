"""Optional: cache verified public book covers; use normal HTTPS with verification."""
import argparse
import concurrent.futures
import json
import re
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'src/data/openlibrary.json'
LOCK = threading.Lock()
NEXT = 0.0


def fetch(url):
    global NEXT
    with LOCK:
        pause = max(0, NEXT - time.monotonic())
        if pause:
            time.sleep(pause)
        NEXT = time.monotonic() + 1.0
    request = urllib.request.Request(url, headers={'User-Agent': 'TopBooks-PersonalLibrary/1.0 (public book covers)'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read(), response.headers.get('Content-Type', '')


def norm(text):
    return re.sub(r'\W+', ' ', ''.join(c for c in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(c))).removeprefix('the ').strip()


def cache(item):
    key, entry = item
    target = ROOT / 'public/covers' / f'openlibrary-{int(key):03}.jpg'
    if target.exists():
        entry['localCover'] = f'covers/{target.name}'
        return key, entry
    try:
        url = entry.get('coverUrl')
        if not url or '/-1-L.jpg' in url:
            search = 'https://openlibrary.org/search.json?' + urllib.parse.urlencode({'title': entry['title'], 'author': entry.get('lookupAuthor') or (entry['authors'][0] if entry['authors'] else ''), 'limit': '10', 'fields': 'key,title,author_name,cover_i'})
            raw, _ = fetch(search)
            for candidate in json.loads(raw).get('docs', []):
                if candidate.get('cover_i') and (norm(candidate.get('title', '')) == norm(entry['title']) or norm(candidate.get('title', '')).startswith(norm(entry['title']) + ' ')):
                    url = f'https://covers.openlibrary.org/b/id/{candidate["cover_i"]}-L.jpg?default=false'
                    entry['coverUrl'] = url
                    entry['coverSearchSource'] = search
                    break
        url = url or f'https://covers.openlibrary.org/b/isbn/{entry["isbn"]}-L.jpg?default=false'
        raw, kind = fetch(url)
        if not kind.startswith('image/') or len(raw) < 2000:
            raise ValueError('Not a usable cover image')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        entry['localCover'] = f'covers/{target.name}'
        print(key, 'cached', len(raw), flush=True)
    except Exception as error:
        print(key, type(error).__name__, str(error), flush=True)
    return key, entry


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', type=int, nargs='*')
    args = parser.parse_args()
    data = json.loads(DATA.read_text())
    selected = [(k, v) for k, v in data.items() if not args.only or int(k) in args.only]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for key, entry in executor.map(cache, selected):
            data[key] = entry
            DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('Cached', sum(bool(v.get('localCover')) for v in data.values()), 'of', len(data), flush=True)
