// Searching through a real browser, for pages that plain fetch cannot reach.
//
// The reason this exists: the free API layer (Wikipedia) answers "what is X" and
// nothing else. A question like "what regulation governs PPh 21" needs a search
// engine, and the engines that matter render their results with JavaScript and
// refuse a plain fetch.
//
// Which engines are used is not a matter of taste. Measured from this machine with
// the identifier below, against the query "PMK 168 tahun 2023 PPh 21":
//
//   ecosia      2.6s   21 links   no challenge
//   brave       9.6s   17 links   no challenge
//   bing        0.9s    0 links   results not in the DOM that was read
//   startpage  10.1s    0 links   results not in the DOM that was read
//   mojeek     11.4s    0 links   results not in the DOM that was read
//   duckduckgo    -     -         TLS refused by this network
//   google        -     -         CAPTCHA in 12.8s, from a residential IP
//
// Google is deliberately absent. It answered with /sorry/index and a reCAPTCHA
// challenge on the first request, from a home connection, so it cannot be a default:
// an engine that fails on the first try is worse than no engine, because the failure
// looks like "there is nothing to find".
//
// Every page is fetched through a real Chrome so the result page renders, and the
// text is checked for relevance before it is returned. A page that loads with a 200
// and contains only navigation is not a source, and treating it as one is how an
// agent ends up citing a menu.

import type { Browser, BrowserContext } from 'playwright'

export interface BrowserHit {
  title: string
  snippet: string
  url: string
  source: 'browser'
}

export interface BrowserSearchOptions {
  /** Engines to try, in order. The first that returns links wins. */
  engines?: BrowserEngine[]
  /** Whole-operation ceiling, so one slow engine cannot hold a turn open. */
  timeoutMs?: number
}

export interface BrowserEngine {
  name: string
  /** Builds the results URL for a query. */
  url: (query: string) => string
  /** Container that only exists once results have rendered. */
  readySelector: string
  /** Pulls title, snippet and url out of the rendered page. */
  extract: string
}

const DEFAULT_TIMEOUT_MS = 25_000

/**
 * The engines, and the exact selectors that were observed working.
 *
 * Kept as data rather than a switch so a broken engine can be corrected or dropped
 * without touching the fetch path around it.
 */
export const BROWSER_ENGINES: BrowserEngine[] = [
  {
    name: 'ecosia',
    url: (q) => 'https://www.ecosia.org/search?q=' + encodeURIComponent(q),
    readySelector: 'article, .result, [data-test-id="mainline"]',
    extract: `(() => {
      const out = []
      const seen = new Set()
      for (const a of document.querySelectorAll('a[href^="http"]')) {
        const url = a.href
        if (seen.has(url)) continue
        if (/ecosia\\.org|ecosia\\.com/.test(url)) continue
        const title = (a.innerText || '').trim()
        if (title.length < 12) continue
        const box = a.closest('article, .result, li, div')
        const snippet = ((box && box.innerText) || '').replace(/\\s+/g, ' ').trim()
        seen.add(url)
        out.push({ title: title.slice(0, 200), snippet: snippet.slice(0, 320), url })
        if (out.length >= 8) break
      }
      return out
    })()`,
  },
  {
    name: 'brave',
    url: (q) => 'https://search.brave.com/search?q=' + encodeURIComponent(q),
    readySelector: '#results, .snippet',
    extract: `(() => {
      const out = []
      const seen = new Set()
      for (const block of document.querySelectorAll('.snippet, #results > div')) {
        const a = block.querySelector('a[href^="http"]')
        if (!a) continue
        const url = a.href
        if (seen.has(url) || /brave\\.com/.test(url)) continue
        const title = (block.querySelector('.title, h3, a')?.innerText || '').trim()
        if (title.length < 12) continue
        seen.add(url)
        out.push({
          title: title.slice(0, 200),
          snippet: (block.innerText || '').replace(/\\s+/g, ' ').slice(0, 320),
          url,
        })
        if (out.length >= 8) break
      }
      return out
    })()`,
  },
]


/** Words shorter than this are not useful for deciding whether a page is relevant. */
const MIN_WORD_LENGTH = 4

/**
 * Words short enough to need a reason to be trusted, that are also not acronyms.
 * These are function words: they appear in almost every sentence of their language,
 * so matching one says nothing about what a page is about.
 */
const COMMON_SHORT_WORDS = new Set([
  'dan', 'atau', 'yang', 'untuk', 'dari', 'pada', 'dengan', 'dalam', 'ini', 'itu',
  'ke', 'di', 'the', 'and', 'for', 'from', 'with', 'that', 'this', 'are', 'was',
  'apa', 'ada', 'bisa', 'oleh', 'juga', 'akan', 'tidak', 'kata', 'cara',
])

/**
 * Words so broad that matching them is not evidence of anything.
 *
 * "hukum" (law) is the case that forced this list. The query "dasar hukum PPh 21"
 * matches an article about judges on the word "hukum" alone, and that article is a
 * different subject entirely. A term this general describes a whole field, so it
 * cannot stand as the only link between a question and a page.
 */
const TOO_GENERAL_WORDS = new Set([
  'hukum', 'pajak', 'umum', 'data', 'sistem', 'sosial', 'negara', 'kerja', 'usaha',
  'harga', 'biaya', 'nilai', 'hasil', 'cara', 'dasar', 'aturan', 'peraturan',
  'law', 'tax', 'general', 'data', 'system', 'social', 'state', 'work', 'business',
  'price', 'cost', 'value', 'result', 'rule', 'rules', 'basic',
])

/**
 * Whether a page's text actually has something to do with the query.
 *
 * This is the guard against a silent failure that looks like success. A wrong URL
 * that answers 200 with a navigation menu is a page, but it is not a source, and
 * handing it to an agent produces a confident answer built on nothing.
 *
 * What counts:
 *
 *   - A specific term of four characters or more. A broad one like "hukum" does not
 *     count on its own; see TOO_GENERAL_WORDS for why.
 *   - A short token carrying a digit, however short. "21" in "PPh 21" is what names
 *     the regulation, and a length filter discarded it and then rejected a page that
 *     was entirely about it.
 *   - A short all-letter token that is not a function word, so an acronym such as
 *     "PPh" is recognised without letting "dan" through.
 *
 * A single specific match is enough when it is specific. The earlier rule accepted
 * "hukum" alone and let an article about judges pass a question about tax law; the
 * fix is to decide what counts, not how many matches are needed.
 */
export function pageLooksRelevant(text: string, query: string): boolean {
  const body = text.toLowerCase()
  if (body.trim().length < 200) return false

  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0)

  const specific = words.filter(
    (w) =>
      /\d/.test(w) ||
      (w.length >= 2 && w.length <= 3 && !COMMON_SHORT_WORDS.has(w)) ||
      (w.length >= MIN_WORD_LENGTH && !TOO_GENERAL_WORDS.has(w))
  )

  if (specific.length === 0) {
    // Every word in the query was either a function word or too broad to mean
    // anything. The page cannot be judged on a match, so length decides, and the
    // caller is expected to treat a weak verdict as a reason to search again.
    return body.trim().length > 400
  }

  return specific.some((w) => body.includes(w))
}

/**
 * Runs one query through the engines, in order, and returns the first set of links.
 *
 * Never throws: a search that cannot run returns an empty result with a reason,
 * because the caller has to tell "nothing found" apart from "the search broke", and
 * an exception here would collapse both into the same blank answer.
 */
export async function searchWithBrowser(
  query: string,
  options: BrowserSearchOptions = {}
): Promise<{ hits: BrowserHit[]; source: string | null; warning?: string }> {
  const engines = options.engines ?? BROWSER_ENGINES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const trimmed = query.trim().slice(0, 300)
  if (!trimmed) return { hits: [], source: null }

  const problems: string[] = []
  let browser: Browser | null = null
  const deadline = Date.now() + timeoutMs

  try {
    // Imported lazily so the package is loaded only when a search needs a browser.
    const { chromium } = await import('playwright')

    // Which browser to launch depends on where this is running, and the two cases need
    // different answers.
    //
    //   A development machine has Google Chrome installed, so `channel: 'chrome'`
    //   finds it and pages render exactly as a person would see them.
    //
    //   The container has Alpine's chromium and no Chrome, so that channel is absent
    //   and the launch fails. Alpine's build is a real Chromium, so pointing at it
    //   works; it just has to be named, because Playwright looks for its own bundled
    //   build by default and would not find this one.
    //
    // `VMA_CHROMIUM_PATH` is how the container says where its binary is. Without it the
    // launch is attempted by channel, which is right on a workstation and fails loudly
    // in a container, which is what the warning reports.
    const executablePath = process.env.VMA_CHROMIUM_PATH?.trim() || undefined
    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
      // Chrome refuses to start as root without this, and a container runs as root
      // unless the image says otherwise. Harmless where it is not needed.
      '--no-sandbox',
    ]

    browser = await chromium.launch(
      executablePath
        ? { executablePath, headless: true, args: launchArgs }
        : { channel: 'chrome', headless: true, args: launchArgs }
    )

    for (const engine of engines) {
      if (Date.now() >= deadline) {
        problems.push('ran out of time before every engine was tried')
        break
      }

      const remaining = Math.max(3000, deadline - Date.now())
      let context: BrowserContext | null = null

      try {
        context = await browser.newContext({
          locale: 'id-ID',
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        })
        const page = await context.newPage()
        page.setDefaultTimeout(Math.min(15000, remaining))

        await page.goto(engine.url(trimmed), {
          timeout: Math.min(20000, remaining),
          waitUntil: 'domcontentloaded',
        })

        // Waiting on the container separates a rendered page from a shell. A fixed
        // pause raced the render and read an empty body.
        try {
          await page.waitForSelector(engine.readySelector, { timeout: Math.min(9000, remaining) })
        } catch {
          /* Some engines render late. Extraction still runs, and the relevance check
             decides whether what came back is worth keeping. */
        }

        const found = (await page.evaluate(engine.extract)) as unknown
        const hits = Array.isArray(found)
          ? (found as BrowserHit[])
              .filter(
                (h) => h && h.url && pageLooksRelevant(h.title + ' ' + h.snippet, trimmed)
              )
              // Tagged here rather than in the extractor: the extractor runs inside the
              // page, where the engine's own name is not in scope, and an untagged hit
              // reached the caller as `[undefined]`.
              .map((h) => ({ ...h, source: 'browser' as const }))
              // A result whose title could not be read is still usable: the URL is the
              // part that matters, and "Untitled" is honest about what is missing.
              // Dropping it would lose a real source because of a cosmetic gap.
              .map((h) => ({ ...h, title: h.title && h.title.trim() ? h.title : 'Untitled' }))
          : []

        if (hits.length > 0) return { hits: hits.slice(0, 8), source: engine.name }
        problems.push(`${engine.name}: no usable results`)
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : 'failed'
        problems.push(`${engine.name}: ${message.slice(0, 120)}`)
      } finally {
        try { await context?.close() } catch { /* closing twice is not a problem */ }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : 'failed'
    // A browser that cannot start is the common failure on a server with no Chrome,
    // so it is reported as itself rather than as "no results".
    return { hits: [], source: null, warning: `browser unavailable: ${message.slice(0, 160)}` }
  } finally {
    try { await browser?.close() } catch { /* already gone */ }
  }

  return { hits: [], source: null, ...(problems.length ? { warning: problems.join('; ') } : {}) }
}
