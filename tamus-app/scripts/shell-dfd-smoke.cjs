const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
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
    const artifacts = path.join(__dirname, '..', '.artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    await page.goto(process.env.TAMUS_URL || 'http://127.0.0.1:1420');
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    assert.equal(await page.locator('.user-avatar').count(), 0);
    assert.equal(await page.locator('.window-controls button').count(), 3);
    assert.equal(
      await page.getByRole('button', { name: 'Свернуть окно', exact: true }).isDisabled(),
      true,
    );
    assert.equal((await page.locator('.brand').innerText()).trim(), 'Tamus');
    assert.equal(
      await page.getByRole('button', { name: 'Создать классификатор', exact: true }).count(),
      0,
    );
    const summaries = page.locator('.app-menu summary');
    await summaries.filter({ hasText: 'Файл' }).click();
    assert.equal(await page.locator('.app-menu details[open]').count(), 1);
    await summaries.filter({ hasText: 'Правка' }).click();
    assert.equal(await page.locator('.app-menu details[open]').count(), 1);
    assert.match(await page.locator('.app-menu details[open] summary').innerText(), /Правка/);
    await summaries.filter({ hasText: 'Вид' }).click();
    assert.equal(await page.locator('.app-menu details[open]').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.app-menu details[open]').count(), 0);
    await summaries.filter({ hasText: 'Файл' }).click();
    await page.locator('.header-spacer').click();
    assert.equal(await page.locator('.app-menu details[open]').count(), 0);
    const settings = page.getByRole('dialog', { name: 'Настройки', exact: true });
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Расширенный режим', exact: false }).check();
    await settings.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.getByRole('button', { name: 'Создать классификатор', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Создать классификатор', exact: true }).waitFor();
    await page
      .locator('.tree-item')
      .filter({ hasText: /^Документы/ })
      .click();
    await page.getByRole('heading', { name: 'Документы', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Расширенный режим', exact: false }).uncheck();
    await settings.getByRole('button', { name: 'Закрыть', exact: true }).click();
    assert.equal(
      await page.getByRole('button', { name: 'Создать классификатор', exact: true }).count(),
      0,
    );
    await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Создать модель', exact: true }).click();
    await page.locator('#create-name').fill('Учёт заказов DFD');
    await page.locator('#model-notation').selectOption('DFD');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByRole('heading', { name: 'Учёт заказов DFD', exact: true }).waitFor();
    assert.equal(await page.locator('.dfd-process').count(), 1);
    const select = () =>
      page.getByRole('button', { name: 'Выбрать и переместить', exact: true }).click();
    const editName = async (button, name) => {
      await select();
      await page.getByRole('button', { name: button, exact: true }).dblclick();
      await page.locator('#object-name').fill(name);
      await page
        .getByRole('dialog', { name: 'Свойства объекта DFD', exact: true })
        .getByRole('button', { name: 'Применить', exact: true })
        .click();
    };
    await page.getByRole('button', { name: 'Внешняя сущность', exact: true }).click();
    await page.locator('.diagram-drawing').click({ position: { x: 60, y: 100 } });
    await editName('Внешняя сущность E1: Внешняя сущность', 'Клиент');
    await page.getByRole('button', { name: 'Хранилище', exact: true }).click();
    await page.locator('.diagram-drawing').click({ position: { x: 590, y: 300 } });
    await editName('Хранилище D1: Хранилище данных', 'Заказы');
    await page.getByRole('button', { name: 'Процесс 0: Учёт заказов DFD', exact: true }).dblclick();
    const object = page.getByRole('dialog', { name: 'Свойства объекта DFD', exact: true });
    await object.getByRole('tab', { name: 'Оформление', exact: true }).click();
    await object.getByRole('button', { name: 'Зелёный', exact: true }).click();
    await object.getByRole('button', { name: 'Применить', exact: true }).click();
    assert.equal(
      await page.locator('.dfd-process').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(217, 237, 189)',
    );
    await page.getByRole('button', { name: 'Свойства диаграммы', exact: true }).click();
    await page
      .locator('.paper-color-controls')
      .getByRole('button', { name: 'Белый', exact: true })
      .click();
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    assert.equal(
      await page.locator('.diagram-paper').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(255, 255, 255)',
    );
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    assert.equal(
      await page.locator('.diagram-paper').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(255, 255, 232)',
    );
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    const draw = async (from, to, name) => {
      await page.getByRole('button', { name: 'Стрелка', exact: true }).click();
      assert.equal(await page.locator('.boundary-edge').count(), 0);
      await page.getByRole('button', { name: from, exact: true }).click();
      await page.getByRole('button', { name: to, exact: true }).click();
      await page.locator('#property-name').fill(name);
      await page.getByRole('button', { name: 'Применить', exact: true }).click();
    };
    await draw('Справа: Клиент', 'Сверху: Учёт заказов DFD', 'Заказ клиента');
    await draw('Слева: Учёт заказов DFD', 'Слева: Заказы', 'Запись заказа');
    await draw('Снизу: Заказы', 'Справа: Учёт заказов DFD', 'Данные заказа');
    assert.equal(await page.locator('.flow-label').count(), 3);
    await select();
    await page.screenshot({ path: path.join(artifacts, 'dfd-editor.png') });
    await page
      .getByRole('button', { name: 'Процесс 0: Учёт заказов DFD', exact: true })
      .click({ modifiers: ['Control'] });
    await page.locator('#decomposition-count').fill('2');
    await page
      .getByRole('dialog', { name: 'Создание декомпозиции', exact: true })
      .getByRole('button', { name: 'Создать', exact: true })
      .click();
    assert.equal(await page.locator('.dfd-process').count(), 2);
    assert.match(await page.locator('.paper-footer').innerText(), /УЗЕЛ:.*0/s);
    await page.getByRole('button', { name: 'Граница I1: Заказ клиента', exact: true }).click();
    await page.getByRole('button', { name: 'Сверху: Функция 1', exact: true }).click();
    await page.locator('.flow-label').filter({ hasText: 'Заказ клиента' }).waitFor();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const saved = JSON.parse(fs.readFileSync(await (await downloaded).path(), 'utf8'));
    assert.equal(saved.models[1].notation, 'DFD');
    assert.equal(saved.models[1].backgroundColor, '#ffffff');
    assert.equal(saved.models[1].blocks.filter((b) => b.kind === 'external').length, 1);
    assert.equal(saved.models[1].blocks.filter((b) => b.kind === 'dataStore').length, 1);
    assert.equal(saved.models[1].blocks[0].fillColor, '#d9edbd');
    assert.equal(saved.models[2].notation, 'DFD');
    assert.ok(saved.models[2].flows[0].parentFlowId);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'dfd.tamus.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(saved)),
    });
    await page.locator('.tree-item').filter({ hasText: 'Учёт заказов DFD' }).first().click();
    await page.getByRole('heading', { name: 'Учёт заказов DFD', exact: true }).waitFor();
    assert.equal(await page.locator('.dfd-process').count(), 1);
    assert.equal(await page.locator('.dfd-external').count(), 1);
    assert.equal(await page.locator('.dfd-store').count(), 1);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'passed',
        scenarios: [
          'header controls and logo',
          'exclusive menus and dismissal',
          'advanced mode persistence',
          'DFD processes/external entities/data stores',
          'bidirectional data flows on all sides',
          'DFD decomposition interfaces',
          'block colors and sheet colors',
          'color undo/redo',
          'DFD save/open',
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
