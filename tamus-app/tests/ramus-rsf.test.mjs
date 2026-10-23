import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function load(path) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpile(source, {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const rsf = await load('../src/lib/legacy/ramus-rsf.ts');
const domain = await load('../src/lib/domain/project.ts');
const geometry = await load('../src/lib/features/idef0-geometry.ts');
const fixture = new Uint8Array(
  fs.readFileSync(new URL('../fixtures/ramus-as-is.rsf', import.meta.url)),
);
const decoder = new TextDecoder();

function shape(project) {
  return project.models.map((model) => {
    const blockName = new Map(model.blocks.map((block) => [block.id, block.name]));
    return {
      name: model.name,
      notation: model.notation,
      parent: Boolean(model.parentBlockId),
      page: `${model.pageWidth ?? ''}x${model.pageHeight ?? ''}`,
      blocks: model.blocks
        .map(
          (block) =>
            `${block.name}:${block.kind ?? 'process'}:${block.fontName ?? ''}:${block.fontSize ?? ''}:${block.fontStyle ?? 'normal'}`,
        )
        .sort(),
      flows: model.flows
        .map(
          (flow) =>
            `${flow.name}|${blockName.get(flow.sourceId) ?? null}|${blockName.get(flow.targetId) ?? null}|${flow.sourceSide}|${flow.targetSide}`,
        )
        .sort(),
    };
  });
}

test('Ramus RSF is read from the compressed archive with models, blocks and arrows', async () => {
  const { project, report } = await rsf.importRamusRsf(fixture);
  domain.validateProject(project);

  assert.equal(report.models, 5);
  assert.equal(report.blocks, 14);
  assert.equal(report.flows, 72);
  assert.equal(report.qualifiers, 0);
  assert.deepEqual(report.unknownTables, []);
  assert.equal(project.models.filter((model) => !model.parentBlockId).length, 1);
  assert.equal(project.models[0].name, 'Магазин аудиотехники');
  assert.equal(project.models[0].blocks[0].name, 'Продажа  аудиотехники');
  assert.equal(project.models[0].blocks[0].fontName, 'Dialog');
  assert.equal(project.models[0].blocks[0].fontSize, 10);
  assert.equal(project.models[0].pageWidth, 816);
  assert.equal(project.models[0].pageHeight, 612);
  assert.ok(project.models[1].flows.some((flow) => (flow.waypoints?.length ?? 0) > 0));
  const allFlows = project.models.flatMap((model) => model.flows);
  assert.ok(allFlows.some((flow) => flow.hideLabel));
  const visibleLabels = new Set();
  for (const flow of allFlows) {
    if (flow.hideLabel || flow.labelX === undefined || flow.labelY === undefined) continue;
    const key = `${flow.name}|${Math.round(flow.labelX)}|${Math.round(flow.labelY)}`;
    assert.equal(visibleLabels.has(key), false, key);
    visibleLabels.add(key);
  }
  assert.equal(project.models[0].flows.length, 12);

  const ids = new Set();
  for (const model of project.models) {
    for (const block of model.blocks) {
      assert.equal(ids.has(block.id), false);
      ids.add(block.id);
    }
    for (const flow of model.flows) {
      assert.equal(ids.has(flow.id), false);
      ids.add(flow.id);
    }
  }
});

test('ICOM boundary sides and attachment positions are preserved', async () => {
  const { project } = await rsf.importRamusRsf(fixture);
  const root = project.models[0];
  const inputs = root.flows.filter((flow) => flow.sourceId === null);
  const sides = new Set(inputs.map((flow) => flow.sourceSide));
  assert.deepEqual([...sides].sort(), ['bottom', 'left', 'top']);
  assert.equal(root.flows.find((flow) => flow.name === 'Продавец')?.sourceSide, 'bottom');
  assert.equal(root.flows.find((flow) => flow.name === 'План продаж')?.sourceSide, 'top');
  assert.equal(root.flows.find((flow) => flow.name === 'Спрос клиентов')?.sourceSide, 'left');
  assert.ok(
    root.flows
      .filter((flow) => flow.targetId === null)
      .every((flow) => flow.targetSide === 'right'),
  );

  const boundaries = inputs.map(
    (flow) => `${flow.sourceSide}:${(flow.sourcePosition ?? 0).toFixed(2)}`,
  );
  assert.equal(new Set(boundaries).size, boundaries.length);
});

test('exported RSF is a valid archive that preserves the model semantics', async () => {
  const first = await rsf.importRamusRsf(fixture);
  const exported = await rsf.exportRamusRsf(first.project);
  assert.equal(exported.models, first.report.models);
  assert.equal(exported.blocks, first.report.blocks);
  assert.equal(exported.flows, first.report.flows);
  assert.ok(exported.data.length > 1000);

  const files = await rsf.readZip(exported.data);
  for (const name of [
    'data/attributes.xml',
    'data/qualifiers.xml',
    'data/qualifiers_attributes.xml',
    'data/elements.xml',
    'data/Core/attribute_hierarchicals.xml',
    'data/Core/attribute_texts.xml',
    'data/IDEF0/attribute_rectangles.xml',
    'data/IDEF0/attribute_sector_borders.xml',
    'data/IDEF0/attribute_sector_points.xml',
  ]) {
    assert.ok(files.has(name), name);
  }
  const texts = rsf.parseTable(
    'Core/attribute_texts',
    decoder.decode(files.get('data/Core/attribute_texts.xml')),
  );
  assert.equal(texts.fields.find((field) => field.name === 'VALUE')?.type, 'CLOB');
  const metadata = decoder.decode(files.get('data/application_metadata.xml'));
  assert.match(metadata, /ApplicationName/);
  assert.match(metadata, /PluginCount/);

  const second = await rsf.importRamusRsf(exported.data);
  domain.validateProject(second.project);
  assert.deepEqual(shape(second.project), shape(first.project));
  assert.equal(second.report.blocks, first.report.blocks);
  assert.equal(second.report.flows, first.report.flows);
});

test('classifiers and attached flow objects survive a Ramus round trip', async () => {
  const project = domain.createExample();
  project.models[0].flows[0].objectIds = ['request', 'manager'];
  domain.validateProject(project);

  const exported = await rsf.exportRamusRsf(project);
  const restored = await rsf.importRamusRsf(exported.data);
  domain.validateProject(restored.project);

  assert.equal(restored.project.qualifiers.length, 2);
  assert.deepEqual(
    restored.project.qualifiers.map((qualifier) => qualifier.name),
    ['Документы', 'Персонал'],
  );
  assert.deepEqual(
    restored.project.qualifiers.map((qualifier) =>
      qualifier.elements.map((element) => element.name),
    ),
    [
      ['Заявка клиента', 'Заказ', 'Подтверждение заказа'],
      ['Менеджер', 'Специалист'],
    ],
  );
  const importedObjects = restored.project.models[0].flows[0].objectIds ?? [];
  assert.equal(importedObjects.length, 2);
  for (const id of importedObjects) {
    assert.ok(
      restored.project.qualifiers.some((qualifier) =>
        qualifier.elements.some((item) => item.id === id),
      ),
    );
  }
});

test('manual arrow waypoints and labels survive a round trip', async () => {
  const project = domain.createExample();
  const flow = project.models[0].flows[0];
  flow.waypoints = [
    { x: 450, y: 320 },
    { x: 500, y: 260 },
  ];
  flow.labelX = 420;
  flow.labelY = 280;
  domain.validateProject(project);

  const restored = await rsf.importRamusRsf((await rsf.exportRamusRsf(project)).data);
  domain.validateProject(restored.project);
  const restoredFlow = restored.project.models[0].flows[0];
  assert.equal(restoredFlow.name, flow.name);
  for (const point of flow.waypoints)
    assert.ok(
      restoredFlow.waypoints?.some(
        (restoredPoint) => restoredPoint.x === point.x && restoredPoint.y === point.y,
      ),
      `waypoint ${point.x},${point.y}`,
    );
  assert.equal(restoredFlow.labelX, flow.labelX);
  assert.equal(restoredFlow.labelY, flow.labelY);
});

test('every arrow segment is horizontal or vertical', async () => {
  const { project } = await rsf.importRamusRsf(fixture);
  for (const model of project.models) {
    const width = (model.pageWidth ?? 1050) - 30;
    const height = (model.pageHeight ?? 742) - 182;
    for (const flow of model.flows) {
      const route = geometry.flowRoute(flow, model.blocks, width, height);
      for (let index = 1; index < route.points.length; index++) {
        const previous = route.points[index - 1];
        const point = route.points[index];
        assert.ok(
          Math.abs(previous.x - point.x) < 0.01 || Math.abs(previous.y - point.y) < 0.01,
          `${model.name} / ${flow.name}: ${previous.x},${previous.y} -> ${point.x},${point.y}`,
        );
      }
    }
  }
});

test('DFD notation, external entities and data stores survive a round trip', async () => {
  const project = domain.createProjectWithDiagram('DFD тест', 'DFD');
  project.qualifiers.push({
    id: 'docs',
    name: 'Документы',
    description: '',
    elements: [{ id: 'doc', name: 'Заявка', description: '' }],
  });
  domain.validateProject(project);

  const restored = await rsf.importRamusRsf((await rsf.exportRamusRsf(project)).data);
  domain.validateProject(restored.project);
  assert.equal(restored.project.models[0].notation, 'DFD');
  assert.equal(restored.project.models[0].sheet?.node, 'Контекст');
  assert.equal(restored.project.qualifiers[0].name, 'Документы');
});

test('non-RSF input is rejected with a clear message', async () => {
  await assert.rejects(
    () => rsf.importRamusRsf(new TextEncoder().encode('not a zip file')),
    /ZIP-архивом Ramus/,
  );
});
