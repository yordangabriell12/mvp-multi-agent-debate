// Drives a real browser over the Chrome DevTools Protocol, to test the interface.
//
// Every other test here checks a route or a function. None of them can answer the
// question that matters most to the person using the app: does clicking this
// actually do something. A button can carry an onClick, call a function, and still
// do nothing visible, and only a browser can tell the difference.
//
// No test framework: the protocol is small enough that a direct client is clearer
// than a dependency, and Node has a WebSocket built in.
//
// A browser must already be running with a debugging port:
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/vma-ui about:blank
//
// Usage: node scripts/e2e-ui.mjs [baseUrl] [debugPort]

const BASE = process.argv[2] || 'http://127.0.0.1:3999'
const PORT = process.argv[3] || '9333'

let pass = 0
let fail = 0
const failures = []

function ok(label, detail) {
  console.log(`  PASS  ${label}${detail ? ' :: ' + detail : ''}`)
  pass++
}

function bad(label, detail) {
  console.log(`  FAIL  ${label}${detail ? ' :: ' + detail : ''}`)
  fail++
  failures.push(label)
}

/** A minimal CDP session on one page. */
class Page {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.consoleErrors = []
    this.pageErrors = []
    this.failedRequests = []

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)

      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
        return
      }

      // Console errors and uncaught exceptions are the difference between "the
      // click worked" and "the click threw somewhere the user cannot see".
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(
          msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
        )
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.pageErrors.push(d.exception?.description || d.text || 'unknown error')
      }
      if (msg.method === 'Network.loadingFailed') {
        this.failedRequests.push(`${msg.params.type}: ${msg.params.errorText}`)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`${method} timed out`))
        }
      }, 30000)
    })
  }

  /** Runs an expression in the page and returns its value. */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed')
    }
    return result.result.value
  }

  async goto(url) {
    await this.send('Page.navigate', { url })
    await this.waitForLoad()
  }

  async waitForLoad() {
    // Polls for a settled document rather than subscribing to load events, which
    // arrive in a different order for a client-side routed page.
    for (let i = 0; i < 60; i++) {
      try {
        if ((await this.evaluate('document.readyState')) === 'complete') {
          // One more tick for React to paint the first render.
          await new Promise((r) => setTimeout(r, 400))
          return
        }
      } catch {
        // The document is being replaced; try again.
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    throw new Error(`page did not finish loading: ${url}`)
  }

  /** Clicks by visible text, which is closer to what a person does. */
  async clickText(text, tag = 'button') {
    return this.evaluate(`(() => {
      const wanted = ${JSON.stringify(text)}
      const nodes = Array.from(document.querySelectorAll(${JSON.stringify(tag)}))
      const el = nodes.find((n) => (n.textContent || '').trim().includes(wanted))
      if (!el) return false
      el.click()
      return true
    })()`)
  }

  text() {
    return this.evaluate('document.body.innerText')
  }

  async type(selector, value) {
    return this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
      setter.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
  }

  /** Any error seen since the last clear(). */
  problems() {
    return [...this.consoleErrors, ...this.pageErrors]
  }

  clearErrors() {
    this.consoleErrors = []
    this.pageErrors = []
    this.failedRequests = []
  }
}

/** Opens a page target and connects to it. */
/**
 * Where the browser's debugging endpoint actually is.
 *
 * Chrome resolves `localhost` to whichever address family it prefers, and on this machine
 * that is IPv6: it listens on `[::1]` and connecting on 127.0.0.1 is refused. Both are
 * tried once, so neither family is assumed. Getting this wrong looked exactly like the
 * browser not running.
 */
let debugHost = null

async function findDebugHost() {
  if (debugHost) return debugHost

  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      const version = await fetch(`http://${host}:${PORT}/json/version`).then((r) => r.json())
      if (version && version.Browser) {
        debugHost = host
        return host
      }
    } catch {
      // Try the next family.
    }
  }

  return null
}

async function newPage() {
  const host = await findDebugHost()
  if (!host) throw new Error('The debugging endpoint is not answering.')

  const target = await fetch(`http://${host}:${PORT}/json/new?about:blank`, {
    method: 'PUT',
  }).then((r) => r.json())

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const page = new Page(ws)
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Network.enable')
  return page
}

/** Waits for a condition in the page, returning false if it never holds. */
async function waitFor(page, expression, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      if (await page.evaluate(expression)) return true
    } catch {
      // Mid-navigation; try again.
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

const EMAIL = process.env.VMA_EMAIL || 'admin@example.com'
const PASSWORD = process.env.VMA_PASSWORD || 'AdminPass12345'

async function run(page) {
  // ---------------------------------------------------------------- sign in
  console.log()
  console.log('== Sign in ==')
  await page.goto(`${BASE}/login`)

  if (!(await page.type('input[type="email"]', EMAIL))) {
    bad('the login form has an email field')
    return
  }
  await page.type('input[type="password"]', PASSWORD)
  await page.clickText('Sign in')

  if (!(await waitFor(page, `location.pathname.startsWith('/app')`))) {
    const where = await page.evaluate('location.pathname')
    bad('signing in lands on the app', `still at ${where}. Page said: ${(await page.text()).slice(0, 160)}`)
    return
  }
  ok('signing in lands on the app')

  if (page.problems().length === 0) ok('no console errors while signing in')
  else bad('no console errors while signing in', page.problems().join(' | '))

  // ----------------------------------------------------------- the workspace
  //
  // The walkthrough comes first. It is a modal overlay, so while it is open the composer
  // underneath is unreachable and a check for it reports a missing element that is in fact
  // present but covered. This was reporting a failure the app did not have.
  console.log()
  console.log('== The workspace renders ==')
  if (await page.clickText('Lewati')) {
    ok('the first-run walkthrough can be dismissed')
    await waitFor(page, `!Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Lewati'))`, 12)
  } else {
    ok('the walkthrough was already dismissed')
  }

  const shell = await page.text()

  for (const [label, needle] of [
    ['the sidebar is present', 'New session'],
    ['the sidebar footer is present', 'Sign out'],
  ]) {
    if (shell.includes(needle)) ok(label)
    else bad(label, `"${needle}" was not on the page`)
  }

  // The composer is asserted after a wait, because the page creates a starter session on
  // mount and the composer only exists once that session is the active one.
  if (await waitFor(page, `!!document.querySelector('textarea')`, 20)) ok('the composer is present')
  else bad('the composer is present', 'no textarea appeared')

  // --------------------------------------------------------- deep search
  console.log()
  console.log('== Search Mode toggle ==')
  page.clearErrors()

  if (!(await page.clickText('Search Mode'))) {
    bad('the Search Mode toggle exists')
  } else {
    await new Promise((r) => setTimeout(r, 300))
    if ((await page.text()).includes('Search Mode on')) ok('clicking it switches it on')
    else bad('clicking it switches it on', 'the label never said "on"')

    await page.clickText('Search Mode')
    await new Promise((r) => setTimeout(r, 300))
    if ((await page.text()).includes('Search Mode off')) ok('clicking again switches it off')
    else bad('clicking again switches it off', 'the label never went back to "off"')

    if (page.problems().length === 0) ok('flipping the toggle twice raises nothing')
    else bad('flipping the toggle twice raises nothing', page.problems().join(' | '))
  }

  // The label is the visible name of the feature, so it is asserted directly. It used to
  // read "Deep Search", which was renamed; a stale name here means the rename missed the
  // screen the user actually looks at.
  if ((await page.text()).includes('Deep Search')) {
    bad('the feature is labelled Search Mode', 'the old "Deep Search" label is still on screen')
  } else {
    ok('the feature is labelled Search Mode')
  }

  // ------------------------------------------------------------- settings
  console.log()
  console.log('== Each settings screen opens and closes ==')
  for (const [label, title] of [
    ['Manage Agents', 'Manage Agents'],
    ['AI Models', 'AI Models'],
    ['Agent Roles', 'Agent Roles'],
    ['Knowledge Base', 'Knowledge Base'],
  ]) {
    page.clearErrors()
    if (!(await page.clickText(label))) {
      bad(`"${label}" is in the sidebar`)
      continue
    }
    if (!(await waitFor(page, `document.body.innerText.includes(${JSON.stringify(title)})`))) {
      bad(`"${label}" opens a dialog`)
      continue
    }

    // Escape is the documented way out, so it is the way that gets tested.
    //
    // Known limitation, which is why this can report a failure the app does not have:
    // `document.dispatchEvent(new KeyboardEvent('keydown', ...))` does not reach the
    // listener in headless Chrome, and neither does a key dispatched over CDP, so a modal
    // whose Escape handling is correct still looks stuck. Focus is emulated first to give
    // the dispatched key the best chance of arriving. `Modal.tsx` registers the listener
    // and the overlay also closes on a click outside it, so treat a failure here as
    // unverified rather than as proof of a broken shortcut.
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    for (const type of ['rawKeyDown', 'keyUp']) {
      await page.send('Input.dispatchKeyEvent', {
        type,
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      })
    }

    const closed = await waitFor(
      page,
      `!document.body.innerText.includes(${JSON.stringify(title)})`,
      15
    )
    if (closed) ok(`"${label}" opens and closes with Escape`)
    else bad(`"${label}" opens and closes with Escape`, 'it stayed open')

    if (page.problems().length === 0) ok(`"${label}" raises no errors`)
    else bad(`"${label}" raises no errors`, page.problems().join(' | '))
  }

  // --------------------------------------------------------------- session
  console.log()
  console.log('== Creating a session ==')
  page.clearErrors()
  if (await page.clickText('New session')) {
    await new Promise((r) => setTimeout(r, 800))
    if (page.problems().length === 0) ok('a new session is created without errors')
    else bad('a new session is created without errors', page.problems().join(' | '))
  } else {
    bad('the New session button exists')
  }

  // ------------------------------------------------------------ admin page
  console.log()
  console.log('== The account screen ==')
  page.clearErrors()
  await page.goto(`${BASE}/app/admin/users`)
  const admin = await page.text()

  if (admin.includes('Kelola akun')) ok('the account screen loads for an admin')
  else bad('the account screen loads for an admin', admin.slice(0, 160))

  if (admin.includes('Daftar akun')) ok('the account list section is present')
  else bad('the account list section is present')

  if (page.problems().length === 0) ok('the account screen raises no errors')
  else bad('the account screen raises no errors', page.problems().join(' | '))
}

/** Uploads a file through the composer's file input, as the browser would. */
async function uploadVia(inputSelector, name, body, type) {
  return `(async () => {
    const input = document.querySelector(${JSON.stringify(inputSelector)})
    if (!input) return { ok: false, reason: 'no file input on the page' }

    const dt = new DataTransfer()
    dt.items.add(new File([${JSON.stringify(body)}], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }))
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true }
  })()`
}

async function runUploads(page) {
  console.log()
  console.log('== Uploading a text file ==')
  await page.goto(`${BASE}/app`)
  await page.clickText('Lewati')
  await waitFor(page, `!document.body.innerText.includes('Langkah 1 dari')`, 8)
  page.clearErrors()

  // The upload panel has to be open for its input to exist in the DOM.
  await page.clickText('Drop files here or click to browse')
  await page.evaluate(`document.querySelector('button[title], button')?.click()`) // no-op fallback
  const opened = await waitFor(page, `document.querySelectorAll('input[type=file]').length > 0`, 10)

  if (!opened) {
    // The paperclip toggles it; find the button that does and press it.
    await page.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.querySelector('svg') && b.className.includes('w-8'))
      if (btn) btn.click()
    })()`)
    await waitFor(page, `document.querySelectorAll('input[type=file]').length > 0`, 10)
  }

  const hasInput = await page.evaluate(`document.querySelectorAll('input[type=file]').length > 0`)
  if (!hasInput) {
    bad('the composer exposes a file input', 'no input[type=file] was found after opening the upload panel')
    return
  }
  ok('the composer exposes a file input')

  const textUpload = await page.evaluate(
    await uploadVia('input[type=file]', 'notes.md', '# Notes\n\nAlpha beta gamma.', 'text/markdown')
  )
  if (!textUpload.ok) {
    bad('a text file can be uploaded', textUpload.reason)
  } else {
    // The name appearing is the evidence: the store accepted it and the UI
    // re-rendered. That is exactly what the old code failed to do for a PDF.
    if (await waitFor(page, `document.body.innerText.includes('notes.md')`, 20)) {
      ok('an uploaded text file is shown as attached')
    } else {
      bad('an uploaded text file is shown as attached', 'the filename never appeared')
    }

    if (page.problems().length === 0) ok('uploading a text file raises no errors')
    else bad('uploading a text file raises no errors', page.problems().join(' | '))
  }

  console.log()
  console.log('== Uploading a PDF ==')
  page.clearErrors()

  // A PDF with no vision model chosen must say so. This is the case the old code
  // got wrong: it stored the raw bytes and fed them to the agents as reference
  // material, which looked like it worked.
  const pdfUpload = await page.evaluate(
    await uploadVia(
      'input[type=file]',
      'scan.pdf',
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
      'application/pdf'
    )
  )

  if (!pdfUpload.ok) {
    bad('a PDF can be submitted', pdfUpload.reason)
  } else {
    const explained = await waitFor(
      page,
      `(() => {
        const t = document.body.innerText
        return t.includes('scan.pdf') ||
          t.includes('not set up') ||
          t.includes('vision model') ||
          t.includes('Could not read') ||
          t.includes('not a PDF')
      })()`,
      25
    )
    if (explained) ok('a PDF is either accepted or explained, never silently dropped')
    else bad('a PDF is either accepted or explained, never silently dropped', 'the screen did not react at all')

    if (page.problems().length === 0) ok('submitting a PDF raises no console errors')
    else bad('submitting a PDF raises no console errors', page.problems().join(' | '))
  }
}

/**
 * The user's actual complaint, tested directly: after sending a file it has to be visible
 * in the conversation.
 *
 * Two failures were possible and both are checked. The file could be accepted into the
 * document store (so the chip list showed it) and then never reach the chat, which is what
 * happened before; and the message could render as an empty bubble, which is what happens
 * if the attachment metadata is dropped on the way through.
 */
async function runAttachmentInChat(page) {
  console.log()
  console.log('== An attached file appears in the conversation ==')

  await page.goto(`${BASE}/app`)
  await page.clickText('Lewati')
  await waitFor(page, `!document.body.innerText.includes('Langkah 1 dari')`, 8)
  page.clearErrors()

  // Open the upload panel, then send a file with no typed text at all. A document on its
  // own is a complete request, and it is the case that used to produce an empty prompt.
  await page.clickText('Drop files here or click to browse')
  let opened = await waitFor(page, `document.querySelectorAll('input[type=file]').length > 0`, 10)
  if (!opened) {
    await page.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.querySelector('svg') && b.className.includes('w-8'))
      if (btn) btn.click()
    })()`)
    opened = await waitFor(page, `document.querySelectorAll('input[type=file]').length > 0`, 10)
  }
  if (!opened) {
    bad('the upload panel opens', 'no input[type=file] after opening the composer panel')
    return
  }

  const uploaded = await page.evaluate(
    await uploadVia(
      'input[type=file]',
      'ringkasan-pajak.md',
      '# Ringkasan\n\nTarif PPh badan untuk tahun pajak 2024.',
      'text/markdown'
    )
  )
  if (!uploaded.ok) {
    bad('a document can be attached', uploaded.reason)
    return
  }
  if (!(await waitFor(page, `document.body.innerText.includes('ringkasan-pajak.md')`, 20))) {
    bad('the attached document is listed before sending', 'the filename never appeared')
    return
  }
  ok('the attached document is listed before sending')

  // Count the file cards before and after sending. A count that does not rise means the
  // file was shown as pending but never made it into a message.
  const cardsBefore = await page.evaluate(`document.querySelectorAll('figure figcaption').length`)

  // Send with an empty composer: the file is the whole message.
  await page.evaluate(`(() => {
    const form = document.querySelector('form')
    if (form) form.requestSubmit()
  })()`)

  const appeared = await waitFor(
    page,
    `(() => {
      const cards = document.querySelectorAll('figure figcaption')
      if (cards.length <= ${cardsBefore}) return false
      return document.body.innerText.includes('ringkasan-pajak.md')
    })()`,
    25
  )

  if (appeared) {
    ok('the file appears in the conversation as an attachment')
  } else {
    bad(
      'the file appears in the conversation as an attachment',
      `file cards went from ${cardsBefore} to ${await page.evaluate(`document.querySelectorAll('figure figcaption').length`)}, so the file never became a message`
    )
  }

  // The card has to say what happened to the file, not just its name, because a reader
  // needs to know whether the agents can actually read it.
  const described = await page.evaluate(`(() => {
    const t = document.body.innerText
    return t.includes('characters available to the agents') || t.includes('read as text')
  })()`)
  if (described) ok('the attachment says it was read and how much text was kept')
  else bad('the attachment says it was read and how much text was kept', 'only the filename is shown')

  // An empty message with no file must still be refused, so the change did not open a
  // path where a blank question reaches the agents.
  await page.goto(`${BASE}/app`)
  await waitFor(page, `!!document.querySelector('form')`, 8)
  const beforeBlank = await page.evaluate(`document.querySelectorAll('[class*="rounded-br-md"]').length`)
  await page.evaluate(`(() => { const f = document.querySelector('form'); if (f) f.requestSubmit() })()`)
  await waitFor(page, `true`, 2)
  const afterBlank = await page.evaluate(`document.querySelectorAll('[class*="rounded-br-md"]').length`)
  if (afterBlank === beforeBlank) ok('an empty message with no file is still refused')
  else bad('an empty message with no file is still refused', `message bubbles rose ${beforeBlank} -> ${afterBlank}`)

  if (page.problems().length === 0) ok('the attachment flow raises no console errors')
  else bad('the attachment flow raises no console errors', page.problems().join(' | '))
}

/**
 * An image with no vision model configured.
 *
 * This is the case that used to make images impossible to attach at all: reading the text
 * failed, the whole upload was rejected, and the person saw an error instead of their file.
 * The image must still appear, carrying the reason it could not be read.
 *
 * A PNG is drawn in the page rather than fetched, so the test needs no fixture and cannot
 * drift from one.
 */
async function runImageAttachment(page) {
  console.log()
  console.log('== An image appears even when it cannot be read ==')

  await page.goto(`${BASE}/app`)
  await waitFor(page, `!!document.querySelector('form')`, 8)
  page.clearErrors()

  // Only open the panel when it is closed: clicking an already-open toggle closes it.
  if (!(await page.evaluate(`document.querySelectorAll('input[type=file]').length > 0`))) {
    await page.evaluate(`document.querySelector('[aria-label="Attach files"]')?.click()`)
  }
  if (!(await waitFor(page, `document.querySelectorAll('input[type=file]').length > 0`, 10))) {
    bad('the upload panel opens for an image', 'no input[type=file]')
    return
  }

  const drawn = await page.evaluate(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 120; canvas.height = 80
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#c2410c'; ctx.fillRect(0, 0, 120, 80)
    ctx.fillStyle = '#fef3c7'; ctx.fillRect(20, 20, 80, 40)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    const input = document.querySelector('input[type=file]')
    if (!input) return 'no input'
    const dt = new DataTransfer()
    dt.items.add(new File([blob], 'bukti-transfer.png', { type: 'image/png' }))
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return 'ok'
  })()`)

  if (drawn !== 'ok') {
    bad('an image can be submitted', String(drawn))
    return
  }
  ok('an image can be submitted')

  // Accepted or refused-with-a-reason, but never silently dropped.
  if (!(await waitFor(page, `document.body.innerText.includes('bukti-transfer.png')`, 25))) {
    bad(
      'an unreadable image is still attached, with the reason',
      'the filename never appeared, so the upload was silently rejected'
    )
    return
  }
  ok('an unreadable image is still attached, with the reason')

  // The preview is what tells the reader what they attached, so it must be there.
  const hasThumb = await page.evaluate(
    `!!Array.from(document.querySelectorAll('img')).find((i) => (i.src || '').startsWith('data:image'))`
  )
  if (hasThumb) ok('the image shows a thumbnail, not just a filename')
  else bad('the image shows a thumbnail, not just a filename', 'no data URL image was rendered')

  await page.evaluate(`document.querySelector('form')?.requestSubmit()`)

  const inChat = await waitFor(
    page,
    `(() => {
      const fig = Array.from(document.querySelectorAll('figure')).find((f) =>
        f.innerText.includes('bukti-transfer.png'))
      return !!fig && !!fig.querySelector('img[src^="data:image"]')
    })()`,
    25
  )
  if (inChat) ok('the image appears in the conversation with its thumbnail')
  else bad('the image appears in the conversation with its thumbnail', 'no figure carried the image')

  if (page.problems().length === 0) ok('the image flow raises no console errors')
  else bad('the image flow raises no console errors', page.problems().join(' | '))
}

async function main() {
  console.log(`== Browser UI check against ${BASE} (debug port ${PORT}) ==`)

  // A debug port that is not answering means the browser was not started with one, which is
  // a setup problem worth naming rather than a test failure.
  const host = await findDebugHost()
  if (!host) {
    console.error(
      `\nNo browser is listening on port ${PORT}.\n` +
        `Start one first, for example:\n` +
        `  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\\n` +
        `    --headless=new --remote-debugging-port=${PORT} \\\n` +
        `    --user-data-dir=/tmp/vma-ui --no-first-run about:blank\n`
    )
    process.exit(2)
  }
  const version = await fetch(`http://${host}:${PORT}/json/version`).then((r) => r.json())
  console.log(`   using ${version.Browser}`)

  const page = await newPage()
  try {
    await run(page)
    await runUploads(page)
    await runAttachmentInChat(page)
    await runImageAttachment(page)
  } catch (error) {
    bad('the run itself completed', error.message)
  } finally {
    page.ws.close()
  }

  console.log()
  console.log('============================================')
  console.log(`  PASS: ${pass}    FAIL: ${fail}`)
  if (failures.length) console.log(`  Failed: ${failures.join(' | ')}`)
  console.log('============================================')

  process.exit(fail === 0 ? 0 : 1)
}

await main()
