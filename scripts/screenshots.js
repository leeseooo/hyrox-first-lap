// Captures the README screenshots from a running build.
// Usage: npm run screenshots -- [baseUrl]   (default: http://localhost:4173, i.e. `vite preview`)
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.argv[2] ?? 'http://localhost:4173';
const outDir = new URL('../docs/screenshots/', import.meta.url);
const executablePath =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath });

async function openRace(viewport, deviceScaleFactor = 1) {
  const page = await browser.newPage({ viewport, deviceScaleFactor, locale: 'ko-KR' });
  await page.addInitScript(() => localStorage.setItem('first-lap-language', 'ko'));
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.hyrox?.getState);
  return page;
}

const shot = (page, name) => page.screenshot({ path: new URL(name, outDir).pathname });

// Holds Space (the race keeps moving only while held) and captures mid-motion.
async function holdAndShot(page, ms, name) {
  // Space on a focused toolbar button would click it instead of moving the athlete.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('Space');
  await page.waitForTimeout(ms);
  await shot(page, name);
  await page.keyboard.up('Space');
}

// Hero: focus view in the middle of the sled push.
{
  const page = await openRace({ width: 1440, height: 900 });
  await page.evaluate(() => window.hyrox.selectPhase(3));
  await page.click('#focus');
  await holdAndShot(page, 3500, 'hero.png');
  await page.close();
}

// Desktop: full layout during the first run.
{
  const page = await openRace({ width: 1440, height: 900 });
  await holdAndShot(page, 3000, 'desktop.png');
  await page.close();
}

// Mobile: iPhone-sized viewport during the wall balls.
{
  const page = await openRace({ width: 390, height: 844 }, 2);
  await page.evaluate(() => window.hyrox.selectPhase(15));
  await page.locator('#experience').scrollIntoViewIfNeeded();
  await holdAndShot(page, 3000, 'mobile.png');
  await page.close();
}

// Finish: completion card after the last segment.
{
  const page = await openRace({ width: 1440, height: 900 });
  await page.evaluate(() => {
    window.hyrox.selectPhase(15);
    for (let i = 0; i < 10 && !window.hyrox.getState().complete; i++)
      document.getElementById('skip').click();
  });
  await page.waitForTimeout(500);
  await page.locator('#experience').screenshot({ path: new URL('finish.png', outDir).pathname });
  await page.close();
}

await browser.close();
console.log(`Saved screenshots to ${outDir.pathname}`);
