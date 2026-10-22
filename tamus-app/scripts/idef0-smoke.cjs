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
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    const select = () =>
      page.getByRole('button', { name: 'Выбрать и переместить', exact: true }).click();
    const openChild = async (name) => {
      await page.getByRole('button', { name, exact: true }).click({ modifiers: ['Control'] });
      const dialog = page.getByRole('dialog', { name: 'Создание декомпозиции', exact: true });
      if (await dialog.isVisible()) {
        await page.locator('#decomposition-count').fill('3');
        await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
      }
    };
    const draw = async (source, target, name) => {
      await page.getByRole('button', { name: 'Стрелка', exact: true }).click();
      await page.getByRole('button', { name: source, exact: true }).click();
      assert.equal(await page.locator('.flow-preview').count(), 1);
      await page.getByRole('button', { name: target, exact: true }).click();
      await page.locator('#property-name').fill(name);
      await page.getByRole('button', { name: 'Применить', exact: true }).click();
      await page.locator('.flow-label').filter({ hasText: name }).waitFor();
    };
    await draw('Граница I', 'Вход: Принять заказ', 'Заявка клиента');
    await draw('Граница C', 'Управление: Принять заказ', 'Правила обработки');
    await draw('Граница M', 'Механизм: Принять заказ', 'Менеджер');
    await draw('Выход: Принять заказ', 'Управление: Проверить данные', 'Условия заказа');
    await draw('Выход: Подтвердить заказ', 'Граница O', 'Подтверждение');
    assert.equal(await page.locator('.flow-label').count(), 7);
    await page.getByRole('button', { name: 'Стрелка', exact: true }).click();
    await page.getByRole('button', { name: 'Выход: Принять заказ', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.flow-preview').count(), 0);
    assert.equal(await page.locator('.flow-label').count(), 7);
    await page.screenshot({ path: path.join(artifacts, 'idef0-parent.png') });
    await openChild('Блок 1: Принять заказ');
    await page.getByRole('heading', { name: 'Принять заказ', exact: true }).waitFor();
    assert.match(await page.locator('.paper-footer').innerText(), /A1/);
    assert.equal(await page.locator('.function-block').count(), 3);
    await page.getByRole('button', { name: 'Граница I1: Заявка клиента', exact: true }).click();
    await page.getByRole('button', { name: 'Вход: Функция 1', exact: true }).click();
    await page.locator('.flow-label').filter({ hasText: 'Заявка клиента' }).waitFor();
    assert.equal(await page.locator('#property-name').getAttribute('readonly'), '');
    await select();
    await openChild('Блок 1: Функция 1');
    await page.getByRole('heading', { name: 'Функция 1', exact: true }).waitFor();
    assert.match(await page.locator('.paper-footer').innerText(), /A11/);
    await page.getByRole('button', { name: 'Граница I1: Заявка клиента', exact: true }).click();
    await page.getByRole('button', { name: 'Вход: Функция 1', exact: true }).click();
    await page.locator('.flow-label').filter({ hasText: 'Заявка клиента' }).waitFor();
    await page.getByRole('button', { name: 'К родительской диаграмме', exact: true }).click();
    await page.getByRole('heading', { name: 'Принять заказ', exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'idef0-decomposition.png') });
    await page.getByRole('button', { name: 'К родительской диаграмме', exact: true }).click();
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    await page.locator('.flow-label').filter({ hasText: 'Заявка клиента' }).click();
    await page.locator('#property-name').fill('Входящая заявка');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await openChild('Блок 1: Принять заказ');
    assert.match(await page.locator('.flow-label').innerText(), /Входящая заявка/);
    await page.getByRole('button', { name: 'К родительской диаграмме', exact: true }).click();
    await page.locator('.flow-label').filter({ hasText: 'Входящая заявка' }).click();
    await page.keyboard.press('Delete');
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await openChild('Блок 1: Принять заказ');
    assert.equal(await page.locator('.flow-label').count(), 0);
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await page.locator('.flow-label').filter({ hasText: 'Входящая заявка' }).waitFor();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const saved = JSON.parse(fs.readFileSync(await (await downloaded).path(), 'utf8'));
    assert.equal(saved.models.length, 3);
    assert.equal(saved.models[1].parentBlockId, 'receive');
    assert.equal(saved.models[1].flows[0].sourceId, null);
    assert.equal(saved.models[2].flows[0].name, 'Входящая заявка');
    assert.equal(
      saved.models[0].flows.find((f) => f.name === 'Правила обработки').targetSide,
      'top',
    );
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'idef0.tamus.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(saved)),
    });
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    await openChild('Блок 1: Принять заказ');
    await page.locator('.flow-label').filter({ hasText: 'Входящая заявка' }).waitFor();
    await page.getByRole('button', { name: 'Создать модель', exact: true }).click();
    await page.locator('#create-name').fill('Новая IDEF0 модель');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByRole('heading', { name: 'Новая IDEF0 модель', exact: true }).waitFor();
    assert.equal(await page.locator('.function-block').count(), 1);
    assert.match(await page.locator('.paper-footer').innerText(), /A-0/);
    await openChild('Блок 1: Новая IDEF0 модель');
    assert.match(await page.locator('.paper-footer').innerText(), /A0/);
    assert.equal(await page.locator('.function-block').count(), 3);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'passed',
        scenarios: [
          'mouse ICOM drawing',
          'boundary input/output',
          'cancel drawing',
          'decomposition and nested levels',
          'parent interface inheritance',
          'rename and deletion propagation',
          'cross-level undo',
          'save/open hierarchy',
          'A-0 context',
        ],
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
