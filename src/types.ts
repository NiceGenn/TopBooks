export type Status = 'planned' | 'reading' | 'read'
export interface Book {
  id: number; title: string; author: string; genre: string; pages: number | null;
  benefit: string; era: string; culture: string; foundational: boolean; influential: boolean;
  level: number; levelLabel: string; status: Status; owned: boolean; sourceRow: number;
}
export interface BookProgress {
  status: Status; owned: boolean; note: string;
}
export interface BookEdition {
  coverUrl?: string; yandexUrl?: string; chitaiUrl?: string;
}
export interface SavedData {
  version: 1;
  books: Record<string, BookProgress>;
  editions: Record<string, BookEdition>;
}

export interface CatalogEdition {
  yandexUrl: string; coverUrl: string; localCover?: string; matchedTitle: string;
  matchedAuthors: string[]; source: string; sourceUrl: string; checkedAt: string;
}
