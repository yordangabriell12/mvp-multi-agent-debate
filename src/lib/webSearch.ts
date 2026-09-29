// Searching the web, for one agent's own question.
//
// Three layers, tried together, because each covers ground the others miss:
//
//   1. Wikipedia. Free, no key, no quota. Good for background and definitions, and
//      poor for anything current. Both language editions are queried: an Indonesian
//      question about an Indonesian regulation has an article in id.wikipedia and
//      none in en.wikipedia, and querying only English is why those questions used
//      to come back empty.
//   2. A search provider, when one is configured. Optional, because a deployment
//      with no search key should still get something.
//   3. A real browser, for the result pages that only exist after JavaScript runs.
//      Off unless asked for, because it costs seconds per query and needs Chrome on
//      the machine.
//
// Which one answered is reported per result set. A caller that wants to know whether
// it is looking at a current answer or an encyclopedia entry should not have to guess
// from the shape of the results.

import { searchWithBrowser, pageLooksRelevant } from './browserSearch'

export interface SearchHit {
  title: string
  snippet: string
  url: string
  /** Which backend produced this hit. */
  source: 'wikipedia' | 'tavily' | 'searxng' | 'browser'
}

export interface SearchOutcome {
  /** The query that was actually sent, which may differ from the suggestion. */
  query: string
  hits: SearchHit[]
  /** Every backend that contributed, in the order they were tried. */
  sources: string[]
  /** Set when a backend failed, so a partial answer can say what was missing. */
  warning?: string
}

const USER_AGENT = 'VMA-Research/1.0 (multi-agent debate tool)'
const MAX_HITS_PER_SOURCE = 5

/** Keeps a snippet short enough to put in a prompt without crowding it out. */
function clean(text: string, limit = 320): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, limit)
}

/** What the deployment has available. An absent key simply skips that layer. */
export interface SearchBackends {
  tavilyKey?: string
  searxngUrl?: string
  /**
   * Whether the browser layer runs. On unless switched off.
   *
   * It is the layer that answers the questions this feature exists for, so it runs by
   * default. `VMA_BROWSER_SEARCH=0` turns it off for a deployment with no Chrome
   * installed, where starting a browser on every query would only produce a warning.
   */
  useBrowser?: boolean
}

export function searchBackendsFromEnvironment(): SearchBackends {
  return {
    tavilyKey: process.env.VMA_TAVILY_API_KEY?.trim() || undefined,
    searxngUrl: process.env.VMA_SEARXNG_URL?.trim() || undefined,
    useBrowser: process.env.VMA_BROWSER_SEARCH !== '0',
  }
}

/**
 * Wikipedia, in both language editions.
 *
 * Querying only English was a real defect, not a simplification. An Indonesian
 * question about an Indonesian regulation ("dasar hukum PPh 21") has an article in
 * id.wikipedia and nothing matching in en.wikipedia, so the search returned zero
 * results and the agent reported that it had no search tool at all. Both editions are
 * queried and the results merged, because a topic can legitimately be covered in
 * either.
 */
const WIKI_LANGS = ['id', 'en'] as const

async function searchWikipediaLang(query: string, lang: string): Promise<SearchHit[]> {
  const searchUrl =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=` +
    encodeURIComponent(query)

  const searchRes = await fetch(searchUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000),
  })
  if (!searchRes.ok) return []

  const searchData = await searchRes.json()
  const topics: { title: string; snippet?: string }[] = searchData?.query?.search ?? []
  const hits: SearchHit[] = []

  for (const topic of topics.slice(0, 3)) {
    // The summary endpoint gives a real lead paragraph, where the search snippet is
    // a fragment with HTML marks left in it.
    const summaryUrl =
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` +
      encodeURIComponent(topic.title.replace(/ /g, '_'))

    try {
      const summaryRes = await fetch(summaryUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15000),
      })
      if (!summaryRes.ok) continue

      const summary = await summaryRes.json()
      hits.push({
        title: summary.title || topic.title,
        snippet: clean(summary.extract || topic.snippet?.replace(/<[^>]*>/g, '') || ''),
        url:
          summary.content_urls?.desktop?.page ||
          `https://${lang}.wikipedia.org/wiki/` + encodeURIComponent(topic.title),
        source: 'wikipedia',
      })
    } catch {
      // One missing summary should not lose the other results.
    }
  }

  return hits
}

async function searchWikipedia(query: string): Promise<SearchHit[]> {
  const perLanguage = await Promise.allSettled(WIKI_LANGS.map((lang) => searchWikipediaLang(query, lang)))
  const hits: SearchHit[] = []
  for (const outcome of perLanguage) {
    if (outcome.status === 'fulfilled') hits.push(...outcome.value)
  }
  return hits
}

async function searchTavily(query: string, apiKey: string): Promise<SearchHit[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: MAX_HITS_PER_SOURCE,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Tavily returned ${res.status}`)

  const data = await res.json()
  const results: { title?: string; content?: string; url?: string }[] = data?.results ?? []

  return results
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title || r.url || 'Untitled',
      snippet: clean(r.content || ''),
      url: r.url || '',
      source: 'tavily' as const,
    }))
}

async function searchSearxng(query: string, baseUrl: string): Promise<SearchHit[]> {
  const endpoint = baseUrl.replace(/\/$/, '') + '/search?format=json&q=' + encodeURIComponent(query)

  const res = await fetch(endpoint, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`SearXNG returned ${res.status}`)

  const data = await res.json()
  const results: { title?: string; content?: string; url?: string }[] = data?.results ?? []

  return results.slice(0, MAX_HITS_PER_SOURCE).map((r) => ({
    title: r.title || r.url || 'Untitled',
    snippet: clean(r.content || ''),
    url: r.url || '',
    source: 'searxng' as const,
  }))
}

/**
 * Searches with every backend that is available, and says which ones answered.
 *
 * The browser goes first, and that order is the point of the feature rather than an
 * optimisation. A question about a regulation, a price, or anything that happened
 * recently is answered by a search engine and not by an encyclopedia: the query
 * "dasar hukum PPh 21 terbaru" returns no relevant Wikipedia article at all, while
 * the same query through a real browser reaches the PDF on pajak.go.id that the
 * question is actually about. Running the cheap layers first and treating the browser
 * as a fallback meant the browser almost never ran, because "three irrelevant results"
 * is not an empty result set.
 *
 * The API layers still run, in parallel with the browser, so a fast query does not
 * pay for both sequentially and an outage of either one still leaves an answer.
 */
export async function searchWeb(query: string, backends: SearchBackends): Promise<SearchOutcome> {
  const trimmed = query.trim().slice(0, 300)
  const sources: string[] = []
  const hits: SearchHit[] = []
  const problems: string[] = []

  // Started before the API calls are awaited, so both happen at once. The browser
  // search is the slow one and it is what the answer usually depends on, so making it
  // wait for Wikipedia would add its latency to every query for no benefit.
  const browserPromise = backends.useBrowser
    ? searchWithBrowser(trimmed)
    : Promise.resolve({ hits: [] as SearchHit[], source: null as string | null, warning: undefined as string | undefined })

  const attempts: Promise<{ name: string; hits: SearchHit[] }>[] = [
    searchWikipedia(trimmed).then((h) => ({ name: 'wikipedia', hits: h })),
  ]

  if (backends.tavilyKey) {
    attempts.push(
      searchTavily(trimmed, backends.tavilyKey).then((h) => ({ name: 'tavily', hits: h }))
    )
  }
  if (backends.searxngUrl) {
    attempts.push(
      searchSearxng(trimmed, backends.searxngUrl).then((h) => ({ name: 'searxng', hits: h }))
    )
  }

  for (const outcome of await Promise.allSettled(attempts)) {
    if (outcome.status === 'fulfilled') {
      if (outcome.value.hits.length > 0) {
        sources.push(outcome.value.name)
        hits.push(...outcome.value.hits)
      }
    } else {
      problems.push(outcome.reason instanceof Error ? outcome.reason.message : 'a backend failed')
    }
  }

  // De-duplicated by URL: the same page often arrives from more than one backend, and
  // a repeated entry in a prompt reads as two independent sources.
  const seen = new Set<string>()
  const unique = hits.filter((hit) => {
    if (!hit.url || seen.has(hit.url)) return false
    seen.add(hit.url)
    return true
  })

  // Irrelevant hits are dropped rather than kept "for context". A Wikipedia article
  // about a judge, returned for a tax question, is not weak evidence: it is noise that
  // an agent will try to use, and the caller has no way to know it came from a loose
  // keyword match.
  const relevant = unique.filter((hit) => pageLooksRelevant(hit.title + ' ' + hit.snippet, trimmed))

  const viaBrowser = await browserPromise

  if (viaBrowser.hits.length > 0) {
    // Browser hits first, because they were reached by an actual search engine for
    // this query, which is a stronger signal than an article that matched a word. The
    // API results follow as supporting material rather than as the main answer.
    sources.unshift('browser:' + (viaBrowser.source || 'unknown'))
    const merged = [...viaBrowser.hits, ...relevant]
    const seenAgain = new Set<string>()
    return {
      query: trimmed,
      hits: merged
        .filter((h) => {
          if (!h.url || seenAgain.has(h.url)) return false
          seenAgain.add(h.url)
          return true
        })
        .slice(0, 8),
      sources,
      ...(problems.length > 0 ? { warning: problems.join('; ') } : {}),
    }
  }

  if (viaBrowser.warning) problems.push(viaBrowser.warning)

  // Nothing came from the browser and nothing from the API layers was relevant.
  // Returning the noise would be worse than returning nothing: the caller then
  // reports "no usable results", which is true, rather than handing an agent pages
  // that do not answer the question.
  return {
    query: trimmed,
    hits: relevant.slice(0, 8),
    sources,
    ...(problems.length > 0 ? { warning: problems.join('; ') } : {}),
  }
}
