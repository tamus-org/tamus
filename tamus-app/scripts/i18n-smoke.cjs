const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { openExample } = require('./open-example.cjs');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.TAMUS_URL || 'http://127.0.0.1:1420');
    await openExample(page);
    const setLanguage = async (language) => {
      await page.getByRole('button', { name: /^(Настройки|Settings)$/ }).click();
      await page.locator('#interface-language').selectOption(language);
      await page
        .getByRole('dialog', { name: language === 'en' ? 'Settings' : 'Настройки', exact: true })
        .getByRole('button', { name: language === 'en' ? 'Close' : 'Закрыть', exact: true })
        .click();
    };
    await setLanguage('en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('.unsaved-dot').count(), 0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('#advanced-mode').check();
    await page
      .getByRole('dialog', { name: 'Settings', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    assert.equal(
      await page.getByRole('button', { name: 'Minimize window', exact: true }).isDisabled(),
      true,
    );
    assert.match(await page.locator('.paper-heading').innerText(), /AUTHOR:/);
    assert.match(await page.locator('.paper-footer').innerText(), /NODE:/);
    assert.match(await page.locator('.sidebar-bottom').innerText(), /1 model/);
    await page.locator('.app-menu summary').filter({ hasText: 'File' }).click();
    await page.getByRole('button', { name: 'Save as…', exact: true }).waitFor();
    await page.locator('.app-menu summary').filter({ hasText: 'Edit' }).click();
    assert.equal(await page.locator('.app-menu details[open]').count(), 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Block 1: Принять заказ', exact: true }).click();
    await page.locator('#property-description').fill('Unsaved draft — черновик');
    await setLanguage('ru');
    assert.equal(
      await page.locator('#property-description').inputValue(),
      'Unsaved draft — черновик',
    );
    await setLanguage('en');
    assert.equal(
      await page.locator('#property-description').inputValue(),
      'Unsaved draft — черновик',
    );
    const originalDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const original = JSON.parse(fs.readFileSync(await (await originalDownload).path(), 'utf8'));
    const expected = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'example.tamus.json'), 'utf8'),
    );
    assert.deepEqual(original, expected);
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.getByRole('button', { name: 'Block 1: Принять заказ', exact: true }).dblclick();
    const props = page.getByRole('dialog', { name: 'Block properties', exact: true });
    await props.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await props.getByRole('button', { name: 'Inherit from sheet', exact: true }).waitFor();
    await props.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('.flow-label').filter({ hasText: 'Заявка' }).dblclick();
    const flow = page.getByRole('dialog', { name: 'Arrow properties', exact: true });
    await flow.getByRole('button', { name: 'Add…', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Select flow objects', exact: true });
    await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
    await flow.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
      .locator('.tree-item')
      .filter({ hasText: /^Документы/ })
      .click();
    await page.getByRole('heading', { name: 'Документы', exact: true }).waitFor();
    assert.match(await page.locator('.elements-table').innerText(), /Name/);
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    assert.equal(await page.locator('#property-name').inputValue(), 'New item');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Create model', exact: true }).click();
    await page.locator('#create-name').fill('Order data');
    await page.locator('#model-notation').selectOption('DFD');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('heading', { name: 'Order data', exact: true }).waitFor();
    await page.getByRole('button', { name: 'External entity', exact: true }).click();
    await page.locator('.diagram-drawing').click({ position: { x: 60, y: 100 } });
    await page.getByRole('button', { name: 'Data store', exact: true }).click();
    await page.locator('.diagram-drawing').click({ position: { x: 590, y: 300 } });
    await page.getByRole('button', { name: 'Arrow', exact: true }).click();
    await page.getByRole('button', { name: 'Right: External entity', exact: true }).click();
    await page.getByRole('button', { name: 'Left: Data store', exact: true }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'A DFD flow must connect to a process.' })
      .waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
    await page.getByRole('button', { name: 'Select and move', exact: true }).click();
    await page
      .getByRole('button', { name: 'Process 0: Order data', exact: true })
      .click({ modifiers: ['Control'] });
    const decompose = page.getByRole('dialog', { name: 'Create decomposition', exact: true });
    await page.locator('#decomposition-count').fill('2');
    await decompose.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('button', { name: 'Process 1: Process 1', exact: true }).waitFor();
    assert.match(await page.locator('.paper-footer').innerText(), /NODE:.*0/s);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saved = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
    assert.equal(saved.models[2].blocks[0].name, 'Process 1');
    assert.deepEqual(saved.models[0], expected.models[0]);
    await setLanguage('ru');
    await page.getByRole('button', { name: 'Процесс 1: Process 1', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
    await setLanguage('en');
    fs.mkdirSync(path.join(__dirname, '..', '.artifacts'), { recursive: true });
    await page.screenshot({
      path: path.join(__dirname, '..', '.artifacts', 'english-workspace.png'),
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'passed',
        scenarios: [
          'live language switching',
          'language persistence',
          'translated menus, stamps and accessibility labels',
          'draft preservation',
          'project data unchanged',
          'English object properties and classifier picker',
          'English default item names',
          'localized validation',
          'English DFD decomposition names',
          'English save and Russian reopening',
        ],
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
