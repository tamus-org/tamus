const path = require('node:path');

async function openExample(page) {
  await page.locator('.welcome-shell[aria-busy="false"]').waitFor();
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(__dirname, '..', 'fixtures', 'example.tamus.json'));
  await page.getByRole('heading', { name: 'Обработка заказов', exact: true }).waitFor();
}

module.exports = { openExample };
