// Shows what an agent looked up before answering.
//
// Deep search produces two kinds of `search` message: one naming the queries, and
// one carrying the results. They are shown differently, because a list of three
// queries is not useful in the same shape as a list of links.
//
// The source of each result is shown for the same reason the model is told to
// cite: a claim that came from an encyclopedia and one that came from a live
// search are not equally fresh, and the reader deserves to know which they have.

interface SearchResult {
  title: string
  snippet: string
  url: string
  source?: string
}

interface SearchResultsProps {
  results?: SearchResult[]
  query: string
  source?: string
}

export function SearchResults({ results, query, source }: SearchResultsProps) {
  const queries = query ? query.split(' | ').filter(Boolean) : []

  // The query-only message: what this agent decided to look up.
  if (!results || results.length === 0) {
    return (
      <div className="ml-12 my-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="5.2" cy="5.2" r="3.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7.8 7.8L10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span>mencari:</span>
        {queries.map((q, i) => (
          <span key={i} className="px-1.5 py-0.5 bg-surface-inset rounded text-ink-light">
            {q}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="ml-12 my-2 rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-1.5 bg-surface-raised border-b border-border flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          Hasil riset
        </span>
        {source && <span className="text-[10px] text-sage">{source}</span>}
        {queries.length > 0 && (
          <span className="text-[10px] text-ink-muted truncate">untuk &quot;{queries.join(', ')}&quot;</span>
        )}
      </div>
      <ul className="divide-y divide-border">
        {results.map((result, i) => (
          <li key={i}>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-mono text-ink-muted shrink-0">[{i + 1}]</span>
                <span className="text-xs font-medium text-ink truncate">{result.title}</span>
                {result.source && (
                  <span className="text-[10px] text-ink-muted shrink-0">({result.source})</span>
                )}
              </div>
              <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-2 pl-6">{result.snippet}</p>
              <p className="text-[10px] text-ink-faint mt-0.5 truncate pl-6">{result.url}</p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

