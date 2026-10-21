import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BookOpen, Search, ArrowUpRight, ChevronRight, ChevronDown, Download, Upload, List, LayoutGrid, Check, X, SlidersHorizontal, Library, NotebookPen, Info, ArrowRight, CheckCheck, Bookmark, Feather, ExternalLink } from 'lucide-react'
import sourceUrl from '../sources/Книги — дополненный список 118.xlsx?url'
import Cover from './Cover'
import { annotations, applyUserUpdates, userUpdates, books, catalogEditions, coverDetails, emptyData, filterBooks, getProgress, isAllowedUrl, levels, normalize, parseBackup, searchLinks, statuses, STORAGE_KEY } from './library'
import type { Book, BookEdition, BookProgress, SavedData, Status } from './types'

const SOURCE_NAME = 'Книги — дополненный список 118.xlsx'
const totalPages = books.reduce((sum, b) => sum + (b.pages ?? 0), 0)
const number = (n: number) => new Intl.NumberFormat('ru-RU').format(n)

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    return () => { previous?.focus() }
  }, [])
  return <dialog ref={ref} className={`dialog ${wide ? 'wide-dialog' : ''}`} aria-label={title} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="dialog-surface"><button className="icon-button dialog-close" aria-label="Закрыть окно" onClick={onClose}><X size={21} /></button>{children}</div>
  </dialog>
}

function EditionForm({ edition, onSave }: { edition: BookEdition; onSave: (edition: BookEdition) => void }) {
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const entry: BookEdition = {}
    for (const [key, hosts] of [['coverUrl', undefined], ['yandexUrl', ['books.yandex.ru']], ['chitaiUrl', ['chitai-gorod.ru']]] as const) {
      const value = String(fields.get(key) ?? '').trim()
      if (!value) continue
      if (!isAllowedUrl(value, hosts ? [...hosts] : undefined)) { setError('Нужна HTTPS-ссылка: для магазинов — с соответствующего сайта.'); return }
      entry[key] = value
    }
    onSave(entry)
    setError('')
  }
  return <details className="edition-editor"><summary>Выбрать своё издание <ChevronDown size={14} /></summary><p>Вставьте прямые ссылки на нужную книгу. Пустые поля используют поиск; обложка может быть с любого HTTPS-сайта.</p><form onSubmit={submit}>
    <label>Ссылка на изображение обложки<input type="url" name="coverUrl" defaultValue={edition.coverUrl} placeholder="https://…/cover.jpg" /></label>
    <label>Книга в Яндекс Книгах<input type="url" name="yandexUrl" defaultValue={edition.yandexUrl} placeholder="https://books.yandex.ru/books/…" /></label>
    <label>Книга в Читай-городе<input type="url" name="chitaiUrl" defaultValue={edition.chitaiUrl} placeholder="https://www.chitai-gorod.ru/product/…" /></label>
    {error && <p role="alert" className="form-error">{error}</p>}<button className="button secondary" type="submit">Сохранить издание</button>
  </form></details>
}

function BookDetails({ book, data, onChange, onEdition, onClose }: { book: Book; data: SavedData; onChange: (id: number, patch: Partial<BookProgress>) => void; onEdition: (id: number, edition: BookEdition) => void; onClose: () => void }) {
  const progress = getProgress(book, data)
  const edition = data.editions[book.id] ?? {}
  const links = { ...searchLinks(book), ...(catalogEditions[book.id] ? { yandexUrl: catalogEditions[book.id].yandexUrl } : {}), ...edition }
  const printEdition = userUpdates.find(update => update.bookIds.includes(book.id) && update.chitaiUrl === links.chitaiUrl)
  return <Modal title={book.title} onClose={onClose} wide><div className="book-detail">
    <div className="detail-cover-column"><Cover book={book} {...coverDetails(book, data)} /><div className="source-note"><BookOpen size={15} /><span>Книга №{String(book.id).padStart(3, '0')}<br />из вашего списка</span></div></div>
    <div className="detail-content"><span className={`eyebrow level-color-${book.level}`}>Уровень {book.level} · {book.levelLabel}</span><h2>{book.title}</h2><p className="detail-author">{book.author}</p>
      <div className="detail-tags"><span>{book.genre}</span><span>{book.era}</span><span>{book.culture}</span>{book.pages && <span>{book.pages} стр.</span>}</div>
      <h3>О книге</h3><p className="annotation">{annotations[book.id]}</p>
      <div className="benefit"><Feather size={20} /><div><span>Что даст книга</span><p>{book.benefit}</p></div></div>
      <div className="detail-controls"><label>Мой прогресс<select aria-label="Статус чтения" value={progress.status} onChange={e => onChange(book.id, { status: e.target.value as Status })}>{Object.entries(statuses).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label><label className="owned-check"><input type="checkbox" checked={progress.owned} onChange={e => onChange(book.id, { owned: e.target.checked })} />Есть в бумажном</label></div>
      <div className="shop-links"><a href={links.yandexUrl} target="_blank" rel="noopener noreferrer" className="shop-link yandex"><span className="shop-logo" aria-hidden="true">Я</span><span>{edition.yandexUrl || catalogEditions[book.id] ? 'Яндекс Книги' : 'Найти в Яндекс Книгах'}</span><ArrowUpRight size={17} /></a><a href={links.chitaiUrl} target="_blank" rel="noopener noreferrer" className="shop-link chitai"><BookOpen size={19} /><span>{edition.chitaiUrl ? 'Читай-город' : 'Найти в Читай-городе'}</span><ArrowUpRight size={17} /></a></div>
      <p className="link-note">{printEdition && <>Ваше бумажное издание: «{printEdition.editionTitle}». Один том включает обе записи списка.<br /></>}Подтверждённые издания открываются напрямую; остальные ссылки ведут на поиск. Наличие и доступность книги могут меняться.</p>
      <label className="note-label"><span><NotebookPen size={16} /> Мои заметки <small>сохраняются автоматически</small></span><textarea value={progress.note} maxLength={10000} onChange={e => onChange(book.id, { note: e.target.value })} placeholder="Мысль, цитата или то, к чему хочется вернуться…" rows={4} /></label>
      <EditionForm key={book.id} edition={edition} onSave={value => onEdition(book.id, value)} />
      <div className="detail-flags">{book.foundational && <span><Check size={14} />Фундаментальная</span>}{book.influential && <span><Check size={14} />Повлияла на мир</span>}<small>Страницы и признаки — из Excel, зависят от издания.</small></div>
    </div>
  </div></Modal>
}

export default function App() {
  const [data, setData] = useState<SavedData>(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); return applyUserUpdates(saved ? parseBackup(JSON.parse(saved)) : emptyData()) } catch { return applyUserUpdates(emptyData()) }
  })
  const [storageError, setStorageError] = useState(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) parseBackup(JSON.parse(saved)); return '' } catch { return 'Не удалось прочитать сохранённые отметки. Исходный список доступен; повреждённые данные не перезаписаны.' }
  })
  const storageBlocked = useRef(Boolean(storageError))
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState(0)
  const [genre, setGenre] = useState('')
  const [status, setStatus] = useState('')
  const [owned, setOwned] = useState(false)
  const [notesOnly, setNotesOnly] = useState(false)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [sort, setSort] = useState('source')
  const [fullColumns, setFullColumns] = useState(false)
  const [selected, setSelected] = useState<Book | null>(null)
  const [about, setAbout] = useState(false)
  const [toast, setToast] = useState('')
  const [toastError, setToastError] = useState(false)
  const [preview, setPreview] = useState<{ book: Book; x: number; y: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const revision = useRef(1)

  useEffect(() => {
    if (revision.current === 0 || storageBlocked.current) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setStorageError('') }
    catch { setStorageError('Браузер не смог сохранить изменения. Выгрузите резервную копию, чтобы не потерять прогресс.') }
  }, [data])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4200); return () => clearTimeout(timer) }, [toast])
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])
  useEffect(() => {
    if (!preview) return
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null) }
    const scroll = () => setPreview(null)
    window.addEventListener('keydown', dismiss)
    window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('keydown', dismiss); window.removeEventListener('scroll', scroll, true) }
  }, [preview])

  function change(id: number, patch: Partial<BookProgress>) {
    revision.current++
    setData(current => ({ ...current, books: { ...current.books, [id]: { ...getProgress(books.find(b => b.id === id)!, current), ...patch } } }))
  }
  function changeEdition(id: number, edition: BookEdition) {
    revision.current++
    setData(current => ({ ...current, editions: { ...current.editions, [id]: edition } }))
    setToastError(false)
    setToast('Издание сохранено в этом браузере')
  }
  function showPreview(book: Book, element: HTMLElement) {
    if (window.innerWidth < 760) return
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    const rect = element.getBoundingClientRect()
    const x = Math.min(Math.max(16, rect.left + 60), window.innerWidth - 356)
    const y = Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 275))
    hoverTimer.current = setTimeout(() => setPreview({ book, x, y }), 300)
  }
  function hidePreview() { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setPreview(null), 120) }
  function openBook(book: Book) { if (hoverTimer.current) clearTimeout(hoverTimer.current); setPreview(null); setSelected(book) }
  function download(content: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement('a'); link.href = url; link.download = name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function exportBackup() {
    setToastError(false)
    const all = { ...data, books: Object.fromEntries(books.map(b => [b.id, getProgress(b, data)])), exportedAt: new Date().toISOString() }
    download(JSON.stringify(all, null, 2), `topbooks-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
    setToast('Резервная копия выгружена')
  }
  async function restore(file?: File) {
    if (!file) return
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('Файл слишком большой: максимум 3 МБ')
      const parsed = applyUserUpdates(parseBackup(JSON.parse(await file.text())))
      // An explicitly imported backup replaces local progress, including empty notes.
      setToastError(false)
      revision.current++; storageBlocked.current = false; setData(parsed); setStorageError(''); setToast('Отметки, заметки и издания восстановлены из копии')
    } catch (error) { setToastError(true); setToast(error instanceof Error ? error.message : 'Не удалось прочитать файл') }
    finally { if (fileInput.current) fileInput.current.value = '' }
  }
  function clearFilters() { setQuery(''); setGenre(''); setStatus(''); setOwned(false); setLevel(0); setNotesOnly(false) }

  const readCount = books.filter(b => getProgress(b, data).status === 'read').length
  const reading = books.filter(b => getProgress(b, data).status === 'reading')
  const ownedCount = books.filter(b => getProgress(b, data).owned).length
  const noteCount = books.filter(b => getProgress(b, data).note.trim()).length
  const progressPercent = Math.round(readCount / books.length * 100)
  let visible = filterBooks(data, { query, level, genre, status, owned }).filter(b => !notesOnly || getProgress(b, data).note.trim())
  visible = [...visible].sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'ru') : sort === 'author' ? a.author.localeCompare(b.author, 'ru') : sort === 'pages' ? (a.pages ?? Infinity) - (b.pages ?? Infinity) : a.id - b.id)
  const sections = sort === 'source' ? [1, 2, 3, 4].map(n => ({ level: n, items: visible.filter(b => b.level === n) })).filter(s => s.items.length) : [{ level: 0, items: visible }]
  const current = reading[0]
  const hasFilters = Boolean(query || level || genre || status || owned || notesOnly)

  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={e => { e.preventDefault(); clearFilters() }} aria-label="Между строк — главная"><span className="brand-mark"><BookOpen size={25} strokeWidth={1.6} /></span><span>между строк<span className="brand-caption">ЛИЧНАЯ БИБЛИОТЕКА</span></span></a>
      <div className="sidebar-label">МОЁ ПРОСТРАНСТВО</div><nav aria-label="Библиотека"><button className={`nav-item ${!notesOnly ? 'active' : ''}`} onClick={() => { setNotesOnly(false); setLevel(0) }}><Library size={18} />Мой список<span>{books.length}</span></button><button className={`nav-item ${notesOnly ? 'active' : ''}`} onClick={() => { clearFilters(); setNotesOnly(true) }}><NotebookPen size={18} />Мои заметки<span>{noteCount}</span></button></nav>
      <div className="sidebar-label levels-label">ПУТЬ ЧИТАТЕЛЯ</div><nav aria-label="Уровни сложности">{levels.map((name, i) => <button className={`level-nav ${level === i + 1 ? 'chosen' : ''}`} key={name} onClick={() => { setLevel(level === i + 1 ? 0 : i + 1); setNotesOnly(false) }}><span className={`level-dot dot-${i + 1}`} /><span>{name}</span><small>{books.filter(b => b.level === i + 1).length}</small></button>)}</nav>
      <div className="sidebar-quote"><span>“</span><p>Чтение — это разговор<br />с самим собой<br />на другом языке.</p><div className="quote-line" /></div>
      <div className="sidebar-bottom"><div className="mini-progress"><span>Ваш путь</span><strong>{progressPercent}%</strong></div><div className="progress-track"><span style={{ width: `${progressPercent}%` }} /></div><small>{readCount} из {books.length} книг прочитано</small><button className="about-button" onClick={() => setAbout(true)}><Info size={16} />О библиотеке<ArrowUpRight size={15} /></button><div className="profile"><span>Я</span><div>Моя библиотека<small>Своя история чтения</small></div><Feather size={18} /></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><span>Моё пространство</span><ChevronRight size={13} /><strong>{notesOnly ? 'Мои заметки' : 'Список чтения'}</strong></div><div className="topbar-right"><span className="local-status"><span />Сохранение в браузере</span><details className="export-menu"><summary className="button secondary"><Download size={16} /><span>Экспорт и исходник</span><ChevronDown size={14} /></summary><div className="export-dropdown"><button onClick={exportBackup}><Download size={16} /><span>Резервная копия JSON<small>Все отметки, заметки и издания</small></span></button><button onClick={() => fileInput.current?.click()}><Upload size={16} /><span>Восстановить копию<small>Заменит текущие личные данные</small></span></button><a href={sourceUrl} download={SOURCE_NAME}><BookOpen size={16} /><span>Исходный Excel<small>Оригинальный файл · 118 книг</small></span></a></div></details></div></header>
    <main><nav className="mobile-nav" aria-label="Разделы библиотеки"><button className={!notesOnly ? "mobile-active" : ""} onClick={clearFilters}><Library size={15} />Все книги</button><button className={notesOnly ? "mobile-active" : ""} onClick={() => { clearFilters(); setNotesOnly(true) }}><NotebookPen size={15} />Мои заметки<span>{noteCount}</span></button><button className="mobile-info" aria-label="О библиотеке" onClick={() => setAbout(true)}><Info size={17} /></button></nav><section className="page-intro"><div><div className="eyebrow"><span className="tiny-line" />КНИГИ, КОТОРЫЕ МЕНЯЮТ НАС</div><h1>{notesOnly ? 'Мысли на полях' : 'Мой список чтения'}<span className="heading-dot">.</span></h1><p>{notesOnly ? 'Слова остаются. Собирайте здесь то, к чему хочется вернуться.' : 'От первой страницы — к новым смыслам. В своём темпе.'}</p></div><div className="intro-decoration" aria-hidden="true"><span>ex libris</span><Feather size={40} strokeWidth={1} /></div></section>
      {storageError && <div className="storage-warning" role="alert">{storageError} <button onClick={exportBackup}>Выгрузить копию</button></div>}
      <section className="stats" aria-label="Статистика чтения"><div className="stat"><span className="stat-icon sand"><Library size={20} /></span><div><span>Всего в списке</span><strong>{books.length}<small>книг</small></strong></div></div><div className="stat"><span className="stat-icon green"><CheckCheck size={20} /></span><div><span>Уже прочитано</span><strong>{readCount}<small>из {books.length}</small></strong></div><div className="stat-spark" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div></div><div className="stat"><span className="stat-icon amber"><BookOpen size={20} /></span><div><span>Читаю сейчас</span><strong>{reading.length}<small>{reading.length === 1 ? 'книгу' : 'книг'}</small></strong></div></div><div className="stat"><span className="stat-icon blue"><Bookmark size={20} /></span><div><span>На моей полке</span><strong>{ownedCount}<small>в бумажном</small></strong></div></div></section>
      {!notesOnly && current && !hasFilters && <section className="currently-reading"><div className="current-book-art" aria-hidden="true"><span>{current.author}</span><strong>{current.title}</strong><span>МЕЖДУ СТРОК</span></div><div className="current-copy"><span className="eyebrow"><span className="pulsing-dot" />СЕЙЧАС МЕЖДУ СТРОК</span><h2><button className="current-title" aria-label={`Открыть текущую книгу: ${current.title}`} onClick={() => openBook(current)}>{current.title}</button></h2><p>{current.author}<span>·</span>{current.pages ? `${current.pages} страниц` : current.genre}</p></div><div className="current-right"><p>У каждой книги — своё время.<br /><span>Эта история сейчас с вами.</span></p><button onClick={() => openBook(current)} className="button dark">Открыть книгу<ArrowRight size={16} /></button></div></section>}
      <section className="library-section" aria-label="Список книг"><div className="section-title"><h2>{notesOnly ? 'Мои заметки' : level ? `${levels[level - 1]} уровень` : 'Ваша книжная полка'}<span>{visible.length}</span></h2><span className="section-hint">Небольшие шаги. Большие открытия.</span></div>
      <div className="filter-bar"><label className="search-box"><Search size={18} /><input aria-label="Поиск книг" value={query} onChange={e => setQuery(e.target.value)} placeholder="Название, автор или мысль…" />{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={15} /></button>}</label><select className="filter-select" aria-label="Фильтр по жанру" value={genre} onChange={e => setGenre(e.target.value)}><option value="">Все жанры</option>{[...new Set(books.map(b => b.genre))].map(g => <option key={g}>{g}</option>)}</select><select className="filter-select" aria-label="Фильтр по статусу" value={status} onChange={e => setStatus(e.target.value)}><option value="">Все статусы</option>{Object.entries(statuses).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select><button className={`filter-owned ${owned ? 'selected' : ''}`} aria-pressed={owned} onClick={() => setOwned(!owned)}><Bookmark size={15} /><span>На полке</span></button><div className="view-switch" aria-label="Вид списка"><button aria-label="Список" aria-pressed={view === 'list'} className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}><List size={18} /></button><button aria-label="Карточки" aria-pressed={view === 'grid'} className={view === 'grid' ? 'selected' : ''} onClick={() => setView('grid')}><LayoutGrid size={17} /></button></div></div>
      <div className="list-options"><span>{hasFilters ? `Найдено: ${visible.length} из ${books.length}` : 'Ваш порядок, уровни и отметки — как в исходном списке'}{hasFilters && <button onClick={clearFilters}>Сбросить фильтры <X size={12} /></button>}</span><div><label className="sort-label">Порядок:<select value={sort} aria-label="Сортировка" onChange={e => setSort(e.target.value)}><option value="source">как в списке</option><option value="title">по названию</option><option value="author">по автору</option><option value="pages">по объёму</option></select></label>{view === 'list' && <button className={fullColumns ? 'active-columns' : ''} aria-pressed={fullColumns} onClick={() => setFullColumns(!fullColumns)}><SlidersHorizontal size={14} />Все столбцы</button>}</div></div>
      {view === 'list' && visible.length > 0 && <p className="table-hint">Таблицу можно листать вбок <ArrowRight size={13} /></p>}
      {!visible.length ? <div className="empty-state"><BookOpen size={38} strokeWidth={1} /><h3>{notesOnly && !noteCount ? 'Здесь появятся ваши мысли' : 'Пока ни одной книги'}</h3><p>{notesOnly && !noteCount ? 'Откройте любую книгу и оставьте первую заметку.' : 'Попробуйте другой запрос или уберите часть фильтров.'}</p><button className="button secondary" onClick={clearFilters}>Вернуться ко всем книгам<ArrowRight size={15} /></button></div> : sections.map(section => <section className="book-section" key={section.level}>
        {section.level > 0 && <div className={`level-heading level-heading-${section.level}`}><span className={`level-number level-${section.level}`}>{String(section.level).padStart(2, '0')}</span><h3>Уровень {section.level}<span>·</span>{levels[section.level - 1]}</h3><small>{section.items.length} книг</small><span className="level-heading-line" /></div>}
        {view === 'list' ? <div className="table-scroll"><table className={fullColumns ? 'book-table full-table' : 'book-table'}><thead><tr><th className="number-cell">№</th><th className="title-cell">Название и автор</th><th>Жанр</th><th className="pages-cell">Стр.</th><th className="benefit-cell">Что даст книга</th><th className="status-cell">Прочитал</th><th className="owned-cell"><span title="Есть в бумажном">На полке</span></th>{fullColumns && <><th>Эпоха</th><th>Культура</th><th>Фунд.</th><th>Влияние</th><th>Уровень</th></>}<th aria-label="Открыть книгу" /></tr></thead><tbody>{section.items.map(book => {
          const p = getProgress(book, data)
          return <tr key={book.id} className={`book-row row-${p.status}`}><td className="number-cell">{String(book.id).padStart(2, '0')}</td><td className="title-cell"><button className="book-title" aria-label={book.title} onClick={() => openBook(book)} onMouseEnter={e => showPreview(book, e.currentTarget)} onMouseLeave={hidePreview} onFocus={e => showPreview(book, e.currentTarget)} onBlur={hidePreview}>{book.title}{p.note.trim() && <NotebookPen size={13} aria-label="Есть заметка" />}</button><span className="book-author">{book.author}</span>{notesOnly && <p className="row-note">{p.note}</p>}</td><td><span className={`genre-tag genre-${normalize(book.genre).slice(0, 4)}`}>{book.genre === 'Художественная' ? 'Худ. литература' : book.genre}</span></td><td className="pages-cell">{book.pages ?? '—'}</td><td className="benefit-cell"><p>{book.benefit}</p></td><td className="status-cell"><select className={`status-select status-${p.status}`} aria-label={`Статус: ${book.title}`} value={p.status} onChange={e => change(book.id, { status: e.target.value as Status })}>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td><td className="owned-cell"><input type="checkbox" aria-label={`Есть в бумажном: ${book.title}`} checked={p.owned} onChange={e => change(book.id, { owned: e.target.checked })} /></td>{fullColumns && <><td>{book.era}</td><td>{book.culture}</td><td>{book.foundational ? '✓' : '—'}</td><td>{book.influential ? '✓' : '—'}</td><td>{book.level} — {book.levelLabel}</td></>}<td><button className="row-open icon-button" aria-label={`Открыть: ${book.title}`} onClick={() => openBook(book)}><ArrowUpRight size={17} /></button></td></tr>
        })}</tbody></table></div> : <div className="book-grid">{section.items.map(book => { const p = getProgress(book, data); return <article className="grid-book" key={book.id}><button className="grid-cover-button" onClick={() => openBook(book)} aria-label={`Открыть: ${book.title}`}><Cover book={book} {...coverDetails(book, data)} compact /><span className="grid-cover-open"><ArrowUpRight size={20} /></span></button><div className="grid-book-meta"><span>№{String(book.id).padStart(2, '0')}</span><span>{book.pages ? `${book.pages} стр.` : 'Объём не указан'}</span></div><button className="grid-title" onClick={() => openBook(book)}>{book.title}</button><p className="book-author">{book.author}</p><select className={`status-select status-${p.status}`} value={p.status} aria-label={`Статус: ${book.title}`} onChange={e => change(book.id, { status: e.target.value as Status })}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{notesOnly && <p className="row-note">{p.note}</p>}</article> })}</div>}
      </section>)}
      </section><footer className="page-footer"><div><BookOpen size={16} /><span>Не гонка за количеством. Путешествие за смыслом.</span></div><a href={sourceUrl} download={SOURCE_NAME}>Из вашего Excel, с заботой<ArrowUpRight size={13} /></a></footer>
    </main></div>
    {preview && <div role="tooltip" className="hover-preview" style={{ left: preview.x, top: preview.y }} onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }} onMouseLeave={hidePreview}><Cover book={preview.book} {...coverDetails(preview.book, data)} compact /><div><span className="eyebrow">ЗАГЛЯНУТЬ ВНУТРЬ</span><h3>{preview.book.title}</h3><p>{preview.book.author}</p><small>{preview.book.benefit}</small><span className="preview-tip">Нажмите на название, чтобы открыть<ArrowRight size={13} /></span></div></div>}
    {selected && <BookDetails book={selected} data={data} onChange={change} onEdition={changeEdition} onClose={() => setSelected(null)} />}
    {about && <Modal title="О библиотеке" onClose={() => setAbout(false)}><div className="about-content"><span className="brand-mark"><BookOpen size={26} /></span><div className="eyebrow">МЕЖДУ СТРОК</div><h2>Ваша история чтения</h2><p>118 книг из вашего Excel: авторский порядок, четыре уровня и все исходные отметки. Дополнение №104–118 включено в свои уровни, нумерация сохранена.</p><h3>Данные принадлежат вам</h3><p>Новые отметки, заметки и выбранные издания хранятся только в этом браузере. Для другого устройства или домена выгрузите JSON и восстановите его там. Очистка данных браузера удаляет прогресс. Синхронизации и регистрации нет.</p><h3>Обложки и описания</h3><p>Краткие редакционные описания добавлены отдельно; «Что даст книга» взято из Excel. Подтверждённые обложки и прямые ссылки взяты из публичного каталога Яндекс Книг. Если совпадение не найдено, используется Open Library. Издание и язык могут отличаться. Если изображения нет, показывается типографическая обложка; своё издание можно выбрать в карточке.</p><p>Там, где издание подтверждено, ссылка ведёт прямо на него; остальные ссылки — на поиск. При загрузке внешней обложки её источник получает обычный запрос браузера; заметки и прогресс туда не передаются.</p><h3>Заметки к исходнику</h3><p>Названия №77 «Расстройство личности» и №87 «Благословение» требуют уточнения издания; №101 сокращено в оригинале. Пустые значения не заполнены догадками. Формулы со служебной ошибкой #REF! не используются.</p><p>Объём известных книг: {number(totalPages)} страниц. Для 15 добавленных книг число страниц в Excel не указано. Статистика рассчитывается по записям.</p><div className="about-actions"><button className="button dark" onClick={exportBackup}><Download size={16} />Выгрузить мой прогресс</button><a href={sourceUrl} download={SOURCE_NAME} className="button secondary">Исходный Excel<ExternalLink size={15} /></a></div></div></Modal>}
    <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Файл резервной копии" className="visually-hidden" onChange={e => void restore(e.target.files?.[0])} />
    {toast && <div className={`toast ${toastError ? "toast-error" : ""}`} role="status">{toastError ? <Info size={18} /> : <Check size={18} />}<span>{toast}</span><button aria-label="Закрыть уведомление" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>
}
