import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const url = process.argv[2]
assert(url, 'Pass the deployed site URL')
const site = new URL(url)
assert(site.protocol === 'https:' || site.hostname === '127.0.0.1', 'HTTPS is required for a public site')
await mkdir('test-results', { recursive: true })
const report = { url, assets: [], pageErrors: [], failedRequests: [], consoleErrors: [] }
let browser
let page
try {
  // Check actual HTML and assets served by the host, including their MIME types.
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  report.httpStatus = response.status
  assert.equal(response.status, 200, `Site returned HTTP ${response.status}`)
  const html = await response.text()
  assert(html.includes('Между строк'), 'Expected application HTML was not served')
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1])
  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m => m[1])
  assert(scripts.length > 0 && styles.length > 0, 'Built JavaScript and styles are missing')
  for (const [kind, files] of [['script', scripts], ['style', styles]]) {
    for (const path of files) {
      const assetUrl = new URL(path, response.url).href
      const asset = await fetch(assetUrl, { signal: AbortSignal.timeout(30000) })
      const type = asset.headers.get('content-type') || ''
      report.assets.push({ kind, url: assetUrl, status: asset.status, type })
      assert.equal(asset.status, 200, `${kind} returned HTTP ${asset.status}: ${assetUrl}`)
      assert(kind === 'script' ? /javascript/.test(type) : /text\/css/.test(type), `Wrong MIME type ${type}: ${assetUrl}`)
    }
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (process.env.CI ? undefined : '/usr/bin/chromium'),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => report.pageErrors.push(error.message))
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()) })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByRole('heading', { name: 'Мой список чтения.', exact: true }).waitFor({ timeout: 20000 })
  report.renderedBooks = await page.locator('.book-row').count()
  assert.equal(report.renderedBooks, 118, 'Published library must render all 118 books')
  await page.screenshot({ path: 'test-results/published-site.png', fullPage: false })
  await page.getByRole('textbox', { name: 'Поиск книг', exact: true }).fill('Оруэлл')
  await page.waitForFunction(() => document.querySelectorAll('.book-row').length === 2)
  report.searchResults = await page.locator('.book-row').count()
  assert.equal(report.searchResults, 2, 'Published search must find both Orwell books')
  report.ownedOmnibus = []
  for (const title of ['1984', 'Скотный двор']) {
    await page.getByRole('button', { name: title, exact: true }).click()
    const dialog = page.getByRole('dialog')
    assert(await dialog.getByRole('checkbox', { name: 'Есть в бумажном', exact: true }).isChecked(), `${title} must be marked as owned`)
    const link = await dialog.getByRole('link', { name: 'Читай-город', exact: true }).getAttribute('href')
    assert.equal(link, 'https://www.chitai-gorod.ru/product/1984-skotnyy-dvor-2855976')
    report.ownedOmnibus.push(title)
    await page.keyboard.press('Escape')
  }
  assert.deepEqual(report.pageErrors, [], 'Published application has JavaScript errors')
  report.success = true
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.success = false
  try { await page?.screenshot({ path: 'test-results/published-site.png', fullPage: false }) } catch {}
  report.error = error.message
  console.error(JSON.stringify(report, null, 2))
  // Surface the real hosting/browser error in the Actions summary.
  console.error(`::error title=Published site verification failed::${error.message.replaceAll('\n', ' ')}`)
  process.exitCode = 1
} finally {
  await writeFile('test-results/published-site.json', JSON.stringify(report, null, 2) + '\n')
  await browser?.close()
}
