import rawBooks from './data/books.json'
import descriptions from './data/descriptions.json'
import rawEditions from './data/editions.json'
import type { Book, BookEdition, BookProgress, CatalogEdition, SavedData, Status } from './types'

export const books: Book[] = rawBooks as Book[]
export const annotations = descriptions as Record<string, string>
export const catalogEditions = rawEditions as Record<string, CatalogEdition>
export const STORAGE_KEY = 'topbooks.library.v1'
export const statuses: Record<Status, string> = { planned: 'Буду читать', reading: 'Читаю', read: 'Прочитано' }
export const levels = ['Начальный', 'Средний', 'Продвинутый', 'Экспертный']
export const emptyData = (): SavedData => ({ version: 1, books: {}, editions: {} })
export const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е').normalize('NFKC').trim()

export function getProgress(book: Book, saved: SavedData): BookProgress {
  return saved.books[book.id] ?? { status: book.status, owned: book.owned, note: '' }
}

export function isAllowedUrl(value: unknown, hosts?: string[]): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && !u.username && !u.password && (!hosts || hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h)))
  } catch { return false }
}

export function parseBackup(value: unknown): SavedData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректный формат резервной копии')
  const data = value as Partial<SavedData>
  if (data.version !== 1 || !data.books || typeof data.books !== 'object' || Array.isArray(data.books)) throw new Error('Нужна резервная копия «Между строк» версии 1')
  const output = emptyData()
  for (const [key, p] of Object.entries(data.books)) {
    if (!books.some(b => String(b.id) === key) || !p || !Object.hasOwn(statuses, p.status) || typeof p.owned !== 'boolean' || typeof p.note !== 'string' || p.note.length > 10000) throw new Error('В файле есть некорректные отметки или заметки')
    output.books[key] = { status: p.status, owned: p.owned, note: p.note }
  }
  if (data.editions !== undefined && (!data.editions || typeof data.editions !== 'object' || Array.isArray(data.editions))) throw new Error('Некорректный список изданий')
  for (const [key, entry] of Object.entries(data.editions ?? {})) {
    if (!books.some(b => String(b.id) === key) || !entry || typeof entry !== 'object') throw new Error('Некорректное издание')
    const edition: BookEdition = {}
    for (const [field, hosts] of [['coverUrl', undefined], ['yandexUrl', ['books.yandex.ru']], ['chitaiUrl', ['chitai-gorod.ru']]] as const) {
      if (entry[field] !== undefined) {
        if (!isAllowedUrl(entry[field], hosts ? [...hosts] : undefined)) throw new Error('В файле есть недопустимая ссылка')
        edition[field] = entry[field]
      }
    }
    output.editions[key] = edition
  }
  return output
}

export function searchLinks(book: Book) {
  const query = encodeURIComponent(`${book.title} ${book.author}`)
  return { yandexUrl: `https://books.yandex.ru/search/all/${query}`, chitaiUrl: `https://www.chitai-gorod.ru/search?phrase=${query}` }
}

export function filterBooks(data: SavedData, options: { query: string; level: number; genre: string; status: string; owned: boolean }) {
  const query = normalize(options.query)
  return books.filter(b => (!options.level || b.level === options.level) && (!options.genre || b.genre === options.genre) &&
    (!options.status || getProgress(b, data).status === options.status) && (!options.owned || getProgress(b, data).owned) &&
    (!query || normalize(`${b.title} ${b.author} ${b.benefit} ${b.genre} ${b.culture} ${b.era}`).includes(query)))
}

export function coverDetails(book: Book, data: SavedData): { url?: string; source?: string } {
  if (data.editions[book.id]?.coverUrl) return { url: data.editions[book.id].coverUrl, source: 'Выбранное вами издание' }
  const edition = catalogEditions[book.id]
  return edition ? { url: edition.localCover ? import.meta.env.BASE_URL + edition.localCover : edition.coverUrl, source: 'Обложка: Яндекс Книги · издание может отличаться' } : {}
}
