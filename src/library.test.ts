import { describe, expect, it } from 'vitest'
import { annotations, books, emptyData, filterBooks, getProgress, isAllowedUrl, parseBackup, searchLinks } from './library'

describe('Excel import fidelity', () => {
  it('keeps all 118 unique source numbers, including numeric text cells', () => {
    expect(books.map(b => b.id)).toEqual(Array.from({ length: 118 }, (_, i) => i + 1))
    expect(books.find(b => b.id === 9)?.title).toBe('1984')
    expect([1, 2, 3, 4].map(level => books.filter(b => b.level === level).length)).toEqual([32, 42, 29, 15])
  })
  it('preserves original reading and ownership marks, null pages, and descriptions', () => {
    expect(books.filter(b => b.status === 'read').map(b => b.id)).toEqual([1, 3, 11, 12, 13])
    expect(books.filter(b => b.status === 'reading').map(b => b.id)).toEqual([16])
    expect(books.find(b => b.id === 5)?.owned).toBe(true)
    expect(books.filter(b => b.pages === null)).toHaveLength(15)
    expect(books.every(b => typeof annotations[b.id] === 'string' && annotations[b.id].length > 70)).toBe(true)
  })
})

describe('Personal library', () => {
  it('combines filters without changing source data or losing author search', () => {
    const data = emptyData()
    data.books['9'] = { status: 'read', owned: true, note: 'Перечитать' }
    expect(filterBooks(data, { query: 'ОРУЭЛЛ', level: 1, genre: '', status: 'read', owned: true }).map(b => b.id)).toEqual([9])
    expect(books.find(b => b.id === 9)?.status).toBe('planned')
    expect(getProgress(books[0], data).status).toBe('read')
  })
  it('round-trips backup progress, notes and edition links', () => {
    const data = emptyData()
    data.books['16'] = { status: 'read', owned: false, note: 'Моя мысль\nВторая строка' }
    data.editions['16'] = { yandexUrl: 'https://books.yandex.ru/books/example', coverUrl: 'https://covers.openlibrary.org/b/isbn/9780449213940-L.jpg' }
    expect(parseBackup(JSON.parse(JSON.stringify(data)))).toEqual(data)
  })
  it('rejects malformed, unknown and malicious backup fields', () => {
    for (const payload of [null, [], { version: 2, books: {} }, { version: 1, books: [] }, { version: 1, books: { 119: { status: 'read', owned: false, note: '' } } }, { version: 1, books: { 1: { status: '__proto__', owned: false, note: '' } } }, { version: 1, books: {}, editions: { 1: { coverUrl: 'javascript:alert(1)' } } }, { version: 1, books: {}, editions: { 1: { chitaiUrl: 'https://chitai-gorod.ru.evil.example/book' } } }]) expect(() => parseBackup(payload)).toThrow()
  })
  it('accepts HTTPS only and verifies shop domain boundaries', () => {
    expect(isAllowedUrl('https://www.chitai-gorod.ru/product/book', ['chitai-gorod.ru'])).toBe(true)
    expect(isAllowedUrl('https://books.yandex.ru.evil.example/', ['books.yandex.ru'])).toBe(false)
    expect(isAllowedUrl('https://user:password@books.yandex.ru/', ['books.yandex.ru'])).toBe(false)
    expect(isAllowedUrl('http://example.com/image.jpg')).toBe(false)
  })
  it('search links include the exact title and author', () => {
    const book = books.find(b => b.id === 118)!
    for (const [key, url] of Object.entries(searchLinks(book))) {
      const parsed = new URL(url)
      expect(key === 'yandexUrl' ? decodeURIComponent(parsed.pathname.replace('/search/all/', '')) : parsed.searchParams.get('phrase')).toBe(`${book.title} ${book.author}`)
    }
  })
})

describe('Published edition catalog', () => {
  it('keeps confirmed Yandex editions separate from personal data and search links', async () => {
    const { catalogEditions } = await import('./library')
    expect(Object.keys(catalogEditions).length).toBeGreaterThan(60)
    for (const [id, edition] of Object.entries(catalogEditions)) {
      expect(books.some(b => b.id === Number(id))).toBe(true)
      expect(new URL(edition.yandexUrl).hostname).toBe('books.yandex.ru')
      expect(new URL(edition.yandexUrl).pathname).toMatch(/^\/books\/[A-Za-z0-9]+$/)
      expect(edition.matchedAuthors.length).toBeGreaterThan(0)
      expect(edition.matchedTitle).not.toMatch(/краткое изложение|пересказ|саммари|краткая версия|конспект/i)
    }
    expect(catalogEditions['77']).toBeUndefined()
    expect(catalogEditions['87']).toBeUndefined()
    expect(catalogEditions['101']).toBeUndefined()
  })
})
