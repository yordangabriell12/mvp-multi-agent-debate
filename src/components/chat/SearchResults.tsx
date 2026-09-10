'use client'

interface SearchResult {
  title: string
  snippet: string
  url: string
}

interface SearchResultsProps {
  results: SearchResult[]
  query: string
  source?: string
}

export function SearchResults({ results, query, source }: SearchResultsProps) {
  if (!results.length) return null

  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden my-3">
      <div className="px-3 py-1.5 bg-[#f8f9fa] border-b border-[var(--color-border)] flex items-center gap-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase">🔍 Search Results</span>
        <span className="text-[10px] text-gray-400">for &quot;{query}&quot;</span>
        {source && <span className="text-[10px] text-gray-400">via {source}</span>}
      </div>
      <div className="divide-y divide-gray-100">
        {results.map((r, i) => (
          <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
            className="block px-3 py-2 hover:bg-gray-50 transition-colors">
            <div className="text-xs font-semibold text-blue-600 hover:underline truncate">{r.title}</div>
            <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{r.snippet}</div>
            <div className="text-[10px] text-gray-400 mt-0.5 truncate">{r.url}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
