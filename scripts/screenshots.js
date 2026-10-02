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

// Open Graph: 1200x630 link preview card, served as /og.png.
{
  const page = await openRace({ width: 1200, height: 630 });
  await page.evaluate(() => window.hyrox.selectPhase(3));
  await page.click('#focus');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('Space');
  await page.waitForTimeout(3500);
  await page.keyboard.up('Space');
  await page.evaluate(() => {
    for (const selector of ['.scene-toolbar', '.play-controls'])
      document.querySelector(selector).style.display = 'none';
    for (const selector of ['.hud-top', '.scene-callout', '.minimap', '.hud-bottom'])
      document.querySelector(selector).style.visibility = 'hidden';
    Object.assign(document.querySelector('.arena').style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '100',
    });
    const card = document.createElement('div');
    card.style.cssText =
      'position:fixed;inset:0 auto 0 0;z-index:101;width:560px;padding:72px 64px;box-sizing:border-box;color:#181b1c;background:linear-gradient(90deg,#fff 62%,#ffffffcc 82%,#ffffff00)';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;font:800 30px/1 Arial,sans-serif">
        <span style="display:inline-grid;place-items:center;width:44px;height:44px;background:#181b1c;color:#fff;font-style:italic">F</span>FIRST LAP
      </div>
      <div style="margin-top:28px;font:800 64px/1.1 'Apple SD Gothic Neo',sans-serif;letter-spacing:-2px">처음 경험하는<br>하이록스</div>
      <div style="margin-top:20px;font:500 26px/1.4 'Apple SD Gothic Neo',sans-serif;color:#444">길게 누르면 달리고, 손을 떼면 멈춥니다.</div>`;
    document.body.append(card);
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
  await page.close();
}

await browser.close();
console.log(`Saved screenshots to ${outDir.pathname} and public/og.png`);
