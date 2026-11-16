import { test, expect } from '@playwright/test';
test('native data, charts, filters and live simulation',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/N-body/);
  await expect(page.locator('#best-speedup')).not.toHaveText('—');
  await expect(page.locator('#native-validation')).toHaveText('Idêntico');
  await expect(page.locator('#chart svg')).toBeVisible();
  await page.selectOption('#table-size','4096');
  await expect(page.locator('#native-table tr')).toHaveCount(5);
  await page.selectOption('#chart-metric','mean');
  await expect(page.locator('#chart svg')).toHaveAttribute('aria-label',/Tempo/);
  await page.selectOption('#bodies','256');await page.selectOption('#workers','2');
  await page.click('#view2d');await expect(page.locator('#view2d')).toHaveAttribute('aria-pressed','true');
  await page.click('#play');
  await expect(page.locator('#seq-steps')).not.toHaveText('0');
  await expect(page.locator('#live-equality')).toHaveText('✓ Resultados idênticos');
  await page.click('#play');
  const count=await page.locator('#seq-steps').textContent();
  await page.waitForTimeout(150);
  await expect(page.locator('#seq-steps')).toHaveText(count);
  await page.click('#reset');await expect(page.locator('#seq-steps')).toHaveText('0');
  await page.screenshot({path:'results/screenshots/desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('five real browser benchmark repetitions and JSON export',async({page})=>{
  await page.goto('/');
  await page.selectOption('#bodies','256');await page.selectOption('#workers','2');
  await page.click('#benchmark');
  await expect(page.locator('#browser-status')).toContainText('Medição concluída',{timeout:90000});
  await expect(page.locator('#browser-results')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.click('#download-local');
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('n-body-browser-benchmark.json');
  const path=await download.path();
  const fs=await import('node:fs/promises');const data=JSON.parse(await fs.readFile(path,'utf8'));
  expect(data.repeats).toBe(5);expect(data.max_error).toBe(0);
  expect(data.samples.sequential).toHaveLength(5);expect(data.samples.parallel).toHaveLength(5);
  expect(data.speedup).toBeGreaterThan(0);
  await page.screenshot({path:'results/screenshots/browser-benchmark.png',fullPage:true});
});
test('cancelling a measurement restores controls without partial results',async({page})=>{
  await page.goto('/');await page.selectOption('#bodies','2048');
  await page.click('#benchmark');await page.click('#cancel');
  await expect(page.locator('#browser-status')).toContainText('cancelada');
  await expect(page.locator('#benchmark')).toBeEnabled();
  await expect(page.locator('#browser-results')).toBeHidden();
});
test('mobile view fits the screen and keeps interactions usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.locator('#chart svg')).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
  await page.selectOption('#bodies','256');await page.click('#view2d');
  await page.screenshot({path:'results/screenshots/mobile.png',fullPage:true});
});
test('missing native data has an honest fallback',async({page})=>{
  await page.route('**/data/*.json',route=>route.fulfill({status:404,body:'Not found'}));
  await page.goto('/');
  await expect(page.locator('#native-status')).toContainText('indisponíveis');
  await expect(page.locator('#best-speedup')).toHaveText('—');
  await page.selectOption('#bodies','256');await page.click('#play');
  await expect(page.locator('#seq-steps')).not.toHaveText('0');
  await page.click('#play');
});

test('scroll zoom is synchronized and does not scroll the page',async({page})=>{
  await page.goto('/');
  await page.locator('#canvas-seq').scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>window.scrollY);
  await page.locator('#canvas-seq').hover();await page.mouse.wheel(0,-240);
  await expect.poll(()=>page.locator('#canvas-seq').getAttribute('data-zoom')).not.toBe('1');
  expect(await page.evaluate(()=>window.scrollY)).toBe(before);
  expect(await page.locator('#canvas-par').getAttribute('data-zoom')).toBe(await page.locator('#canvas-seq').getAttribute('data-zoom'));
  await page.click('#reset');await expect(page.locator('#canvas-seq')).toHaveAttribute('data-zoom','1');
  await page.locator('#chart svg').scrollIntoViewIfNeeded();
  const scroll=await page.evaluate(()=>window.scrollY);
  await page.locator('#chart svg').hover();await page.mouse.wheel(0,-240);
  await expect(page.locator('#chart svg')).not.toHaveAttribute('viewBox','0 0 680 270');
  expect(await page.evaluate(()=>window.scrollY)).toBe(scroll);
});
test('large inputs and current speedup are available',async({page})=>{
  await page.goto('/');
  for(const n of ['4096','8192']){
    await page.selectOption('#bodies',n);
    await expect(page.locator('#bodies')).toHaveValue(n);
  }
  await page.selectOption('#bodies','256');
  await page.click('#play');
  await expect(page.locator('#current-speedup')).not.toHaveText('—×');
  await page.click('#play');
  await page.click('#reset');await expect(page.locator('#current-speedup')).toHaveText('—×');
});
