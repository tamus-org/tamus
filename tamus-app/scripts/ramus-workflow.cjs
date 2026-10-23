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
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const artifacts = path.join(__dirname, '..', '.artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    await page.addInitScript(() =>
      localStorage.setItem('tamus:ui:settings:v1', JSON.stringify({ advanced: true })),
    );
    await page.goto(process.env.TAMUS_URL || 'http://127.0.0.1:1420');
    await openExample(page);
    const editor = page.locator('.diagram-editor');
    await editor.focus();
    await page.keyboard.press('x');
    assert.equal(await page.locator('.function-block').count(), 3);
    await page.locator('.diagram-drawing').click({ position: { x: 80, y: 230 } });
    assert.equal(await page.locator('.function-block').count(), 4);
    await editor.focus();
    await page.keyboard.press('z');
    const created = page.getByRole('button', { name: 'Блок 4: Новая функция', exact: true });
    await created.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Свойства…', exact: true }).click();
    const blockDialog = page.getByRole('dialog', { name: 'Свойства блока', exact: true });
    await blockDialog.waitFor();
    await page.locator('#object-name').fill('Подготовить документы');
    await page.locator('#object-width').fill('280');
    await page.locator('#object-height').fill('140');
    await blockDialog.getByRole('button', { name: 'Применить', exact: true }).click();
    await page
      .getByRole('button', { name: 'Блок 4: Подготовить документы', exact: true })
      .waitFor();
    const node = page.locator('.function-node').filter({
      has: page.getByRole('button', { name: 'Блок 4: Подготовить документы', exact: true }),
    });
    assert.equal(await node.evaluate((el) => el.style.width), '280px');
    const resize = page.getByRole('button', {
      name: 'Изменить размер: Подготовить документы',
      exact: true,
    });
    const rect = await resize.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 35, rect.y + rect.height / 2 + 25, {
      steps: 5,
    });
    await page.mouse.up();
    assert.ok(parseFloat(await node.evaluate((el) => el.style.width)) > 280);
    await page.getByRole('button', { name: 'Блок 1: Принять заказ', exact: true }).dblclick();
    await blockDialog.waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'Блок 1: Принять заказ', exact: true })
      .click({ modifiers: ['Control'] });
    const decomp = page.getByRole('dialog', { name: 'Создание декомпозиции', exact: true });
    await decomp.waitFor();
    await page.locator('#decomposition-count').fill('2');
    await page.locator('#decomposition-layout').selectOption('horizontal');
    assert.equal(await page.locator('.template-preview rect').count(), 2);
    await decomp.getByRole('button', { name: 'Отмена', exact: true }).click();
    assert.equal(await page.locator('.function-block').count(), 4);
    await page
      .getByRole('button', { name: 'Блок 1: Принять заказ', exact: true })
      .click({ modifiers: ['Control'] });
    await page.locator('#decomposition-count').fill('2');
    await page.locator('#decomposition-layout').selectOption('horizontal');
    await decomp.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByRole('heading', { name: 'Принять заказ', exact: true }).waitFor();
    assert.equal(await page.locator('.function-block').count(), 2);
    assert.equal(await page.locator('.tab-main').count(), 1);
    await page.locator('.tree-item').filter({ hasText: 'Функция 2' }).waitFor();
    await page
      .locator('.diagram-drawing')
      .click({ position: { x: 20, y: 20 }, modifiers: ['Control'] });
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    await page
      .locator('.flow-label')
      .filter({ hasText: /^Заявка$/ })
      .dblclick();
    const flowDialog = page.getByRole('dialog', { name: 'Свойства стрелки', exact: true });
    await flowDialog.waitFor();
    await page.locator('#stream-name').fill('');
    await flowDialog.getByRole('button', { name: 'Добавить…', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Выбор объектов потока', exact: true });
    await picker.waitFor();
    await picker.getByRole('checkbox', { name: 'Заявка клиента', exact: true }).check();
    await picker.getByRole('button', { name: 'Персонал', exact: true }).click();
    await picker.getByRole('checkbox', { name: 'Менеджер', exact: true }).check();
    await picker.getByRole('button', { name: 'Присоединить', exact: true }).click();
    assert.match(await page.locator('.stream-preview').innerText(), /Заявка клиента; Менеджер/);
    await page.screenshot({ path: path.join(artifacts, 'ramus-flow-properties.png') });
    await flowDialog.getByRole('button', { name: 'Применить', exact: true }).click();
    await page.locator('.flow-label').filter({ hasText: 'Заявка клиента; Менеджер' }).waitFor();
    await page
      .locator('.tree-item')
      .filter({ hasText: /^Документы/ })
      .click();
    await page.getByRole('button', { name: 'Заявка клиента', exact: true }).click();
    await page.locator('#property-name').fill('Заявка покупателя');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await page.locator('.tree-item').filter({ hasText: 'Обработка заказов' }).click();
    await page.locator('.flow-label').filter({ hasText: 'Заявка покупателя; Менеджер' }).waitFor();
    await page.locator('.flow-label').filter({ hasText: 'Заявка покупателя; Менеджер' }).dblclick();
    await page.locator('#segment-caption').fill('Пакет документов');
    await flowDialog.getByRole('button', { name: 'Применить', exact: true }).click();
    await page.locator('.flow-label').filter({ hasText: 'Пакет документов' }).waitFor();
    await page.getByRole('button', { name: 'Стрелка', exact: true }).click();
    await page
      .getByRole('button', { name: 'Выход: Принять заказ', exact: true })
      .click({ position: { x: 6, y: 20 } });
    await page
      .getByRole('button', { name: 'Вход: Проверить данные', exact: true })
      .click({ position: { x: 6, y: 80 } });
    await page.locator('#property-name').fill('Дополнительный поток');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await editor.focus();
    await page.keyboard.press('z');
    await page
      .getByRole('button', { name: 'Блок 1: Принять заказ', exact: true })
      .click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: 'Центровать присоединённые стрелки', exact: true })
      .click();
    await editor.focus();
    await page.keyboard.press('Alt+c');
    await page.keyboard.press('n');
    assert.equal(
      await page
        .getByRole('button', { name: 'Привязка к сетке', exact: true })
        .getAttribute('aria-pressed'),
      'false',
    );
    await page.keyboard.press('n');
    await page.keyboard.press('x');
    await page.locator('.diagram-drawing').click({ button: 'right', position: { x: 20, y: 20 } });
    assert.equal(
      await page
        .getByRole('button', { name: 'Выбрать и переместить', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    await page.screenshot({ path: path.join(artifacts, 'ramus-workflow.png') });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const saved = JSON.parse(fs.readFileSync(await (await downloaded).path(), 'utf8'));
    assert.equal(saved.models.length, 2);
    assert.equal(saved.models[1].blocks.length, 2);
    assert.equal(saved.models[0].flows[0].name, '');
    assert.equal(saved.models[0].flows[0].caption, 'Пакет документов');
    assert.deepEqual(saved.models[0].flows[0].objectIds, ['request', 'manager']);
    assert.ok(saved.models[0].blocks[3].width > 280);
    const added = saved.models[0].flows.find((f) => f.name === 'Дополнительный поток');
    assert.equal(added.sourcePosition, 0.5);
    assert.equal(added.targetPosition, 0.5);
    const chosen = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    await (
      await chosen
    ).setFiles({
      name: 'workflow.tamus.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(saved)),
    });
    await page.locator('.flow-label').filter({ hasText: 'Пакет документов' }).waitFor();
    assert.equal(await page.locator('.function-block').count(), 4);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'passed',
        scenarios: [
          'Z/X/C/N tools',
          'click placement',
          'resize drag',
          'double click properties',
          'context menus',
          'decomposition template and cancel',
          'in-place navigation and tree functions',
          'flow classifier references',
          'live object rename and segment caption',
          'port positioning and centering',
          'right click pointer reset',
          'save/open',
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
