// Playwright check of "הליכה ברחוב". Run: npx vite preview --port 4175 & node tests/walk.e2e.mjs
// walk.js and ai-menu.js come from a local AppOfApp-GH checkout (the cloud cannot reach vercel.app).
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'fs'
const BASE = process.env.BASE || 'http://localhost:4175'
const AOA = process.env.AOA || '../AppOfApp-GH/public'
const SHOTS = process.env.SHOTS || 'tests/shots'
mkdirSync(SHOTS, { recursive: true })
let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
async function open(opts) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.route('https://appofapp-gh.vercel.app/walk.js', (r) => r.fulfill({ contentType: 'text/javascript', body: readFileSync(`${AOA}/walk.js`) }))
  await p.route('https://anat1969.github.io/AppOfApp-GH/walk.js', (r) => r.fulfill({ contentType: 'text/javascript', body: readFileSync(`${AOA}/walk.js`) }))
  await p.route('https://appofapp-gh.vercel.app/ai-menu.js', (r) => r.fulfill({ contentType: 'text/javascript', body: readFileSync(`${AOA}/ai-menu.js`) }))
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  return { ctx, p, errs }
}
const sw = (p, s) => p.getByTestId('street-walk').locator(s)
{
  const { ctx, p, errs } = await open({ viewport: { width: 1440, height: 900 } })
  await p.getByRole('button', { name: 'הליכה ברחוב' }).click()
  await p.waitForFunction(() => document.querySelector('space-walk')?.shadowRoot?.querySelector('.msg')?.hidden, null, { timeout: 30000 })
  ok((await sw(p, '.insight').innerText()).startsWith('המגדל'), 'opens on the tower: ' + await sw(p, '.insight').innerText())
  ok(/פי \d/.test(await sw(p, '.explain').innerText()), 'scale against the neighbours: ' + await sw(p, '.explain').innerText())
  await p.waitForTimeout(900)
  await p.locator('.viewport').screenshot({ path: `${SHOTS}/sky-walk.png` })
  await sw(p, '[data-variant="today"]').click()
  ok((await sw(p, '.insight').innerText()).includes('היום'), 'today without the tower')
  await sw(p, '[data-variant="tower"]').click()
  await sw(p, '[data-view="top"]').click(); await p.waitForTimeout(900)
  await p.locator('.viewport').screenshot({ path: `${SHOTS}/sky-walk-top.png` })
  await p.getByRole('button', { name: 'אקסונומטרי' }).click()
  ok(await p.getByTestId('street-walk').count() === 0, 'another view closes the walk and the 3D model is back')
  ok(await p.locator('.city-note').count() === 1, 'the city note returns with the model')
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '))
  await ctx.close()
}
{
  const { ctx, p, errs } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await p.getByRole('button', { name: 'הליכה ברחוב' }).click(); await p.waitForTimeout(3000)
  const sx = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ok(sx <= 0, 'mobile: no horizontal scroll (' + sx + ')')
  await p.screenshot({ path: `${SHOTS}/sky-walk-mobile.png`, fullPage: true })
  ok(errs.length === 0, 'mobile: no page errors ' + errs.join(' | '))
  await ctx.close()
}
await b.close()
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0)
