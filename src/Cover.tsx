import { useEffect, useState } from 'react'
import covers from './data/covers.json'
import verified from './data/openlibrary.json'
import type { Book } from './types'

const seeds = covers as Record<string, string>
const cache = new Map<number, string | null>()
const pending = new Map<number, Promise<string | null>>()
const knownCovers = verified as Record<string, { coverUrl?: string | null; localCover?: string }>
const colors = ['#b35440', '#345e60', '#8a7656', '#586d51', '#465a7d', '#8e6255']

// Search only on demand. Never substitute another book if the metadata is uncertain.
async function findCover(book: Book): Promise<string | null> {
  if (cache.has(book.id)) return cache.get(book.id)!
  if (pending.has(book.id)) return pending.get(book.id)!
  const request = (async () => {
    try {
      if ([77, 87, 101].includes(book.id)) return null
      const query = new URLSearchParams({ title: book.title, author: book.author, limit: '3', fields: 'title,cover_i,author_name' })
      const response = await fetch(`https://openlibrary.org/search.json?${query}`, { signal: AbortSignal.timeout(7000), credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) return null
      const body = await response.json()
      const match = body.docs?.find((d: { title?: string; cover_i?: number }) => d.cover_i && d.title?.toLocaleLowerCase().replaceAll('ё', 'е') === book.title.toLocaleLowerCase().replaceAll('ё', 'е'))
      return match ? `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg?default=false` : null
    } catch { return null }
  })()
  pending.set(book.id, request)
  const result = await request
  cache.set(book.id, result)
  pending.delete(book.id)
  return result
}

export default function Cover({ book, url, source, compact = false }: { book: Book; url?: string; source?: string; compact?: boolean }) {
  const known = knownCovers[book.id]
  const fallback = known?.localCover ? import.meta.env.BASE_URL + known.localCover : known?.coverUrl && !known.coverUrl.includes('/-1-L.jpg') ? known.coverUrl : seeds[book.id] ? `https://covers.openlibrary.org/b/isbn/${seeds[book.id]}-L.jpg?default=false` : null
  const initial = url || fallback
  const [image, setImage] = useState<string | null>(initial)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let active = true
    setImage(initial)
    setFailed(false)
    setLoaded(false)
    if (!initial) void findCover(book).then(found => { if (active) setImage(found) })
    return () => { active = false }
  }, [book.id, initial, book])
  function failImage() {
    setLoaded(false)
    if (fallback && image !== fallback) { setImage(fallback); return }
    setFailed(true)
    if (!fallback) void findCover(book).then(found => { if (found && found !== image) { setImage(found); setFailed(false) } })
  }
  useEffect(() => {
    if (!image || loaded || failed) return
    const timer = setTimeout(() => { if (fallback && image !== fallback) setImage(fallback); else setFailed(true) }, 8000)
    return () => clearTimeout(timer)
  }, [image, loaded, failed, fallback])
  return <div className={`book-cover ${compact ? 'compact-cover' : ''}`} style={{ '--cover-color': colors[(book.id - 1) % colors.length] } as React.CSSProperties}>
    <div className="cover-art" aria-label={`Типографическая обложка: ${book.title}`}><span className="cover-author">{book.author}</span><span className="cover-line" /><strong>{book.title}</strong><span className="cover-ornament">✳</span><span className="cover-bottom">ЛИЧНАЯ БИБЛИОТЕКА</span></div>
    {image && !failed && <img key={image} src={image} alt={`Обложка «${book.title}»`} loading="lazy" referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={failImage} />}
    {!compact && <span className="cover-caption">{image && !failed ? !loaded ? 'Загрузка обложки…' : image === url ? source || 'Выбранное вами издание' : 'Обложка: Open Library · издание может отличаться' : 'Типографическая обложка · изображение недоступно'}</span>}
  </div>
}
