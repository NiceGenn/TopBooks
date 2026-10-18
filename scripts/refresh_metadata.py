"""Resolve public Yandex Books metadata, matching both title and author.

Optional maintenance, never part of npm ci/build. No login, cookies, private APIs,
CAPTCHA bypass or TLS exceptions. Source pages remain outside the repository.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import re
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path('/tmp/topbooks-metadata-pages')
DATA = ROOT / 'src/data/editions.json'
ALIASES = {
    6: ['Семь навыков высокоэффективных людей'],
    12: ['Сказать жизни Да'],
    21: ['Превращение'],
    40: ['Наедине с собой', 'Размышления'],
    43: ['Нравственные письма к Луцилию'],
    44: ['Путь дзэн'],
    53: ['Вымыслы'],
    75: ['Воспоминания сновидения размышления'],
}
UNCERTAIN = {77, 87, 101}
rate_lock = threading.Lock()
next_request = 0.0


def norm(value):
    value = unicodedata.normalize('NFKC', value).casefold().replace('ё', 'е')
    return re.sub(r'[^\w]+', ' ', value).strip()


def fetch(url):
    global next_request
    with rate_lock:
        pause = max(0, next_request - time.monotonic())
        if pause:
            time.sleep(pause)
        next_request = time.monotonic() + 1.0
    request = urllib.request.Request(url, headers={'User-Agent': 'TopBooks-PersonalLibrary/1.0 (public book metadata)'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read(), response.headers.get('Content-Type', '')


def candidates(html):
    decoder = json.JSONDecoder()
    seen = set()
    for match in re.finditer(r'"search":', html):
        try:
            search, _ = decoder.raw_decode(html, match.end())
            for item in search.get('page', []):
                # Never link audio-only results to a /books/ route.
                if item.get('__typename') != 'TextBook':
                    continue
                book = item.get('book', {})
                uuid = book.get('initUuid')
                if uuid and uuid not in seen:
                    seen.add(uuid)
                    yield book
        except (ValueError, TypeError, AttributeError):
            continue


def match_title(original, candidate):
    a, b = norm(original), norm(candidate)
    subtitle = candidate.casefold().replace('ё', 'е').startswith(original.casefold().replace('ё', 'е')) and candidate[len(original):len(original)+1] in '.:!—–'
    return a == b or subtitle or (len(a) >= 12 and (b.startswith(a + ' ') or b.endswith(' ' + a)))


def author_matches(original, candidates):
    # Surname boundary matching retains abbreviations from the Excel source.
    surnames = [norm(part).split()[-1] for part in original.split(',') if norm(part)]
    if 'остин' in surnames:
        surnames.append('остен')
    return any(surname in norm(person.get('name', '')).split() for surname in surnames for person in candidates)


def resolve(book):
    if book['id'] in UNCERTAIN:
        return str(book['id']), None, 'needs clarification'
    queries = [book['title']] + ALIASES.get(book['id'], [])
    for query in queries:
        url = 'https://books.yandex.ru/search/all/' + urllib.parse.quote(query, safe='')
        cached = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.html')
        try:
            if cached.exists():
                html = cached.read_text()
            else:
                raw, kind = fetch(url)
                if 'text/html' not in kind:
                    return str(book['id']), None, 'unexpected response'
                html = raw.decode('utf-8')
                cached.write_text(html)
            for result in candidates(html):
                if re.search(r'краткое изложение|пересказ|саммари|краткая версия|конспект|за \d+ минут', result.get('name', ''), re.I):
                    continue
                if not author_matches(book['author'], result.get('authors', [])):
                    continue
                if not any(match_title(name, result.get('name', '')) for name in queries):
                    continue
                cover = result.get('cover', {}).get('url')
                if not cover or not cover.startswith('https://'):
                    continue
                edition = {
                    'yandexUrl': 'https://books.yandex.ru/books/' + result['initUuid'],
                    'coverUrl': cover,
                    'matchedTitle': result['name'],
                    'matchedAuthors': [p['name'] for p in result.get('authors', [])],
                    'source': 'Яндекс Книги',
                    'sourceUrl': url,
                    'checkedAt': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
                }
                return str(book['id']), edition, 'matched'
        except Exception as error:
            return str(book['id']), None, type(error).__name__ + ': ' + str(error)
    return str(book['id']), None, 'no exact title/author match'


def download_cover(key, edition):
    try:
        target = ROOT / 'public/covers' / f'book-{int(key):03}.jpg'
        if not target.exists():
            raw, kind = fetch(edition['coverUrl'])
            if not kind.startswith('image/') or len(raw) < 2000:
                return False
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        edition['localCover'] = f'covers/book-{int(key):03}.jpg'
        return True
    except Exception as error:
        print(f'Cover {key}: {type(error).__name__}: {error}', flush=True)
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true', help='Also cache publicly served cover images')
    parser.add_argument('--only', type=int, nargs='*', help='Resolve selected book IDs')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    books = json.loads((ROOT / 'src/data/books.json').read_text())
    editions = json.loads(DATA.read_text()) if DATA.exists() else {}
    selected = [b for b in books if not args.only or b['id'] in args.only]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for key, edition, status in executor.map(resolve, selected):
            if edition:
                # Preserve a verified cached image when refreshing its same source.
                if editions.get(key, {}).get('coverUrl') == edition['coverUrl'] and editions[key].get('localCover'):
                    edition['localCover'] = editions[key]['localCover']
                editions[key] = edition
            elif status in ('no exact title/author match', 'needs clarification'):
                editions.pop(key, None)
            print(key, status, flush=True)
            DATA.write_text(json.dumps(editions, ensure_ascii=False, indent=2) + '\n')
    if args.download:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            list(executor.map(lambda item: download_cover(*item), list(editions.items())))
        DATA.write_text(json.dumps(editions, ensure_ascii=False, indent=2) + '\n')
    print(f'Matched: {len(editions)}/{len(books)}; cached images: {sum(bool(v.get("localCover")) for v in editions.values())}', flush=True)
