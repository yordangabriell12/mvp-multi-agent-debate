export const runtime = 'nodejs'

interface SearchResult {
  title: string
  snippet: string
  url: string
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  // Step 1: Search Wikipedia
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`
  const searchRes = await fetch(searchUrl, {
    headers: { 'User-Agent': 'VMA-Search/1.0 (contact: vma-app)' }
  })
  if (!searchRes.ok) return []
  const searchData = await searchRes.json()
  const hits = searchData?.query?.search || []

  // Step 2: Get summaries for top results
  const results: SearchResult[] = []
  for (const hit of hits.slice(0, 3)) {
    try {
      const title = hit.title.replace(/ /g, '_')
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      const summaryRes = await fetch(summaryUrl, {
        headers: { 'User-Agent': 'VMA-Search/1.0 (contact: vma-app)' }
      })
      if (summaryRes.ok) {
        const summary = await summaryRes.json()
        results.push({
          title: summary.title || hit.title,
          snippet: summary.extract || hit.snippet?.replace(/<[^>]*>/g, '') || '',
          url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title}`
        })
      }
    } catch { /* skip failed */ }
  }
  return results
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json()
    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'Query required', results: [] }, { status: 400 })
    }
    const results = await searchWikipedia(query)
    return Response.json({ results, query })
  } catch {
    return Response.json({ results: [], error: 'Search failed' })
  }
}
