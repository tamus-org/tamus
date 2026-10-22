const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 940 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const artifacts = path.join(__dirname, '..', '.artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    await page.addInitScript(() =>
      localStorage.setItem('tamus:ui:settings:v1', JSON.stringify({ advanced: true })),
    );
    await page.goto(process.env.TAMUS_URL || 'http://127.0.0.1:1420');
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    assert.equal(await page.locator('.function-block').count(), 3);
    await page.screenshot({ path: path.join(artifacts, 'main-window.png') });

    // Sheet fields must reach both the technical frame and saved project data.
    await page.getByRole('button', { name: 'Свойства диаграммы', exact: true }).click();
    await page.locator('#sheet-author').fill('Иванов И. И.');
    await page.locator('#sheet-createdAt').fill('2026-10-21');
    await page.locator('#sheet-number').fill('17');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    assert.match(await page.locator('.paper-heading').innerText(), /Иванов И. И\./);
    assert.match(await page.locator('.paper-footer').innerText(), /17/);
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    assert.doesNotMatch(await page.locator('.paper-heading').innerText(), /Иванов/);
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    assert.match(await page.locator('.paper-heading').innerText(), /Иванов/);
    await page.getByRole('button', { name: 'Привязка к сетке', exact: true }).click();
    assert.equal(
      await page.locator('.diagram-drawing').evaluate((el) => getComputedStyle(el).backgroundImage),
      'none',
    );
    await page.getByRole('button', { name: 'Привязка к сетке', exact: true }).click();
    await page.locator('.inspector').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(artifacts, 'ramus-sheet.png') });

    // Property editing, undo and redo all change the actual diagram data.
    await page.getByRole('button', { name: 'Блок 1: Принять заказ', exact: true }).click();
    await page.locator('#property-name').fill('Принять обращение');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await page.getByRole('button', { name: 'Блок 1: Принять обращение', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await page.getByRole('button', { name: 'Блок 1: Принять заказ', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await page.getByRole('button', { name: 'Блок 1: Принять обращение', exact: true }).waitFor();

    // Pointer capture and drag produce one completed position edit.
    const block = page.getByRole('button', { name: 'Блок 1: Принять обращение', exact: true });
    const box = await block.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 98, box.y + 64, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      () => document.querySelector('.geometry-values strong')?.textContent !== '100',
    );

    // Create a block, create a real connection, then remove the block and undo.
    await page.getByRole('button', { name: 'Блок', exact: true }).click();
    await page.locator('.diagram-drawing').click({ position: { x: 80, y: 230 } });
    assert.equal(await page.locator('.function-block').count(), 4);
    await page.getByRole('button', { name: 'Стрелка', exact: true }).click();
    await page.getByRole('button', { name: 'Выход: Принять обращение', exact: true }).click();
    await page.getByRole('button', { name: 'Вход: Новая функция', exact: true }).click();
    await page.locator('#property-name').fill('Новая связь');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await page.getByRole('button', { name: 'Выбрать и переместить', exact: true }).click();
    assert.equal(await page.locator('.flow-label').count(), 3);
    await page.getByRole('button', { name: 'Блок 4: Новая функция', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить блок', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    assert.equal(await page.locator('.function-block').count(), 3);
    assert.equal(await page.locator('.flow-label').count(), 2);
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    assert.equal(await page.locator('.function-block').count(), 4);
    assert.equal(await page.locator('.flow-label').count(), 3);

    // Exercise new qualifier, element editing, filtering and deletion.
    await page.getByRole('button', { name: 'Создать классификатор', exact: true }).click();
    await page.locator('#create-name').fill('Договоры');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByRole('heading', { name: 'Договоры', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Добавить элемент', exact: true }).first().click();
    await page.locator('#property-name').fill('Договор поставки');
    await page.locator('#property-description').fill('Условия сотрудничества с поставщиком.');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await page.getByRole('button', { name: 'Договор поставки', exact: true }).waitFor();
    await page.getByLabel('Поиск в проекте').fill('несуществующий элемент');
    await page.getByRole('heading', { name: 'Ничего не найдено', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
    await page.getByRole('button', { name: 'Договор поставки', exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'qualifiers.png') });

    // Cancelling a destructive transition keeps the current state.
    await page.getByRole('button', { name: 'Новый', exact: true }).click();
    await page.getByRole('dialog', { name: 'Сохранить изменения?' }).waitFor();
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.getByRole('heading', { name: 'Договоры', exact: true }).waitFor();

    // Download a real project and inspect its persisted data.
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const download = await downloaded;
    const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(saved.models[0].blocks.length, 4);
    assert.equal(saved.models[0].sheet.author, 'Иванов И. И.');
    assert.equal(saved.models[0].sheet.number, '17');
    assert.equal(saved.models[0].blocks[0].name, 'Принять обращение');
    assert.notEqual(saved.models[0].blocks[0].x, 100);
    assert.equal(saved.qualifiers.at(-1).elements[0].name, 'Договор поставки');

    // A new project starts empty, and opening the saved file restores all data.
    await page.getByRole('button', { name: 'Новый', exact: true }).click();
    await page.getByRole('dialog', { name: 'Новый проект', exact: true }).waitFor();
    await page.locator('#create-name').fill('Чистый проект');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByRole('heading', { name: 'От идеи — к понятной модели', exact: true }).waitFor();
    const chooserEvent = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    const chooser = await chooserEvent;
    await chooser.setFiles({
      name: 'round-trip.tamus.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(saved)),
    });
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    assert.equal(await page.locator('.function-block').count(), 4);
    assert.match(await page.locator('.paper-heading').innerText(), /Иванов И. И\./);
    await page.locator('.tree-item').filter({ hasText: 'Договоры' }).click();
    await page.getByRole('button', { name: 'Договор поставки', exact: true }).waitFor();

    // An invalid import must not replace the open project.
    const invalidChooserEvent = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    await (
      await invalidChooserEvent
    ).setFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"other"}'),
    });
    await page.getByRole('alert').waitFor();
    await page.getByRole('heading', { name: 'Договоры', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'passed',
        scenarios: [
          'sheet fields and grid',
          'diagram edit',
          'undo/redo',
          'drag',
          'blocks and flows',
          'qualifier CRUD',
          'search',
          'unsaved guard',
          'save/open round trip',
          'invalid import',
        ],
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
