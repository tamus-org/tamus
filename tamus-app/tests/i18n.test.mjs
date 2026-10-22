import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { parse } from 'svelte/compiler';
const source = fs.readFileSync(new URL('../src/lib/i18n/catalog.ts', import.meta.url), 'utf8');
const code = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const { translate, formatCount, english } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

test('English UI messages are complete and preserve all interpolation parameters', () => {
  for (const [key, value] of Object.entries(english)) {
    assert.ok(value.trim(), key);
    assert.equal(/[А-Яа-яЁё]/.test(value), false, key);
    const tokens = (s) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
    assert.deepEqual(tokens(key), tokens(value), key);
  }
  for (const file of [
    'src/routes/+page.svelte',
    'src/lib/features/Diagram.svelte',
    'src/lib/components/Modal.svelte',
    'src/lib/components/ObjectProperties.svelte',
    'src/lib/components/WindowControls.svelte',
  ]) {
    const ast = parse(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
      modern: true,
    });
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (
        node.type === 'CallExpression' &&
        node.callee.name === '$t' &&
        node.arguments[0]?.type === 'Literal'
      ) {
        const key = node.arguments[0].value;
        assert.ok(Object.hasOwn(english, key), `${file}: missing English message ${key}`);
      }
      if (node.type === 'Text' && /[А-Яа-яЁё]/.test(node.data))
        assert.equal(node.data.trim(), 'Русский', `${file}: untranslated UI text`);
      for (const [key, value] of Object.entries(node))
        if (!['loc', 'metadata'].includes(key)) visit(value);
    }
    visit(ast);
  }
});

test('translation preserves user values and unknown text, including replacement metacharacters', () => {
  const name = 'Название $& {name} <b> & 🚀';
  assert.equal(
    translate('en', 'В проекте «{name}» есть несохранённые изменения.', { name }),
    `Project “${name}” has unsaved changes.`,
  );
  assert.equal(
    translate('ru', 'В проекте «{name}» есть несохранённые изменения.', { name }),
    `В проекте «${name}» есть несохранённые изменения.`,
  );
  assert.equal(translate('en', 'custom filename $&.json'), 'custom filename $&.json');
  assert.equal(
    translate('en', 'Не удалось прочитать файл: OS error 13'),
    'Could not read the file: OS error 13',
  );
  assert.equal(
    translate('en', 'Цвет должен иметь формат #RRGGBB.'),
    'Colors must use the #RRGGBB format.',
  );
});

test('counts follow English and Russian plural rules', () => {
  assert.equal(formatCount('en', 'model', 1), '1 model');
  assert.equal(formatCount('en', 'model', 0), '0 models');
  assert.equal(formatCount('en', 'connection', 2), '2 connections');
  for (const [amount, text] of [
    [1, '1 модель'],
    [2, '2 модели'],
    [5, '5 моделей'],
    [11, '11 моделей'],
    [21, '21 модель'],
  ])
    assert.equal(formatCount('ru', 'model', amount), text);
});
