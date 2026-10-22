import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/domain/project.ts', import.meta.url), 'utf8');
const code = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const {
  createExample,
  reduceProject,
  validateProject,
  diagramSheet,
  childDiagram,
  diagramNode,
  boundaryPorts,
  flowLabel,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('legacy projects keep working and sheet edits survive JSON round trips', () => {
  const original = createExample();
  validateProject(original);
  assert.equal(original.models[0].sheet, undefined);
  const sheet = { ...diagramSheet(), author: 'Иванов И. И.', number: '17' };
  const updated = reduceProject(original, {
    kind: 'updateModel',
    id: 'orders',
    name: original.models[0].name,
    description: original.models[0].description,
    sheet,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(updated)).models[0].sheet, sheet);
  assert.equal(original.models[0].sheet, undefined);
  const renamed = reduceProject(updated, {
    kind: 'updateModel',
    id: 'orders',
    name: 'Новое название',
    description: '',
  });
  assert.deepEqual(renamed.models[0].sheet, sheet);
});

test('invalid or unknown sheet data cannot be silently accepted', () => {
  for (const sheet of [
    null,
    {},
    { ...diagramSheet(), author: 'x'.repeat(257) },
    { ...diagramSheet(), extra: true },
  ]) {
    const project = createExample();
    project.models[0].sheet = sheet;
    assert.throws(() => validateProject(project));
  }
});

test('the browser fixture and Rust fixture are identical', () => {
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/example.tamus.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(createExample(), fixture);
});
test('invalid edits do not mutate the current project', () => {
  const project = createExample();
  assert.throws(() => reduceProject(project, { kind: 'updateProject', name: '', description: '' }));
  assert.equal(project.name, 'Деятельность предприятия');
});
test('deleting a block removes its incoming and outgoing connections', () => {
  const project = reduceProject(createExample(), {
    kind: 'deleteBlock',
    modelId: 'orders',
    id: 'verify',
  });
  assert.equal(project.models[0].blocks.length, 2);
  assert.equal(project.models[0].flows.length, 0);
});
test('flows cannot point to a missing block or to themselves', () => {
  for (const targetId of ['missing', 'receive']) {
    assert.throws(() =>
      reduceProject(createExample(), {
        kind: 'addFlow',
        modelId: 'orders',
        flow: { id: 'new-flow', name: 'Поток', sourceId: 'receive', targetId },
      }),
    );
  }
});
test('duplicate identities and invalid coordinates are rejected', () => {
  const project = createExample();
  project.models[0].blocks[0].id = project.id;
  assert.throws(() => validateProject(project));
  const project2 = createExample();
  project2.models[0].blocks[0].x = NaN;
  assert.throws(() => validateProject(project2));
});
test('unknown formats and future versions cannot masquerade as current projects', () => {
  assert.throws(() => validateProject({ ...createExample(), schemaVersion: 2 }));
  assert.throws(() => validateProject({ ...createExample(), format: 'rsf' }));
});
test('deleting an absent object is an error rather than a successful operation', () => {
  assert.throws(() =>
    reduceProject(createExample(), {
      kind: 'deleteElement',
      qualifierId: 'documents',
      id: 'missing',
    }),
  );
});

test('unknown fields are rejected before editing can silently discard them', () => {
  assert.throws(() => validateProject({ ...createExample(), futureData: true }));
  const project = createExample();
  project.models[0].blocks[0].customStyle = 'unrecognized';
  assert.throws(() => validateProject(project));
});

const decompose = (project, modelId = 'orders', blockId = 'receive', childId = 'child') =>
  reduceProject(project, { kind: 'decomposeBlock', modelId, blockId, childId });
test('decomposition is owned by a block, nested, unique and protected from orphaning', () => {
  const original = createExample(),
    project = decompose(original);
  const child = childDiagram(project, 'receive');
  assert.equal(child.id, 'child');
  assert.equal(child.blocks.length, 3);
  assert.equal(diagramNode(project, child), 'A1');
  assert.equal(original.models.length, 1);
  assert.throws(() => decompose(project));
  assert.throws(() =>
    reduceProject(project, { kind: 'deleteBlock', modelId: 'orders', id: 'receive' }),
  );
  assert.throws(() => reduceProject(project, { kind: 'deleteModel', id: 'orders' }));
  const nested = decompose(project, 'child', 'child-1', 'grandchild');
  assert.equal(diagramNode(nested, nested.models[2]), 'A11');
  const cyclic = structuredClone(project);
  cyclic.models[0].parentBlockId = 'child-1';
  assert.throws(() => validateProject(cyclic), /Цикл/);
  const orphan = structuredClone(project);
  orphan.models[1].parentBlockId = 'missing';
  assert.throws(() => validateProject(orphan));
});
test('ICOM connections validate all four sides and boundary directions', () => {
  for (const side of ['left', 'top', 'bottom']) {
    const project = reduceProject(createExample(), {
      kind: 'addFlow',
      modelId: 'orders',
      flow: {
        id: 'boundary',
        name: 'Ресурс',
        sourceId: null,
        targetId: 'receive',
        sourceSide: side,
        targetSide: side,
      },
    });
    validateProject(project);
  }
  validateProject(
    reduceProject(createExample(), {
      kind: 'addFlow',
      modelId: 'orders',
      flow: {
        id: 'boundary',
        name: 'Результат',
        sourceId: 'approve',
        targetId: null,
        targetSide: 'right',
      },
    }),
  );
  for (const flow of [
    { sourceId: 'receive', targetId: 'verify', sourceSide: 'left' },
    { sourceId: 'receive', targetId: 'verify', targetSide: 'right' },
    { sourceId: null, targetId: 'verify', sourceSide: 'right' },
    { sourceId: 'receive', targetId: null, targetSide: 'left' },
    { sourceId: null, targetId: null },
    { sourceId: 'receive', targetId: 'verify', targetPosition: 2 },
  ])
    assert.throws(() =>
      reduceProject(createExample(), {
        kind: 'addFlow',
        modelId: 'orders',
        flow: { id: 'invalid', name: 'Стрелка', ...flow },
      }),
    );
});
test('inherited interfaces follow parent rename, side change and deletion atomically', () => {
  let project = decompose(createExample(), 'orders', 'verify', 'child');
  const ports = boundaryPorts(project, project.models[1]);
  assert.deepEqual(
    ports.map((p) => p.code),
    ['I1', 'O1'],
  );
  project = reduceProject(project, {
    kind: 'addFlow',
    modelId: 'child',
    flow: {
      id: 'inherited',
      name: 'Заявка',
      sourceId: null,
      targetId: 'child-1',
      sourceSide: 'left',
      parentFlowId: 'request-flow',
    },
  });
  project = decompose(project, 'child', 'child-1', 'grandchild');
  project = reduceProject(project, {
    kind: 'addFlow',
    modelId: 'grandchild',
    flow: {
      id: 'nested-inherited',
      name: 'Заявка',
      sourceId: null,
      targetId: 'grandchild-1',
      sourceSide: 'left',
      parentFlowId: 'inherited',
    },
  });
  project = reduceProject(project, {
    kind: 'updateFlow',
    modelId: 'orders',
    flow: { ...project.models[0].flows[0], name: 'Условия заказа', targetSide: 'top' },
  });
  assert.equal(project.models[1].flows[0].name, 'Условия заказа');
  assert.equal(project.models[1].flows[0].sourceSide, 'top');
  assert.equal(project.models[2].flows[0].name, 'Условия заказа');
  project = reduceProject(project, { kind: 'deleteFlow', modelId: 'orders', id: 'request-flow' });
  assert.equal(project.models[1].flows.length, 0);
  assert.equal(project.models[2].flows.length, 0);
  validateProject(JSON.parse(JSON.stringify(project)));
});

test('shared IDEF0 scenario stays identical across browser and Rust', () => {
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/idef0-scenario.json', import.meta.url), 'utf8'),
  );
  let project = createExample();
  for (const command of fixture.commands) project = reduceProject(project, command);
  assert.deepEqual(project, fixture.expected);
});

test('an invalid inherited interface is rejected rather than silently removing the new arrow', () => {
  const project = decompose(createExample());
  assert.throws(() =>
    reduceProject(project, {
      kind: 'addFlow',
      modelId: 'child',
      flow: {
        id: 'invalid-link',
        name: 'Поток',
        sourceId: null,
        targetId: 'child-1',
        parentFlowId: 'missing',
      },
    }),
  );
});

const geometryCode = ts.transpile(
  fs.readFileSync(new URL('../src/lib/features/idef0-geometry.ts', import.meta.url), 'utf8'),
  { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
);
const { arrowRoute } = await import(
  `data:text/javascript;base64,${Buffer.from(geometryCode).toString('base64')}`
);
test('orthogonal routing preserves port directions and avoids an intervening function', () => {
  const blocks = [
    { id: 's', x: 100, y: 100 },
    { id: 'obstacle', x: 400, y: 60 },
    { id: 't', x: 700, y: 100 },
  ];
  const route = arrowRoute(
    { id: 's', side: 'right', position: 0.5 },
    { id: 't', side: 'left', position: 0.5 },
    blocks,
    1050,
    560,
  );
  const values = route.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const points = [];
  for (let i = 0; i < values.length; i += 2) points.push({ x: values[i], y: values[i + 1] });
  assert.deepEqual(points[0], { x: 310, y: 155 });
  assert.deepEqual(points.at(-1), { x: 700, y: 155 });
  assert.ok(points[1].x > 310);
  assert.ok(points.at(-2).x < 700);
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1],
      q = points[i];
    assert.ok(p.x === q.x || p.y === q.y);
    const crosses =
      p.x === q.x
        ? p.x > 400 && p.x < 610 && Math.max(p.y, q.y) > 60 && Math.min(p.y, q.y) < 170
        : p.y > 60 && p.y < 170 && Math.max(p.x, q.x) > 400 && Math.min(p.x, q.x) < 610;
    assert.equal(crosses, false);
  }
});

test('flow labels use segment caption, then stream name, then actual object names', () => {
  const project = createExample(),
    flow = { ...project.models[0].flows[0], name: '', objectIds: ['request', 'manager'] };
  assert.equal(flowLabel(project, flow), 'Заявка клиента; Менеджер');
  assert.equal(flowLabel(project, { ...flow, name: 'Поток' }), 'Поток');
  assert.equal(flowLabel(project, { ...flow, name: 'Поток', caption: 'Сегмент' }), 'Сегмент');
  const renamed = reduceProject(project, {
    kind: 'updateElement',
    qualifierId: 'documents',
    element: { ...project.qualifiers[0].elements[0], name: 'Заказ покупателя' },
  });
  assert.equal(flowLabel(renamed, flow), 'Заказ покупателя; Менеджер');
});
test('actual stream references are unique, checked, and protected on deletion', () => {
  const original = createExample(),
    base = original.models[0].flows[0];
  const project = reduceProject(original, {
    kind: 'updateFlow',
    modelId: 'orders',
    flow: { ...base, name: '', objectIds: ['request', 'people'] },
  });
  assert.throws(() =>
    reduceProject(project, { kind: 'deleteElement', qualifierId: 'documents', id: 'request' }),
  );
  assert.throws(() => reduceProject(project, { kind: 'deleteQualifier', id: 'people' }));
  for (const objectIds of [['missing'], ['request', 'request']])
    assert.throws(() =>
      reduceProject(original, {
        kind: 'updateFlow',
        modelId: 'orders',
        flow: { ...base, objectIds },
      }),
    );
});
test('decomposition templates honor count and keep geometry within the supported sheet', () => {
  for (const layout of ['diagonal', 'horizontal', 'vertical'])
    for (const count of [2, 4, 20]) {
      const project = reduceProject(createExample(), {
        kind: 'decomposeBlock',
        modelId: 'orders',
        blockId: 'receive',
        childId: 'child',
        count,
        layout,
      });
      assert.equal(project.models[1].blocks.length, count);
      validateProject(project);
    }
  for (const count of [1, 21, 2.5])
    assert.throws(() =>
      reduceProject(createExample(), {
        kind: 'decomposeBlock',
        modelId: 'orders',
        blockId: 'receive',
        childId: 'child',
        count,
      }),
    );
});
test('block sizes persist and invalid sizes cannot mutate a project', () => {
  const project = createExample(),
    block = project.models[0].blocks[0];
  const resized = reduceProject(project, {
    kind: 'updateBlock',
    modelId: 'orders',
    block: { ...block, width: 280, height: 160 },
  });
  assert.equal(resized.models[0].blocks[0].width, 280);
  for (const width of [0, 801, NaN])
    assert.throws(() =>
      reduceProject(project, {
        kind: 'updateBlock',
        modelId: 'orders',
        block: { ...block, width },
      }),
    );
  assert.equal(project.models[0].blocks[0].width, undefined);
});
test('centering arrows changes selected block ports without moving boundary ends', () => {
  let project = createExample();
  project.models[0].flows[0].sourcePosition = 0.2;
  project.models[0].flows[0].targetPosition = 0.8;
  project = reduceProject(project, { kind: 'centerArrows', modelId: 'orders', blockId: 'receive' });
  assert.equal(project.models[0].flows[0].sourcePosition, 0.5);
  assert.equal(project.models[0].flows[0].targetPosition, 0.8);
  project = reduceProject(project, { kind: 'centerArrows', modelId: 'orders' });
  assert.equal(project.models[0].flows[0].targetPosition, 0.5);
});
test('objects of inherited streams follow the parent while captions stay local', () => {
  let project = decompose(createExample(), 'orders', 'verify', 'child');
  project = reduceProject(project, {
    kind: 'addFlow',
    modelId: 'child',
    flow: {
      id: 'inherit',
      name: 'Заявка',
      sourceId: null,
      targetId: 'child-1',
      parentFlowId: 'request-flow',
      caption: 'Местная подпись',
    },
  });
  project = reduceProject(project, {
    kind: 'updateFlow',
    modelId: 'orders',
    flow: { ...project.models[0].flows[0], name: '', objectIds: ['request'] },
  });
  assert.deepEqual(project.models[1].flows[0].objectIds, ['request']);
  assert.equal(project.models[1].flows[0].caption, 'Местная подпись');
});

test('the documented Ramus command scenario agrees with the native fixture', () => {
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/ramus-workflow.json', import.meta.url), 'utf8'),
  );
  let project = createExample();
  for (const command of fixture.commands) project = reduceProject(project, command);
  assert.deepEqual(project, fixture.expected);
});

test('DFD commands, numeric decomposition, colors and native fixture agree', () => {
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/dfd-scenario.json', import.meta.url), 'utf8'),
  );
  let project = createExample();
  for (const [index, command] of fixture.commands.entries()) {
    project = reduceProject(project, command);
    if (index === 3) {
      assert.equal(project.models[1].blocks[0].fillColor, undefined);
      assert.equal(project.models[1].blocks[0].textColor, undefined);
    }
  }
  assert.deepEqual(project, fixture.expected);
  assert.equal(diagramNode(project, project.models[2]), '0');
  assert.equal(diagramNode(project, project.models[3]), '1');
  assert.equal(
    boundaryPorts(project, project.models[2]).find((p) => p.flowId === 'dfd-in').side,
    'left',
  );
  assert.equal(project.models[2].flows[0].name, 'Заказ клиента');
  assert.equal(project.models[2].backgroundColor, '#ffffff');
  validateProject(JSON.parse(JSON.stringify(project)));
  for (const invalid of fixture.invalidProjects) assert.throws(() => validateProject(invalid));
  for (const command of fixture.invalidCommands)
    assert.throws(() => reduceProject(project, command));
  assert.deepEqual(project, fixture.expected);
});

test('localized decomposition names are explicit command data and leave existing names intact', () => {
  const fixture = JSON.parse(
    fs.readFileSync(new URL('../fixtures/localized-decomposition.json', import.meta.url), 'utf8'),
  );
  let project = createExample();
  for (const command of fixture.commands) project = reduceProject(project, command);
  for (const [id, names] of Object.entries(fixture.expected))
    assert.deepEqual(
      project.models.find((m) => m.id === id).blocks.map((b) => b.name),
      names,
    );
  assert.deepEqual(project.models[0], createExample().models[0]);
  for (const blockNamePrefix of ['', '  ', 'a'.repeat(241)])
    assert.throws(() =>
      reduceProject(createExample(), { ...fixture.commands[0], blockNamePrefix }),
    );
});
