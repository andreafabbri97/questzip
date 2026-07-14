const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

export type Edition = "2014" | "2024";

export interface BookMeta {
  source: string;
  name: string;
  edition: Edition;
}

interface RawBook {
  id: string;
  name: string;
}

let booksPromise: Promise<Map<string, BookMeta>> | null = null;

function classifyEdition(name: string): Edition {
  return /\((2024|2025)\)/.test(name) ? "2024" : "2014";
}

export function loadBooks(): Promise<Map<string, BookMeta>> {
  if (!booksPromise) {
    booksPromise = fetch(`${RAW_BASE}/books.json`)
      .then((response) => response.json())
      .then((data: { book: RawBook[] }) => {
        const map = new Map<string, BookMeta>();
        for (const book of data.book) {
          map.set(book.id, {
            source: book.id,
            name: book.name,
            edition: classifyEdition(book.name),
          });
        }
        return map;
      });
  }
  return booksPromise;
}

export { RAW_BASE };
