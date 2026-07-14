import { stripTags } from "@/lib/fivetools/tags";

export interface FiveEntryObject {
  type: string;
  name?: string;
  entry?: string;
  entries?: FiveEntry[];
  items?: FiveEntry[];
  by?: string;
}

export type FiveEntry = string | FiveEntryObject;

function listItemText(item: FiveEntry): string {
  if (typeof item === "string") return stripTags(item);
  if (item.name) {
    const body = item.entry ? stripTags(item.entry) : entriesToText(item.entries);
    return `${stripTags(item.name)}. ${body}`.trim();
  }
  return entriesToText(item.entries);
}

function entriesToText(entries: FiveEntry[] | undefined): string {
  if (!entries) return "";
  return entries
    .map((entry) => (typeof entry === "string" ? stripTags(entry) : listItemText(entry)))
    .join(" ");
}

function EntryBlock({ entry }: { entry: FiveEntry }) {
  if (typeof entry === "string") {
    return <p className="text-sm text-foreground leading-relaxed">{stripTags(entry)}</p>;
  }

  switch (entry.type) {
    case "list":
      return (
        <ul className="list-disc list-inside text-sm text-foreground space-y-1">
          {(entry.items ?? []).map((item, index) => (
            <li key={index}>{listItemText(item)}</li>
          ))}
        </ul>
      );
    case "entries":
    case "section":
      return (
        <div className="space-y-1">
          {entry.name && <p className="text-sm font-bold text-foreground">{stripTags(entry.name)}</p>}
          <RenderEntries entries={entry.entries} />
        </div>
      );
    case "item":
      return (
        <p className="text-sm text-foreground leading-relaxed">
          {entry.name && <span className="font-bold">{stripTags(entry.name)}. </span>}
          {entry.entry ? stripTags(entry.entry) : entriesToText(entry.entries)}
        </p>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-accent pl-3 italic text-sm text-muted">
          <RenderEntries entries={entry.entries} />
          {entry.by && <p className="not-italic text-xs mt-1">— {stripTags(entry.by)}</p>}
        </blockquote>
      );
    default:
      // tabelle, immagini e altri blocchi rari non sono renderizzati in questa versione
      return null;
  }
}

export function RenderEntries({ entries }: { entries: FiveEntry[] | undefined }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <EntryBlock key={index} entry={entry} />
      ))}
    </div>
  );
}
