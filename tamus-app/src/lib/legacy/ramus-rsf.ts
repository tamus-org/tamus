import type {
  Block,
  DiagramSheet,
  Flow,
  Model,
  PortSide,
  Project,
  Qualifier,
} from '$lib/domain/project';

export interface RamusImportReport {
  models: number;
  blocks: number;
  flows: number;
  qualifiers: number;
  elements: number;
  skipped: string[];
  warnings: string[];
  unknownTables: string[];
}

export interface RamusImportResult {
  project: Project;
  report: RamusImportReport;
}

export interface RamusExportResult {
  data: Uint8Array;
  fileName: string;
  models: number;
  blocks: number;
  flows: number;
  qualifiers: number;
}

type Row = Record<string, string>;
interface Field {
  name: string;
  type: string;
}
interface Table {
  name: string;
  fields: Field[];
  rows: Row[];
}
interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sideToFunctionType: Record<PortSide, number> = { right: 0, bottom: 1, left: 2, top: 3 };
const functionTypeToSide: Record<number, PortSide> = {
  0: 'right',
  1: 'bottom',
  2: 'left',
  3: 'top',
};

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const decodeXml = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const getAttributes = (text: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const match of text.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g))
    result[match[1]] = decodeXml(match[2]);
  return result;
};

export function parseTable(name: string, xml: string): Table {
  const fields: Field[] = [];
  for (const match of xml.matchAll(/<field\b([^>]*?)\/>/g)) {
    const attributes = getAttributes(match[1]);
    if (attributes.name) fields.push({ name: attributes.name, type: attributes.type ?? '' });
  }
  const rows: Row[] = [];
  for (const match of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Row = {};
    for (const cell of match[1].matchAll(/<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/g)) {
      const attributes = getAttributes(cell[1]);
      const field = fields[Number(attributes.id)];
      if (field) row[field.name] = decodeXml(cell[2] ?? '');
    }
    rows.push(row);
  }
  return { name, fields, rows };
}

function tableXml(table: Table): string {
  const fields = table.fields
    .map((field, id) => `<field id="${id}" name="${field.name}" type="${field.type}"/>`)
    .join('');
  const rows = table.rows
    .map((row) => {
      const cells = table.fields
        .map((field, id) => {
          const value = row[field.name];
          return value === undefined || value === ''
            ? `<f id="${id}"/>`
            : `<f id="${id}">${xmlEscape(value)}</f>`;
        })
        .join('');
      return `<row>${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><table generate-from-table="${table.name}" generate-time="${new Date().toUTCString()}" prefix="ramus_"><fields>${fields}</fields><data>${rows}</data></table>`;
}

let crcTable: Uint32Array | undefined;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let value = i;
      for (let bit = 0; bit < 8; bit++)
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[i] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const bytes = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error('Файл не является ZIP-архивом Ramus (.rsf).');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const result = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (local + 30 > bytes.length) continue;
    const localNameLength = view.getUint16(local + 26, true);
    const localExtraLength = view.getUint16(local + 28, true);
    const start = local + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressed);
    if (method === 0) result.set(name.replace(/^\/+/, ''), raw);
    else if (method === 8) result.set(name.replace(/^\/+/, ''), await inflateRaw(raw));
    else throw new Error(`Неподдерживаемый метод сжатия ZIP: ${method}.`);
  }
  return result;
}

function setUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}
function setUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

export function writeZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = (2020 - 1980) * 512 + 1 * 32 + 1;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    setUint32(localView, 0, 0x04034b50);
    setUint16(localView, 4, 20);
    setUint16(localView, 6, 0x0800);
    setUint16(localView, 8, 0);
    setUint16(localView, 10, dosTime);
    setUint16(localView, 12, dosDate);
    setUint32(localView, 14, crc);
    setUint32(localView, 18, entry.data.length);
    setUint32(localView, 22, entry.data.length);
    setUint16(localView, 26, name.length);
    local.set(name, 30);
    localChunks.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    setUint32(centralView, 0, 0x02014b50);
    setUint16(centralView, 4, 20);
    setUint16(centralView, 6, 20);
    setUint16(centralView, 8, 0x0800);
    setUint16(centralView, 10, 0);
    setUint16(centralView, 12, dosTime);
    setUint16(centralView, 14, dosDate);
    setUint32(centralView, 16, crc);
    setUint32(centralView, 20, entry.data.length);
    setUint32(centralView, 24, entry.data.length);
    setUint16(centralView, 28, name.length);
    setUint16(centralView, 30, 0);
    setUint16(centralView, 32, 0);
    setUint16(centralView, 34, 0);
    setUint16(centralView, 36, 0);
    setUint32(centralView, 38, 0);
    setUint32(centralView, 42, offset);
    central.set(name, 46);
    centralChunks.push(central);
    offset += local.length + entry.data.length;
  }
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  setUint32(endView, 0, 0x06054b50);
  setUint16(endView, 8, entries.length);
  setUint16(endView, 10, entries.length);
  setUint32(endView, 12, centralSize);
  setUint32(endView, 16, offset);
  const chunks = [...localChunks, ...centralChunks, end];
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

const SCHEMAS: Record<string, string[]> = {
  attributes: [
    'ATTRIBUTE_ID',
    'ATTRIBUTE_NAME',
    'ATTRIBUTE_TYPE_PLUGIN_NAME',
    'ATTRIBUTE_TYPE_NAME',
    'ATTRIBUTE_TYPE_COMPARABLE',
    'ATTRIBUTE_SYSTEM',
    'CREATED_BRANCH_ID',
    'REMOVED_BRANCH_ID',
  ],
  qualifiers: [
    'QUALIFIER_ID',
    'QUALIFIER_NAME',
    'QUALIFIER_SYSTEM',
    'ATTRIBUTE_FOR_NAME',
    'CREATED_BRANCH_ID',
    'REMOVED_BRANCH_ID',
  ],
  qualifiers_attributes: [
    'QUALIFIER_ID',
    'ATTRIBUTE_ID',
    'ATTRIBUTE_SYSTEM',
    'ATTRIBUTE_POSITION',
    'CREATED_BRANCH_ID',
  ],
  elements: [
    'ELEMENT_ID',
    'ELEMENT_NAME',
    'QUALIFIER_ID',
    'CREATED_BRANCH_ID',
    'REMOVED_BRANCH_ID',
  ],
  streams: ['STREAM_ID', 'CREATED_BRANCH_ID', 'REMOVED_BRANCH_ID'],
  branches: ['BRANCH_ID', 'CREATION_USER', 'REASON', 'BRANCH_TYPE', 'MODULE_NAME', 'CREATION_TIME'],
  attributes_history: ['ATTRIBUTE_ID', 'ATTRIBUTE_NAME', 'CREATED_BRANCH_ID', 'REMOVED_BRANCH_ID'],
  qualifiers_history: ['QUALIFIER_ID', 'QUALIFIER_NAME', 'ATTRIBUTE_FOR_NAME', 'CREATED_BRANCH_ID'],
  attributes_data_metadata: ['ELEMENT_ID', 'ATTRIBUTE_ID', 'BRANCH_ID'],
  formulas: ['ELEMENT_ID', 'ATTRIBUTE_ID', 'AUTORECALCULATE', 'FORMULA'],
  formula_dependences: ['SOURCE_ELEMENT_ID', 'SOURCE_ATTRIBUTE_ID', 'ELEMENT_ID', 'ATTRIBUTE_ID'],
  formulas_data_metadata: ['ELEMENT_ID', 'ATTRIBUTE_ID', 'BRANCH_ID'],
  formula_dependences_data_metadata: ['ELEMENT_ID', 'ATTRIBUTE_ID', 'BRANCH_ID'],
  application_preferencies: ['OPTION_KEY', 'OPTION_VALUE'],
  persistents: [
    'PERSISTENT_ID',
    'TABLE_NAME',
    'TABLE_TYPE',
    'CLASS_NAME',
    'PLUGIN_NAME',
    'TYPE_NAME',
    'PERSISTENT_EXISTS',
  ],
  persistent_fields: [
    'PERSISTENT_FIELD_ID',
    'PERSISTENT_ID',
    'FIELD_NAME',
    'FIELD_DATABASE_NAME',
    'FIELD_ID',
    'FIELD_EXISTS',
    'FIELD_TYPE',
    'FIELD_AUTOSET',
    'FIELD_PRIMARY',
  ],
  'Core/attribute_hierarchicals': [
    'ATTRIBUTE_ID',
    'ELEMENT_ID',
    'ICON_ID',
    'PARENT_ELEMENT_ID',
    'PREVIOUS_ELEMENT_ID',
    'VALUE_BRANCH_ID',
  ],
  'Core/attribute_texts': ['ATTRIBUTE_ID', 'ELEMENT_ID', 'VALUE', 'VALUE_BRANCH_ID'],
  'Core/attribute_longs': ['ATTRIBUTE_ID', 'ELEMENT_ID', 'VALUE', 'VALUE_BRANCH_ID'],
  'Core/attribute_doubles': ['ATTRIBUTE_ID', 'ELEMENT_ID', 'VALUE', 'VALUE_BRANCH_ID'],
  'Core/attribute_dates': ['ATTRIBUTE_ID', 'ELEMENT_ID', 'VALUE', 'VALUE_BRANCH_ID'],
  'Core/attribute_other_elements': [
    'ATTRIBUTE_ID',
    'ELEMENT_ID',
    'OTHER_ELEMENT',
    'VALUE_BRANCH_ID',
  ],
  'Core/attribute_element_lists': [
    'ATTRIBUTE_ID',
    'CONNECTION_TYPE',
    'ELEMENT1_ID',
    'ELEMENT2_ID',
    'VALUE_BRANCH_ID',
    'REMOVED_BRANCH_ID',
  ],
  'Core/attribute_element_list_properties': [
    'ATTRIBUTE_ID',
    'CONNECTION_TYPES',
    'QUALIFIER1',
    'QUALIFIER2',
    'VALUE_BRANCH_ID',
  ],
  'Core/attribute_other_element_properties': [
    'ATTRIBUTE',
    'QUALIFIER',
    'QUALIFIER_ATTRIBUTE',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_rectangles': [
    'ATTRIBUTE_ID',
    'ELEMENT_ID',
    'HEIGHT',
    'WIDTH',
    'X',
    'Y',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_function_types': ['ATTRIBUTE_ID', 'ELEMENT_ID', 'TYPE', 'VALUE_BRANCH_ID'],
  'IDEF0/attribute_decomposition_types': ['ATTRIBUTE_ID', 'ELEMENT_ID', 'TYPE', 'VALUE_BRANCH_ID'],
  'IDEF0/attribute_colors': ['ATTRIBUTE_ID', 'COLOR', 'ELEMENT_ID', 'VALUE_BRANCH_ID'],
  'IDEF0/attribute_fonts': [
    'ATTRIBUTE_ID',
    'ELEMENT_ID',
    'NAME',
    'SIZE',
    'STYLE',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_statuses': [
    'ATTRIBUTE_ID',
    'ELEMENT_ID',
    'OTHER_NAME',
    'TYPE',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_visual_datas': ['ATTRIBUTE_ID', 'DATA', 'ELEMENT_ID', 'VALUE_BRANCH_ID'],
  'IDEF0/attribute_model_preferences': [
    'ATTRIBUTE_ID',
    'CHANGE_DATE',
    'CREATE_DATE',
    'DEFINITION',
    'DIAGRAM_SIZE',
    'ELEMENT_ID',
    'MODEL_LETTER',
    'PROJECT_AUTOR',
    'PROJECT_NAME',
    'TERM_ATTRIBUTE',
    'USED_AT',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_sector_borders': [
    'ATTRIBUTE_ID',
    'BORDER_TYPE',
    'CROSSPOINT',
    'ELEMENT_ID',
    'FUNCTION',
    'FUNCTION_TYPE',
    'TUNNEL_SOFT',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_sector_points': [
    'ATTRIBUTE_ID',
    'ELEMENT_ID',
    'POINT_TYPE',
    'POSITION',
    'X_ORDINATE_ID',
    'X_POSITION',
    'Y_ORDINATE_ID',
    'Y_POSITION',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_sector_properties': [
    'ATTRIBUTE_ID',
    'ELEMENT_ID',
    'SHOW_TEXT',
    'SHOW_TILDA',
    'TEXT_HIEGHT',
    'TEXT_WIDTH',
    'TEXT_X',
    'TEXT_Y',
    'TILDA_POS',
    'TRANSPARENT',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_sectors': [
    'ALTERNATIVE_TEXT',
    'ATTRIBUTE_ID',
    'CREATE_POS',
    'CREATE_STATE',
    'ELEMENT_ID',
    'SHOW_TEXT',
    'TEXT_ALIGMENT',
    'VISUAL_ATTRIBUTES',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_any_to_any_elements': [
    'ATTRIBUTE_ID',
    'ELEMENT_ID',
    'ELEMENT_STATUS',
    'OTHER_ELEMENT',
    'VALUE_BRANCH_ID',
  ],
  'IDEF0/attribute_readers': ['ATTRIBUTE_ID', 'DATE', 'ELEMENT_ID', 'READER', 'VALUE_BRANCH_ID'],
};

const SCHEMA_TYPES: Record<string, Record<string, string>> = {
  attributes: {
    ATTRIBUTE_TYPE_COMPARABLE: 'BOOLEAN',
    ATTRIBUTE_SYSTEM: 'BOOLEAN',
  },
  qualifiers: { QUALIFIER_SYSTEM: 'BOOLEAN' },
  qualifiers_attributes: { ATTRIBUTE_SYSTEM: 'BOOLEAN', ATTRIBUTE_POSITION: 'INTEGER' },
  branches: { BRANCH_TYPE: 'INTEGER', CREATION_TIME: 'TIMESTAMP' },
  attributes_history: { ATTRIBUTE_NAME: 'CLOB' },
  qualifiers_history: { QUALIFIER_NAME: 'CLOB' },
  formulas: { AUTORECALCULATE: 'BOOLEAN', FORMULA: 'CLOB' },
  persistents: { TABLE_TYPE: 'INTEGER', PERSISTENT_EXISTS: 'BOOLEAN' },
  persistent_fields: {
    FIELD_ID: 'INTEGER',
    FIELD_EXISTS: 'BOOLEAN',
    FIELD_TYPE: 'INTEGER',
    FIELD_AUTOSET: 'BOOLEAN',
    FIELD_PRIMARY: 'BOOLEAN',
  },
  'Core/attribute_texts': { VALUE: 'CLOB' },
  'Core/attribute_longs': { VALUE: 'BIGINT' },
  'Core/attribute_doubles': { VALUE: 'DOUBLE' },
  'Core/attribute_dates': { VALUE: 'TIMESTAMP' },
  'Core/attribute_other_elements': { OTHER_ELEMENT: 'BIGINT' },
  'Core/attribute_element_list_properties': {
    CONNECTION_TYPES: 'CLOB',
    QUALIFIER1: 'BIGINT',
    QUALIFIER2: 'BIGINT',
  },
  'Core/attribute_other_element_properties': {
    ATTRIBUTE: 'BIGINT',
    QUALIFIER: 'BIGINT',
    QUALIFIER_ATTRIBUTE: 'BIGINT',
  },
  'IDEF0/attribute_rectangles': { HEIGHT: 'DOUBLE', WIDTH: 'DOUBLE', X: 'DOUBLE', Y: 'DOUBLE' },
  'IDEF0/attribute_function_types': { TYPE: 'INTEGER' },
  'IDEF0/attribute_decomposition_types': { TYPE: 'INTEGER' },
  'IDEF0/attribute_colors': { COLOR: 'INTEGER' },
  'IDEF0/attribute_fonts': { NAME: 'CLOB', SIZE: 'INTEGER', STYLE: 'INTEGER' },
  'IDEF0/attribute_statuses': { OTHER_NAME: 'CLOB', TYPE: 'INTEGER' },
  'IDEF0/attribute_visual_datas': { DATA: 'VARBINARY' },
  'IDEF0/attribute_model_preferences': {
    CHANGE_DATE: 'TIMESTAMP',
    CREATE_DATE: 'TIMESTAMP',
    DEFINITION: 'CLOB',
    DIAGRAM_SIZE: 'CLOB',
    MODEL_LETTER: 'CLOB',
    PROJECT_AUTOR: 'CLOB',
    PROJECT_NAME: 'CLOB',
    TERM_ATTRIBUTE: 'BIGINT',
    USED_AT: 'CLOB',
  },
  'IDEF0/attribute_sector_borders': {
    BORDER_TYPE: 'INTEGER',
    CROSSPOINT: 'BIGINT',
    FUNCTION: 'BIGINT',
    FUNCTION_TYPE: 'INTEGER',
    TUNNEL_SOFT: 'INTEGER',
  },
  'IDEF0/attribute_sector_points': {
    POINT_TYPE: 'INTEGER',
    POSITION: 'INTEGER',
    X_ORDINATE_ID: 'BIGINT',
    X_POSITION: 'DOUBLE',
    Y_ORDINATE_ID: 'BIGINT',
    Y_POSITION: 'DOUBLE',
  },
  'IDEF0/attribute_sector_properties': {
    SHOW_TEXT: 'INTEGER',
    SHOW_TILDA: 'INTEGER',
    TEXT_HIEGHT: 'DOUBLE',
    TEXT_WIDTH: 'DOUBLE',
    TEXT_X: 'DOUBLE',
    TEXT_Y: 'DOUBLE',
    TILDA_POS: 'DOUBLE',
    TRANSPARENT: 'INTEGER',
  },
  'IDEF0/attribute_sectors': {
    ALTERNATIVE_TEXT: 'CLOB',
    CREATE_POS: 'DOUBLE',
    CREATE_STATE: 'INTEGER',
    SHOW_TEXT: 'INTEGER',
    TEXT_ALIGMENT: 'INTEGER',
    VISUAL_ATTRIBUTES: 'VARBINARY',
  },
  'IDEF0/attribute_any_to_any_elements': { ELEMENT_STATUS: 'CLOB', OTHER_ELEMENT: 'BIGINT' },
  'IDEF0/attribute_readers': { DATE: 'TIMESTAMP', READER: 'CLOB' },
};

const STANDARD_ATTRIBUTES: [number, string, string, string, boolean, boolean][] = [
  [1, 'HierarchicalAttribute', 'Core', 'Hierarchical', true, true],
  [2, 'HistoryElementAttribute', 'Core', 'Long', true, true],
  [3, 'HistoryAttributeAttribute', 'Core', 'Long', true, true],
  [4, 'HistoryTimeAttribute', 'Core', 'Date', true, true],
  [5, 'QualifierAttributes', 'Core', 'ElementList', false, true],
  [6, 'QualifierId', 'Core', 'Long', true, true],
  [7, 'AttributeId', 'Core', 'Long', true, true],
  [8, 'AttributeName', 'Core', 'Text', true, true],
  [9, 'AttributeTypeName', 'Core', 'Text', true, true],
  [10, 'IconsAttribute', 'Core', 'Icon', false, true],
  [11, 'IconsQualifierOpenFolders', 'Core', 'Text', true, true],
  [12, 'IconsQualifierClosedFolders', 'Core', 'Text', true, true],
  [13, 'IconsQualifierLeafs', 'Core', 'Text', true, true],
  [14, 'TableElementIdAttribute', 'Core', 'Long', true, true],
  [15, 'FunctionAttribute', 'Eval', 'Function', false, true],
  [16, 'ATTRIBUTE_EVAL_FUNCTION_DEPENDENCE', 'Core', 'Long', true, true],
  [17, 'ATTRIBUTE_EVAL_DEPENDENCE_QUALIFIER', 'Core', 'Long', true, true],
  [18, 'ATTRIBUTE_EVAL_DEPENDENCE_ATTRIBUTE', 'Core', 'Long', true, true],
  [19, 'ATTRIBUTE_EVAL_FUNCTION_DEPENDENCE_SOURCE_ATTRIBUTE', 'Core', 'Long', true, true],
  [20, 'F_VISUAL_DATA', 'IDEF0', 'VisualData', false, true],
  [21, 'F_PAGE_SIZE', 'Core', 'Text', true, true],
  [22, 'F_BACKGROUND', 'IDEF0', 'Color', false, true],
  [23, 'F_FOREGROUND', 'IDEF0', 'Color', false, true],
  [24, 'F_BOUNDS', 'IDEF0', 'FRectangle', false, true],
  [25, 'F_FONT', 'IDEF0', 'Font', false, true],
  [26, 'F_STATUS', 'IDEF0', 'Status', false, true],
  [27, 'F_TYPE', 'IDEF0', 'Type', false, true],
  [28, 'F_OUNER_ID', 'IDEF0', 'OunerId', false, true],
  [29, 'F_DECOMPOSITION_TYPE', 'IDEF0', 'DecompositionType', false, true],
  [30, 'F_AUTHOR', 'Core', 'Text', true, true],
  [31, 'F_CREATE_DATE', 'Core', 'Date', false, true],
  [32, 'F_REV_DATE', 'Core', 'Date', false, true],
  [33, 'F_SYSTEM_REV_DATE', 'Core', 'Date', false, true],
  [34, 'F_LINK', 'Core', 'Long', false, true],
  [35, 'F_FUNCTION_SECTOR', 'Core', 'OtherElement', false, true],
  [36, 'F_SECTOR_STREAM', 'Core', 'OtherElement', false, true],
  [37, 'F_SECTOR_POINTS', 'IDEF0', 'SectorPoint', false, true],
  [38, 'F_SECTOR_PROPERTIES', 'IDEF0', 'SectorProperties', false, true],
  [39, 'F_STREAM_NAME', 'Core', 'Text', true, true],
  [40, 'F_SECTOR_ATTRIBUTE', 'IDEF0', 'Sector', false, true],
  [41, 'F_SECTOR_BORDER_START', 'IDEF0', 'SectorBorder', false, true],
  [42, 'F_SECTOR_BORDER_END', 'IDEF0', 'SectorBorder', false, true],
  [43, 'F_STREAM_ADDED', 'IDEF0', 'AnyToAny', false, true],
  [44, 'F_BASE_FUNCTION_QUALIFIER_ID', 'Core', 'Long', true, true],
  [45, 'F_PROJECT_PREFERENCES', 'IDEF0', 'ProjectPreferences', false, true],
  [46, 'F_REPORT_NAME', 'Core', 'Text', true, true],
  [47, 'F_REPORT_QUALIFIER', 'Core', 'Long', true, true],
  [48, 'F_REPORT_TYPE', 'Core', 'Text', true, true],
  [49, 'ATTRIBUTE_CHART_SET_X', 'Core', 'Double', true, true],
  [50, 'ATTRIBUTE_CHART_SET_Y', 'Core', 'Double', true, true],
  [51, 'ATTRIBUTE_CHART_SET_WIDTH', 'Core', 'Double', true, true],
  [52, 'ATTRIBUTE_CHART_SET_HEIGHT', 'Core', 'Double', true, true],
  [53, 'ATTRIBUTE_CHART', 'Core', 'Long', true, true],
  [54, 'ATTRIBUTE_CHART_SET', 'Core', 'Long', true, true],
  [55, 'Название', 'Core', 'Text', true, false],
];

const STANDARD_QUALIFIERS: [number, string, boolean, number][] = [
  [1, 'HistoryQualifier', true, -1],
  [2, 'QualifiersQualifier', true, 8],
  [3, 'AttributesQualifier', true, 8],
  [4, 'IconsQualifier', true, -1],
  [5, 'QUALIFIER_EVAL_FUNCTION_DEPENDENCES', true, -1],
  [6, 'F_SECTORS', true, -1],
  [7, 'F_STREAMS', true, 39],
  [8, 'F_BASE_FUNCTIONS', true, -1],
  [9, 'F_MODEL_TREE', true, 8],
  [10, 'F_REPORTS_QUALIFIER', true, 46],
  [11, 'QUALIFIER_CHARTS', true, 8],
  [12, 'QUALIFIER_CHART_SETS', true, 8],
  [13, 'QUALIFIER_CHART_LINKS', true, -1],
];

const STANDARD_QUALIFIER_ATTRIBUTES: [number, number, boolean][] = [
  [1, 2, true],
  [1, 3, true],
  [1, 4, true],
  [2, 1, true],
  [2, 8, true],
  [2, 6, true],
  [2, 5, true],
  [2, 15, true],
  [3, 5, true],
  [3, 1, true],
  [3, 7, true],
  [3, 8, true],
  [3, 9, true],
  [4, 10, true],
  [4, 11, true],
  [4, 12, true],
  [4, 13, true],
  [5, 16, false],
  [5, 17, false],
  [5, 18, false],
  [5, 19, false],
  [6, 36, true],
  [6, 40, true],
  [6, 41, true],
  [6, 42, true],
  [6, 35, true],
  [6, 1, true],
  [6, 37, true],
  [6, 38, true],
  [7, 43, true],
  [7, 1, true],
  [7, 39, true],
  [8, 45, true],
  [8, 1, true],
  [8, 44, true],
  [8, 20, true],
  [8, 21, true],
  [8, 22, true],
  [8, 23, true],
  [8, 24, true],
  [8, 25, true],
  [8, 26, true],
  [8, 27, true],
  [8, 28, true],
  [8, 29, true],
  [8, 30, true],
  [8, 31, true],
  [8, 32, true],
  [8, 33, true],
  [8, 34, true],
  [9, 8, false],
  [9, 1, true],
  [9, 6, true],
  [10, 46, false],
  [10, 1, true],
  [10, 47, true],
  [10, 48, true],
  [11, 8, false],
  [11, 1, true],
  [12, 8, false],
  [12, 1, true],
  [13, 49, true],
  [13, 50, true],
  [13, 51, true],
  [13, 52, true],
  [13, 54, true],
  [13, 53, true],
];

const FUNCTION_QUALIFIER_SYSTEM_ATTRIBUTES = [
  1, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
];
const FUNCTION_QUALIFIER_USER_ATTRIBUTES = [55];
const inferType = (name: string) =>
  name.includes('DATE') || name.includes('TIME')
    ? 'TIMESTAMP'
    : name === 'VALUE' ||
        name.startsWith('ATTRIBUTE_ID') ||
        name.startsWith('ELEMENT_ID') ||
        name.endsWith('_ID')
      ? 'BIGINT'
      : 'CHAR';
const schemaFields = (key: string): Field[] => {
  const names = SCHEMAS[key] ?? [];
  return names.map((name) => ({ name, type: SCHEMA_TYPES[key]?.[name] ?? inferType(name) }));
};
const emptyTable = (key: string): Table => ({ name: key, fields: schemaFields(key), rows: [] });

const bool = (value: boolean) => (value ? 'TRUE' : 'FALSE');
const isoDate = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};
const text = (value: string | undefined, fallback = '') => (value ?? fallback).trim();
const numberValue = (value: string | undefined): number | undefined => {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const integerValue = (value: string | undefined): number | undefined => {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const safeName = (value: string, fallback: string) => {
  const trimmed = value.trim().slice(0, 256);
  return trimmed.length > 0 ? trimmed : fallback;
};
const cleanFileName = (value: string) =>
  value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Проект';

interface ImportContext {
  tables: Map<string, Table>;
  attributes: Map<number, { name: string; plugin: string; type: string }>;
  qualifiers: Map<number, { name: string; system: boolean; nameAttribute: number }>;
  elements: Map<number, { name: string; qualifier: number }>;
  indexed: Map<string, Row[]>;
}

const rowKey = (table: string, elementId: number | string, attributeId: number | string) =>
  `${table}|${elementId}|${attributeId}`;

const rowsOf = (context: ImportContext, table: string, elementId: number, attributeId: number) =>
  context.indexed.get(rowKey(table, elementId, attributeId)) ?? [];

const attrTable = (
  context: ImportContext,
  attributeId: number,
): { table: string; field: string } | undefined => {
  const attribute = context.attributes.get(attributeId);
  if (!attribute) return undefined;
  const key = `${attribute.plugin}.${attribute.type}`;
  const table = {
    'Core.Text': 'Core/attribute_texts',
    'Core.Long': 'Core/attribute_longs',
    'Core.Double': 'Core/attribute_doubles',
    'Core.Date': 'Core/attribute_dates',
    'Core.Boolean': 'Core/attribute_booleans',
    'Core.OtherElement': 'Core/attribute_other_elements',
    'Core.ElementList': 'Core/attribute_element_lists',
    'IDEF0.Color': 'IDEF0/attribute_colors',
    'IDEF0.Type': 'IDEF0/attribute_function_types',
    'IDEF0.DecompositionType': 'IDEF0/attribute_decomposition_types',
    'IDEF0.FRectangle': 'IDEF0/attribute_rectangles',
    'IDEF0.Font': 'IDEF0/attribute_fonts',
    'IDEF0.Status': 'IDEF0/attribute_statuses',
    'IDEF0.VisualData': 'IDEF0/attribute_visual_datas',
    'IDEF0.ProjectPreferences': 'IDEF0/attribute_model_preferences',
    'IDEF0.Sector': 'IDEF0/attribute_sectors',
    'IDEF0.SectorBorder': 'IDEF0/attribute_sector_borders',
    'IDEF0.SectorPoint': 'IDEF0/attribute_sector_points',
    'IDEF0.SectorProperties': 'IDEF0/attribute_sector_properties',
    'IDEF0.AnyToAny': 'IDEF0/attribute_any_to_any_elements',
  }[key];
  if (!table) return undefined;
  const fields: Record<string, string> = {
    'Core/attribute_texts': 'VALUE',
    'Core/attribute_longs': 'VALUE',
    'Core/attribute_doubles': 'VALUE',
    'Core/attribute_dates': 'VALUE',
    'Core/attribute_booleans': 'VALUE',
    'Core/attribute_other_elements': 'OTHER_ELEMENT',
    'IDEF0/attribute_colors': 'COLOR',
    'IDEF0/attribute_function_types': 'TYPE',
    'IDEF0/attribute_decomposition_types': 'TYPE',
    'IDEF0/attribute_statuses': 'TYPE',
    'IDEF0/attribute_visual_datas': 'DATA',
  };
  return { table, field: fields[table] ?? 'VALUE' };
};

const attributeText = (context: ImportContext, elementId: number, attributeId: number): string => {
  const target = attrTable(context, attributeId);
  if (!target) return '';
  return rowsOf(context, target.table, elementId, attributeId)[0]?.[target.field] ?? '';
};

const elementName = (context: ImportContext, elementId: number): string => {
  const element = context.elements.get(elementId);
  if (!element) return `Элемент ${elementId}`;
  const qualifier = context.qualifiers.get(element.qualifier);
  let name = '';
  if (qualifier && qualifier.nameAttribute >= 0)
    name = attributeText(context, elementId, qualifier.nameAttribute);
  if (!name) name = attributeText(context, elementId, 55);
  if (!name) name = text(element.name);
  return safeName(name, `Элемент ${elementId}`);
};

const streamName = (context: ImportContext, elementId: number): string => {
  const direct = attributeText(context, elementId, 39);
  if (direct.trim()) return direct.trim();
  const nameAttribute = context.qualifiers.get(7)?.nameAttribute;
  const named =
    nameAttribute && nameAttribute >= 0 ? attributeText(context, elementId, nameAttribute) : '';
  return safeName(named, `Поток ${elementId}`);
};

const dateText = (value: string | undefined): string => {
  if (!value) return '';
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return iso ? iso[0] : value.slice(0, 256);
};

const ramusColor = (value: number | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const rgb = (value >>> 0) & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
};

const defaultSheet = (): DiagramSheet => ({
  author: '',
  createdAt: '',
  revisedAt: '',
  usedAt: '',
  notes: '',
  reader: '',
  readerDate: '',
  number: '',
  node: 'A0',
  context: 'ВЕРХ',
});

interface ImportPoint {
  x: number;
  y: number;
  type: number;
  position: number;
}
interface ImportBorder {
  function: number;
  functionType: number;
  borderType: number;
  crosspoint: number;
}
interface ImportSector {
  id: number;
  owner: number;
  stream: number;
  start: ImportBorder;
  end: ImportBorder;
  points: ImportPoint[];
}

const borderOf = (context: ImportContext, sectorId: number, attributeId: number): ImportBorder => {
  const row = rowsOf(context, 'IDEF0/attribute_sector_borders', sectorId, attributeId)[0];
  return {
    function: integerValue(row?.FUNCTION) ?? -1,
    functionType: integerValue(row?.FUNCTION_TYPE) ?? -1,
    borderType: integerValue(row?.BORDER_TYPE) ?? -1,
    crosspoint: integerValue(row?.CROSSPOINT) ?? -1,
  };
};

const pointSide = (block: Block, point: ImportPoint | undefined, fallback: PortSide): PortSide => {
  if (!point) return fallback;
  const width = block.width ?? 210;
  const height = block.height ?? 110;
  const distances: [PortSide, number][] = [
    ['left', Math.abs(point.x - block.x)],
    ['right', Math.abs(point.x - (block.x + width))],
    ['top', Math.abs(point.y - block.y)],
    ['bottom', Math.abs(point.y - (block.y + height))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][1] <= 36 ? distances[0][0] : fallback;
};

const positionOnSide = (
  block: Block,
  side: PortSide,
  point: ImportPoint | undefined,
  fallback = 0.5,
) => {
  if (!point) return fallback;
  const width = block.width ?? 210;
  const height = block.height ?? 110;
  const value =
    side === 'left' || side === 'right'
      ? (point.y - block.y) / height
      : (point.x - block.x) / width;
  return clamp(Number.isFinite(value) ? value : fallback, 0.05, 0.95);
};

interface DiagramFrame {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const boundaryPosition = (side: PortSide, point: ImportPoint | undefined, frame: DiagramFrame) => {
  if (!point) return 0.5;
  const width = Math.max(1, frame.right - frame.left);
  const height = Math.max(1, frame.bottom - frame.top);
  const value =
    side === 'left' || side === 'right'
      ? (point.y - frame.top) / height
      : (point.x - frame.left) / width;
  return clamp(Number.isFinite(value) ? value : 0.5, 0.05, 0.95);
};

const simplifyPolyline = (points: { x: number; y: number }[]) => {
  const unique = points.filter(
    (point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
  );
  return unique.filter((point, index) => {
    const before = unique[index - 1],
      after = unique[index + 1];
    if (!before || !after) return true;
    if (before.x === point.x && point.x === after.x)
      return point.y < Math.min(before.y, after.y) || point.y > Math.max(before.y, after.y);
    if (before.y === point.y && point.y === after.y)
      return point.x < Math.min(before.x, after.x) || point.x > Math.max(before.x, after.x);
    return true;
  });
};

const reservePosition = (used: Map<string, number[]>, key: string, position: number): number => {
  const list = used.get(key) ?? [];
  for (let index = 0; index < 48; index++) {
    const offset = Math.ceil(index / 2) * 0.035 * (index % 2 === 0 ? 1 : -1);
    const candidate = clamp(position + offset, 0.05, 0.95);
    if (!list.some((value) => Math.abs(value - candidate) < 0.012)) {
      list.push(candidate);
      used.set(key, list);
      return candidate;
    }
  }
  return position;
};

const diagramFrame = (blocks: Block[], sectors: ImportSector[]): DiagramFrame => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const block of blocks) {
    xs.push(block.x, block.x + (block.width ?? 210));
    ys.push(block.y, block.y + (block.height ?? 110));
  }
  for (const sector of sectors) {
    for (const point of sector.points) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }
  if (xs.length === 0 || ys.length === 0) return { left: 0, right: 1000, top: 0, bottom: 700 };
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
};

export async function importRamusRsf(bytes: Uint8Array): Promise<RamusImportResult> {
  const files = await readZip(bytes);
  const tables = new Map<string, Table>();
  const unknownTables: string[] = [];
  for (const [path, data] of files) {
    if (!path.startsWith('data/') || !path.endsWith('.xml')) continue;
    const key = path.slice(5, -4);
    if (key === 'application_metadata' || key === 'sequences') continue;
    const table = parseTable(key, decoder.decode(data));
    tables.set(key, table);
    if (table.rows.length > 0 && !SCHEMAS[key]) unknownTables.push(key);
  }
  if (!tables.get('elements')?.rows.length) {
    throw new Error('В файле нет элементов проекта Ramus. Возможно, это не RSF-модель.');
  }

  const attributes = new Map<number, { name: string; plugin: string; type: string }>();
  for (const row of tables.get('attributes')?.rows ?? []) {
    const id = integerValue(row.ATTRIBUTE_ID);
    if (id === undefined) continue;
    attributes.set(id, {
      name: row.ATTRIBUTE_NAME ?? '',
      plugin: row.ATTRIBUTE_TYPE_PLUGIN_NAME ?? '',
      type: row.ATTRIBUTE_TYPE_NAME ?? '',
    });
  }
  const qualifiers = new Map<number, { name: string; system: boolean; nameAttribute: number }>();
  for (const row of tables.get('qualifiers')?.rows ?? []) {
    const id = integerValue(row.QUALIFIER_ID);
    if (id === undefined) continue;
    qualifiers.set(id, {
      name: row.QUALIFIER_NAME ?? '',
      system: row.QUALIFIER_SYSTEM === 'TRUE' || row.QUALIFIER_SYSTEM === 'true',
      nameAttribute: integerValue(row.ATTRIBUTE_FOR_NAME) ?? -1,
    });
  }
  const elements = new Map<number, { name: string; qualifier: number }>();
  for (const row of tables.get('elements')?.rows ?? []) {
    const id = integerValue(row.ELEMENT_ID);
    const qualifier = integerValue(row.QUALIFIER_ID);
    if (id === undefined || qualifier === undefined) continue;
    elements.set(id, { name: row.ELEMENT_NAME ?? '', qualifier });
  }

  const indexed = new Map<string, Row[]>();
  for (const [table, value] of tables) {
    for (const row of value.rows) {
      const elementId = integerValue(row.ELEMENT_ID);
      const attributeId = integerValue(row.ATTRIBUTE_ID);
      if (elementId === undefined || attributeId === undefined) continue;
      const key = rowKey(table, elementId, attributeId);
      const list = indexed.get(key);
      if (list) list.push(row);
      else indexed.set(key, [row]);
    }
  }
  const context: ImportContext = { tables, attributes, qualifiers, elements, indexed };

  const baseQualifier =
    [...qualifiers.entries()].find(([, value]) => value.name === 'F_BASE_FUNCTIONS')?.[0] ?? 8;
  const baseRoots = [...elements.entries()]
    .filter(([, value]) => value.qualifier === baseQualifier)
    .map(([id]) => id);
  const usedFunctionQualifiers = new Set<number>();
  for (const rootElement of baseRoots) {
    const base = integerValue(rowsOf(context, 'Core/attribute_longs', rootElement, 44)[0]?.VALUE);
    if (base !== undefined) usedFunctionQualifiers.add(base);
  }

  const findCustomQualifier = () => {
    for (const [id, qualifier] of qualifiers) {
      if (qualifier.system || usedFunctionQualifiers.has(id)) continue;
      if (id === 6 || id === 7 || id === 8 || id === 9) continue;
      return id;
    }
    return undefined;
  };

  const roots: { elementId: number; qualifierId: number; preferences?: Row }[] = [];
  if (baseRoots.length > 0) {
    for (const elementId of baseRoots) {
      let qualifierId = integerValue(
        rowsOf(context, 'Core/attribute_longs', elementId, 44)[0]?.VALUE,
      );
      if (qualifierId === undefined || !qualifiers.has(qualifierId))
        qualifierId = findCustomQualifier();
      if (qualifierId === undefined) continue;
      const qualifier = qualifiers.get(qualifierId);
      if (!qualifier || qualifier.system) continue;
      if (![...elements.values()].some((value) => value.qualifier === qualifierId)) continue;
      usedFunctionQualifiers.add(qualifierId);
      roots.push({
        elementId,
        qualifierId,
        preferences: rowsOf(context, 'IDEF0/attribute_model_preferences', elementId, 45)[0],
      });
    }
  } else {
    const qualifierId = findCustomQualifier();
    if (qualifierId !== undefined) {
      usedFunctionQualifiers.add(qualifierId);
      roots.push({ elementId: -1, qualifierId });
    }
  }

  const hierarchy = new Map<number, { parent: number; previous: number }>();
  for (const row of tables.get('Core/attribute_hierarchicals')?.rows ?? []) {
    if (row.ATTRIBUTE_ID !== '1') continue;
    const id = integerValue(row.ELEMENT_ID);
    if (id === undefined) continue;
    hierarchy.set(id, {
      parent: integerValue(row.PARENT_ELEMENT_ID) ?? -1,
      previous: integerValue(row.PREVIOUS_ELEMENT_ID) ?? -1,
    });
  }

  const functionQualifierElements = (qualifierId: number) =>
    [...elements.entries()]
      .filter(([, value]) => value.qualifier === qualifierId)
      .map(([id]) => id);
  const childrenOf = (qualifierId: number, parent: number): number[] => {
    const all = functionQualifierElements(qualifierId);
    const ids = new Set(all);
    const direct = all.filter((id) => hierarchy.get(id)?.parent === parent);
    const candidates =
      direct.length > 0
        ? direct
        : parent < 0
          ? all.filter((id) => {
              const item = hierarchy.get(id);
              return !item || item.parent < 0 || item.parent === 0 || !ids.has(item.parent);
            })
          : direct;
    const result: number[] = [];
    const used = new Set<number>();
    const remaining = new Set(candidates);
    while (remaining.size > 0) {
      const next = [...remaining].find((id) => {
        const previous = hierarchy.get(id)?.previous ?? -1;
        return previous < 0 || !remaining.has(previous);
      });
      const current = next ?? [...remaining].sort((a, b) => a - b)[0];
      if (current === undefined) break;
      result.push(current);
      remaining.delete(current);
      used.add(current);
      let following = [...remaining].find((id) => hierarchy.get(id)?.previous === current);
      while (following !== undefined && !used.has(following)) {
        result.push(following);
        remaining.delete(following);
        used.add(following);
        following = [...remaining].find((id) => hierarchy.get(id)?.previous === following);
      }
    }
    return result;
  };

  const sectorIds = [...elements.entries()]
    .filter(([, value]) => value.qualifier === 6)
    .map(([id]) => id);
  const sectors: ImportSector[] = [];
  for (const id of sectorIds) {
    const owner = integerValue(
      rowsOf(context, 'Core/attribute_other_elements', id, 35)[0]?.OTHER_ELEMENT,
    );
    const stream = integerValue(
      rowsOf(context, 'Core/attribute_other_elements', id, 36)[0]?.OTHER_ELEMENT,
    );
    if (owner === undefined || stream === undefined) continue;
    const points = rowsOf(context, 'IDEF0/attribute_sector_points', id, 37)
      .map((row) => ({
        x: numberValue(row.X_POSITION) ?? 0,
        y: numberValue(row.Y_POSITION) ?? 0,
        type: integerValue(row.POINT_TYPE) ?? -1,
        position: integerValue(row.POSITION) ?? 0,
      }))
      .sort((a, b) => a.position - b.position);
    sectors.push({
      id,
      owner,
      stream,
      start: borderOf(context, id, 41),
      end: borderOf(context, id, 42),
      points,
    });
  }
  const rawSectorPoints = sectors.flatMap((sector) => sector.points);
  const minimumX = rawSectorPoints.length
    ? Math.min(...rawSectorPoints.map((point) => point.x))
    : 0;
  const minimumY = rawSectorPoints.length
    ? Math.min(...rawSectorPoints.map((point) => point.y))
    : 0;
  const offsetX = minimumX >= 7 ? 7 : Math.max(0, minimumX);
  const offsetY = minimumY >= 7 ? 7 : Math.max(0, minimumY);
  if (offsetX || offsetY) {
    for (const sector of sectors) {
      for (const point of sector.points) {
        point.x -= offsetX;
        point.y -= offsetY;
      }
    }
  }

  const blockKind = (functionId: number, notation: 'IDEF0' | 'DFD'): Block['kind'] => {
    const type =
      integerValue(rowsOf(context, 'IDEF0/attribute_function_types', functionId, 27)[0]?.TYPE) ?? 1;
    if (type === 1001 && notation === 'DFD') return 'external';
    if (type === 1002 && notation === 'DFD') return 'dataStore';
    return 'process';
  };

  const makeBlock = (functionId: number, notation: 'IDEF0' | 'DFD', blockId: string): Block => {
    const rect = rowsOf(context, 'IDEF0/attribute_rectangles', functionId, 24)[0];
    const width = clamp(numberValue(rect?.WIDTH) ?? 210, 80, 800);
    const height = clamp(numberValue(rect?.HEIGHT) ?? 110, 50, 600);
    const x = clamp((numberValue(rect?.X) ?? 100) - offsetX, 0, 2000);
    const y = clamp((numberValue(rect?.Y) ?? 100) - offsetY, 0, 2000);
    const block: Block = {
      id: blockId,
      name: elementName(context, functionId),
      description: '',
      x,
      y,
      width,
      height,
      kind: blockKind(functionId, notation),
    };
    const fill = ramusColor(
      integerValue(rowsOf(context, 'IDEF0/attribute_colors', functionId, 22)[0]?.COLOR),
    );
    const ink = ramusColor(
      integerValue(rowsOf(context, 'IDEF0/attribute_colors', functionId, 23)[0]?.COLOR),
    );
    if (fill) block.fillColor = fill;
    if (ink) block.textColor = ink;
    const font = rowsOf(context, 'IDEF0/attribute_fonts', functionId, 25)[0];
    if (font) {
      const fontName = text(font.NAME);
      const fontSize = numberValue(font.SIZE);
      const style = integerValue(font.STYLE) ?? 0;
      if (fontName) block.fontName = fontName.slice(0, 128);
      if (fontSize !== undefined && fontSize >= 6 && fontSize <= 72) block.fontSize = fontSize;
      const fontStyle =
        (style & 1) !== 0 && (style & 2) !== 0
          ? 'bold italic'
          : (style & 1) !== 0
            ? 'bold'
            : (style & 2) !== 0
              ? 'italic'
              : 'normal';
      if (fontStyle !== 'normal') block.fontStyle = fontStyle;
    }
    return block;
  };

  const models: Model[] = [];
  const functionToBlock = new Map<number, { modelId: string; blockId: string }>();
  const rootElementByModel = new Map<string, number>();
  const functionByBlock = new Map<string, number>();
  const warnings: string[] = [];

  const addModel = (
    modelId: string,
    modelName: string,
    notation: 'IDEF0' | 'DFD',
    functionIds: number[],
    parentBlockId: string | undefined,
    rootElementId: number,
    qualifierId: number,
    preferences: Row | undefined,
    description: string,
  ): Model => {
    const model: Model = {
      id: modelId,
      name: modelName,
      description: description.slice(0, 10_000),
      notation,
      blocks: [],
      flows: [],
      sheet: {
        ...defaultSheet(),
        author: (preferences?.PROJECT_AUTOR ?? '').slice(0, 256),
        createdAt: dateText(preferences?.CREATE_DATE),
        revisedAt: dateText(preferences?.CHANGE_DATE),
        usedAt: (preferences?.USED_AT ?? '').slice(0, 256),
        notes: (preferences?.DEFINITION ?? description).slice(0, 256),
        number: (preferences?.MODEL_LETTER ?? '').slice(0, 256),
      },
    };
    if (parentBlockId) model.parentBlockId = parentBlockId;
    for (const functionId of functionIds) {
      const blockId = `ramus-block-${functionId}`;
      const block = makeBlock(functionId, notation, blockId);
      model.blocks.push(block);
      functionToBlock.set(functionId, { modelId, blockId });
      functionByBlock.set(blockId, functionId);
    }
    models.push(model);
    rootElementByModel.set(modelId, rootElementId);
    for (const functionId of functionIds) {
      const childIds = childrenOf(qualifierId, functionId);
      if (childIds.length === 0) continue;
      const decomposition = integerValue(
        rowsOf(context, 'IDEF0/attribute_decomposition_types', functionId, 29)[0]?.TYPE,
      );
      const inferred = decomposition === 1 ? 'DFD' : 'IDEF0';
      const childNotation: 'IDEF0' | 'DFD' = inferred === notation ? inferred : notation;
      if (inferred !== notation) {
        warnings.push(
          `Декомпозиция «${elementName(context, functionId)}» в Ramus имеет нотацию ${inferred}, но родительская модель — ${notation}. Использована нотация родительской модели.`,
        );
      }
      addModel(
        `ramus-model-${functionId}`,
        elementName(context, functionId),
        childNotation,
        childIds,
        `ramus-block-${functionId}`,
        rootElementId,
        qualifierId,
        preferences,
        '',
      );
    }
    return model;
  };

  let projectName = 'Проект Ramus';
  let projectDescription = '';
  let projectPreferences: Row | undefined;
  roots.forEach((root, index) => {
    const functionIds = childrenOf(root.qualifierId, root.elementId);
    const decomposition =
      root.elementId >= 0
        ? integerValue(
            rowsOf(context, 'IDEF0/attribute_decomposition_types', root.elementId, 29)[0]?.TYPE,
          )
        : undefined;
    const notation: 'IDEF0' | 'DFD' = decomposition === 1 ? 'DFD' : 'IDEF0';
    const qualifier = qualifiers.get(root.qualifierId);
    const preferences = root.preferences;
    if (index === 0) {
      projectName = safeName(preferences?.PROJECT_NAME ?? '', qualifier?.name ?? 'Проект Ramus');
      projectDescription = (preferences?.DEFINITION ?? '').slice(0, 10_000);
      projectPreferences = preferences;
    }
    const name = safeName(
      preferences?.PROJECT_NAME ?? '',
      qualifier?.name ?? `Модель ${index + 1}`,
    );
    addModel(
      root.elementId >= 0 ? `ramus-model-${root.elementId}` : `ramus-model-${root.qualifierId}`,
      name,
      notation,
      functionIds,
      undefined,
      root.elementId,
      root.qualifierId,
      preferences,
      preferences?.DEFINITION ?? '',
    );
  });

  const classifierQualifierIds = new Set<number>();
  for (const [id, qualifier] of qualifiers) {
    if (
      qualifier.system ||
      usedFunctionQualifiers.has(id) ||
      id === 6 ||
      id === 7 ||
      id === 8 ||
      id === 9
    )
      continue;
    classifierQualifierIds.add(id);
  }
  const importedClassifierElements = new Set<number>();
  for (const [id, element] of elements) {
    if (classifierQualifierIds.has(element.qualifier)) importedClassifierElements.add(id);
  }

  let flowIndex = 0;
  const usedPositions = new Map<string, number[]>();
  const anyToAny = tables.get('IDEF0/attribute_any_to_any_elements')?.rows ?? [];
  const attachedObjects = new Map<number, number[]>();
  for (const row of anyToAny) {
    if (row.ATTRIBUTE_ID !== '43') continue;
    const stream = integerValue(row.ELEMENT_ID);
    const object = integerValue(row.OTHER_ELEMENT);
    if (stream === undefined || object === undefined) continue;
    const list = attachedObjects.get(stream);
    if (list) list.push(object);
    else attachedObjects.set(stream, [object]);
  }

  const findParentFlow = (model: Model, entering: boolean, name: string): Flow | undefined => {
    if (!model.parentBlockId) return undefined;
    const parent = models.find((candidate) =>
      candidate.blocks.some((block) => block.id === model.parentBlockId),
    );
    if (!parent) return undefined;
    const candidates = parent.flows.filter((flow) =>
      entering ? flow.targetId === model.parentBlockId : flow.sourceId === model.parentBlockId,
    );
    return candidates.find((flow) => flow.name === name) ?? candidates[0];
  };

  for (const model of models) {
    const owner = model.parentBlockId
      ? functionByBlock.get(model.parentBlockId)
      : rootElementByModel.get(model.id);
    if (owner === undefined) continue;
    const diagramSectors = sectors.filter((sector) => sector.owner === owner);
    const frame = diagramFrame(model.blocks, diagramSectors);
    model.pageWidth = clamp(Math.max(816, frame.right - frame.left + 30), 600, 4000);
    model.pageHeight = clamp(Math.max(612, frame.bottom - frame.top + 182), 400, 4000);
    const byStream = new Map<number, ImportSector[]>();
    for (const sector of diagramSectors) {
      const list = byStream.get(sector.stream);
      if (list) list.push(sector);
      else byStream.set(sector.stream, [sector]);
    }
    const externalBlocks = new Map<number, string>();
    for (const [streamId, streamSectors] of byStream) {
      const name = streamName(context, streamId);
      const nodes = new Map<string, { sector: ImportSector; side: 'start' | 'end' }[]>();
      const nodeOf = (sector: ImportSector, side: 'start' | 'end') => {
        const border = side === 'start' ? sector.start : sector.end;
        if (border.borderType >= 0) return `b:${sector.id}:${side}`;
        if (border.function >= 0) return `f:${border.function}`;
        if (border.crosspoint >= 0) return `c:${border.crosspoint}`;
        return `b:${sector.id}:${side}`;
      };
      const connect = (from: string, to: string, sector: ImportSector, side: 'start' | 'end') => {
        const list = nodes.get(from);
        if (list) list.push({ sector, side });
        else nodes.set(from, [{ sector, side }]);
      };
      for (const sector of streamSectors) {
        const start = nodeOf(sector, 'start');
        const end = nodeOf(sector, 'end');
        connect(start, end, sector, 'end');
        connect(end, start, sector, 'start');
      }
      const terminals = new Map<
        string,
        { sector: ImportSector; side: 'start' | 'end'; border: ImportBorder }[]
      >();
      for (const sector of streamSectors) {
        for (const side of ['start', 'end'] as const) {
          const border = side === 'start' ? sector.start : sector.end;
          if (border.function >= 0 || border.borderType >= 0) {
            const key = nodeOf(sector, side);
            const list = terminals.get(key);
            if (list) list.push({ sector, side, border });
            else terminals.set(key, [{ sector, side, border }]);
          }
        }
      }
      const seenPaths = new Set<string>();
      for (const [startNode, startTerminals] of terminals)
        for (const startTerminal of startTerminals) {
          if (startTerminal.side !== 'start') continue;
          const pathParts: { sector: ImportSector; reversed: boolean }[] = [];
          const used = new Set<number>();
          const walk = (node: string, depth: number) => {
            if (depth > 64) return;
            for (const edge of nodes.get(node) ?? []) {
              if (used.has(edge.sector.id)) continue;
              used.add(edge.sector.id);
              pathParts.push({ sector: edge.sector, reversed: edge.side === 'start' });
              const other = nodeOf(edge.sector, edge.side);
              const terminalList = terminals.get(other) ?? [];
              if (terminalList.length > 0) {
                for (const terminal of terminalList) {
                  const reversed = startTerminal.side === 'end' && terminal.side === 'start';
                  const orderedParts = (reversed ? [...pathParts].reverse() : pathParts).map(
                    (part) => ({
                      ...part,
                      reversed: reversed ? !part.reversed : part.reversed,
                    }),
                  );
                  const ordered = orderedParts.map((part) => part.sector);
                  const orientedPoints = orderedParts.flatMap((part) =>
                    part.reversed ? [...part.sector.points].reverse() : part.sector.points,
                  );
                  const pathKey =
                    [...ordered.map((sector) => sector.id)].sort((a, b) => a - b).join('-') +
                    `:${startNode}:${other}:${reversed ? 1 : 0}`;
                  if (!seenPaths.has(pathKey)) {
                    seenPaths.add(pathKey);
                    const source = reversed ? terminal : startTerminal;
                    const target = reversed ? startTerminal : terminal;
                    if (source.side === 'start' && target.side === 'end') {
                      const sourceBorder = source.border;
                      const targetBorder = target.border;
                      const sourceBlock =
                        sourceBorder.function >= 0
                          ? functionToBlock.get(sourceBorder.function)
                          : undefined;
                      const targetBlock =
                        targetBorder.function >= 0
                          ? functionToBlock.get(targetBorder.function)
                          : undefined;
                      const sourceInModel = sourceBlock?.modelId === model.id;
                      const targetInModel = targetBlock?.modelId === model.id;
                      const startPoint = orientedPoints[0];
                      const endPoint = orientedPoints[orientedPoints.length - 1] ?? startPoint;
                      let sourceId = sourceInModel ? sourceBlock?.blockId : undefined;
                      let targetId = targetInModel ? targetBlock?.blockId : undefined;
                      let sourceSide: PortSide =
                        sourceBorder.function >= 0
                          ? (functionTypeToSide[sourceBorder.functionType] ?? 'right')
                          : (functionTypeToSide[sourceBorder.borderType] ?? 'left');
                      let targetSide: PortSide =
                        targetBorder.function >= 0
                          ? (functionTypeToSide[targetBorder.functionType] ?? 'left')
                          : (functionTypeToSide[targetBorder.borderType] ?? 'right');
                      if (model.notation === 'IDEF0') {
                        if (sourceId) sourceSide = 'right';
                        else if (!['left', 'top', 'bottom'].includes(sourceSide))
                          sourceSide = 'left';
                        if (targetId && !['left', 'top', 'bottom'].includes(targetSide))
                          targetSide = 'left';
                        else if (!targetId) targetSide = 'right';
                      }
                      if (!sourceId && !targetId) continue;
                      if (sourceId && targetId && sourceId === targetId) continue;
                      if (
                        model.notation === 'DFD' &&
                        (!sourceId || !targetId) &&
                        !model.parentBlockId
                      ) {
                        const missing = !sourceId ? 'source' : 'target';
                        let external = externalBlocks.get(streamId);
                        if (!external) {
                          external = `ramus-external-${model.id}-${streamId}`;
                          externalBlocks.set(streamId, external);
                          const anchor = model.blocks.find(
                            (block) => block.id === (targetId ?? sourceId),
                          );
                          model.blocks.push({
                            id: external,
                            name,
                            description: '',
                            x: clamp(
                              (anchor?.x ?? 300) + (missing === 'source' ? -240 : 280),
                              0,
                              1800,
                            ),
                            y: clamp(anchor?.y ?? 120, 0, 1900),
                            width: 170,
                            height: 70,
                            kind: 'external',
                          });
                        }
                        if (!sourceId) sourceId = external;
                        else targetId = external;
                      }
                      if (!sourceId && !targetId) continue;
                      const sourceRect = model.blocks.find((block) => block.id === sourceId);
                      const targetRect = model.blocks.find((block) => block.id === targetId);
                      if (
                        model.notation === 'DFD' &&
                        sourceRect &&
                        targetRect &&
                        (sourceRect.kind ?? 'process') !== 'process' &&
                        (targetRect.kind ?? 'process') !== 'process'
                      ) {
                        warnings.push(
                          `Поток «${name}» соединяет две внешние сущности DFD и пропущен.`,
                        );
                        continue;
                      }
                      if (sourceBorder.function >= 0 && sourceRect) {
                        sourceSide =
                          model.notation === 'IDEF0'
                            ? 'right'
                            : pointSide(sourceRect, startPoint, sourceSide);
                      }
                      if (targetBorder.function >= 0 && targetRect) {
                        targetSide =
                          model.notation === 'IDEF0'
                            ? ['left', 'top', 'bottom'].includes(targetSide)
                              ? targetSide
                              : 'left'
                            : pointSide(targetRect, endPoint, targetSide);
                      }
                      let parentFlowId: string | undefined;
                      if ((!sourceId || !targetId) && model.parentBlockId) {
                        const entering = !sourceId;
                        const parentFlow = findParentFlow(model, entering, name);
                        if (parentFlow) {
                          parentFlowId = parentFlow.id;
                          if (entering) {
                            sourceSide =
                              model.notation === 'DFD'
                                ? 'left'
                                : ['left', 'top', 'bottom'].includes(
                                      parentFlow.targetSide ?? 'left',
                                    )
                                  ? (parentFlow.targetSide ?? 'left')
                                  : 'left';
                          } else {
                            targetSide = 'right';
                          }
                        } else if (model.notation === 'DFD') {
                          continue;
                        }
                      }
                      const sourcePosition = reservePosition(
                        usedPositions,
                        `${model.id}|src|${sourceId ?? 'boundary'}|${sourceSide}`,
                        sourceRect
                          ? positionOnSide(sourceRect, sourceSide, startPoint)
                          : boundaryPosition(sourceSide, startPoint, frame),
                      );
                      const targetPosition = reservePosition(
                        usedPositions,
                        `${model.id}|tgt|${targetId ?? 'boundary'}|${targetSide}`,
                        targetRect
                          ? positionOnSide(targetRect, targetSide, endPoint)
                          : boundaryPosition(targetSide, endPoint, frame),
                      );
                      const routePoints = simplifyPolyline(orientedPoints);
                      const waypoints = routePoints
                        .slice(1, -1)
                        .map((point) => ({
                          x: clamp(point.x, 0, 2000),
                          y: clamp(point.y, 0, 2000),
                        }))
                        .slice(0, 32);
                      let labelX: number | undefined;
                      let labelY: number | undefined;
                      for (const sector of ordered) {
                        const property = rowsOf(
                          context,
                          'IDEF0/attribute_sector_properties',
                          sector.id,
                          38,
                        )[0];
                        if (property?.SHOW_TEXT === '0') continue;
                        const x = numberValue(property?.TEXT_X);
                        const y = numberValue(property?.TEXT_Y);
                        if (
                          x !== undefined &&
                          y !== undefined &&
                          (x !== 0 || y !== 0) &&
                          x >= 0 &&
                          y >= 0 &&
                          x <= 2000 &&
                          y <= 2000
                        ) {
                          labelX = x;
                          labelY = y;
                          break;
                        }
                      }
                      const objects = (attachedObjects.get(streamId) ?? []).filter((id) =>
                        importedClassifierElements.has(id),
                      );
                      const flow: Flow = {
                        id: `ramus-flow-${streamId}-${flowIndex++}`,
                        name,
                        sourceId: sourceId ?? null,
                        targetId: targetId ?? null,
                        sourceSide,
                        targetSide,
                        sourcePosition,
                        targetPosition,
                      };
                      if (waypoints.length) flow.waypoints = waypoints;
                      if (labelX !== undefined && labelY !== undefined) {
                        flow.labelX = clamp(labelX - offsetX, 0, 2000);
                        flow.labelY = clamp(labelY - offsetY, 0, 2000);
                      }
                      if (objects.length)
                        flow.objectIds = objects.map((id) => `ramus-element-${id}`);
                      if (parentFlowId) flow.parentFlowId = parentFlowId;
                      model.flows.push(flow);
                    }
                  }
                }
              } else if (!other.startsWith('f:') && !other.startsWith('b:')) {
                walk(other, depth + 1);
              }
              pathParts.pop();
              used.delete(edge.sector.id);
            }
          };
          walk(startNode, 0);
        }
    }
  }

  for (const model of models) {
    const seenLabels = new Set<string>();
    for (const flow of model.flows) {
      if (flow.labelX === undefined || flow.labelY === undefined) continue;
      const key = `${flow.name}|${Math.round(flow.labelX * 10)}|${Math.round(flow.labelY * 10)}`;
      if (seenLabels.has(key)) flow.hideLabel = true;
      else seenLabels.add(key);
    }
  }

  const qualifiersResult: Qualifier[] = [];
  for (const [id, qualifier] of qualifiers) {
    if (!classifierQualifierIds.has(id)) continue;
    const qualifierElements = [...elements.entries()]
      .filter(([, value]) => value.qualifier === id)
      .map(([elementId]) => ({
        id: `ramus-element-${elementId}`,
        name: elementName(context, elementId),
        description: '',
      }));
    qualifiersResult.push({
      id: `ramus-qualifier-${id}`,
      name: safeName(qualifier.name, `Классификатор ${id}`),
      description: '',
      elements: qualifierElements,
    });
  }

  const project: Project = {
    format: 'tamus-project',
    schemaVersion: 1,
    id: `ramus-project-${Date.now()}`,
    name: safeName(projectName, 'Проект Ramus'),
    description: projectDescription,
    models,
    qualifiers: qualifiersResult,
  };
  for (const model of project.models) {
    if (!model.parentBlockId && model.sheet) {
      if (model.notation === 'DFD') {
        const processes = model.blocks.filter(
          (block) => (block.kind ?? 'process') === 'process',
        ).length;
        model.sheet.node = processes <= 1 ? 'Контекст' : '0';
        model.sheet.context = 'ВЕРХ';
      } else if (model.sheet.node !== 'A-0') {
        model.sheet.node = model.blocks.length === 1 ? 'A-0' : 'A0';
        model.sheet.context = 'ВЕРХ';
      }
    }
  }

  const report: RamusImportReport = {
    models: project.models.length,
    blocks: project.models.reduce((sum, model) => sum + model.blocks.length, 0),
    flows: project.models.reduce((sum, model) => sum + model.flows.length, 0),
    qualifiers: project.qualifiers.length,
    elements: project.qualifiers.reduce((sum, qualifier) => sum + qualifier.elements.length, 0),
    skipped: [],
    warnings,
    unknownTables,
  };
  if (report.blocks === 0) report.warnings.push('В файле не найдено функциональных блоков.');
  if (projectPreferences && !projectPreferences.PROJECT_NAME) {
    report.warnings.push('У модели нет названия в настройках Ramus.');
  }
  return { project, report };
}

const colorInteger = (value: string | undefined): string | undefined => {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return undefined;
  const rgb = parseInt(value.slice(1), 16);
  return String(0xff000000 | rgb | 0);
};

const flowName = (project: Project, flow: Flow) => {
  const direct = flow.caption?.trim() || flow.name.trim();
  if (direct) return direct;
  const objects = (flow.objectIds ?? [])
    .map((id) => {
      for (const qualifier of project.qualifiers) {
        if (qualifier.id === id) return qualifier.name;
        const element = qualifier.elements.find((item) => item.id === id);
        if (element) return element.name;
      }
      return '';
    })
    .filter(Boolean);
  return objects.length > 0 ? objects.join('; ') : 'Поток';
};

const formatProperties = (entries: Record<string, string | number>) => {
  const escape = (value: string | number) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">
<properties>
<comment>Ramus file metadata</comment>
${Object.entries(entries)
  .map(([key, value]) => `<entry key="${escape(key)}">${escape(value)}</entry>`)
  .join('\n')}
</properties>`;
};

const RAMUS_MARGIN = 7;

const orthogonalExportRoute = (
  points: { x: number; y: number }[],
  sourceSide: PortSide,
  targetSide: PortSide,
) => {
  if (points.length === 0) return points;
  const result = [points[0]];
  let horizontal = sourceSide === 'left' || sourceSide === 'right';
  for (let index = 1; index < points.length; index++) {
    const previous = result[result.length - 1];
    const next = points[index];
    if (previous.x === next.x && previous.y === next.y) continue;
    if (previous.x === next.x || previous.y === next.y) {
      result.push(next);
      horizontal = previous.y === next.y;
      continue;
    }
    const last = index === points.length - 1;
    const firstHorizontal = last ? !(targetSide === 'left' || targetSide === 'right') : horizontal;
    result.push(
      firstHorizontal ? { x: next.x, y: previous.y } : { x: previous.x, y: next.y },
      next,
    );
    horizontal = !firstHorizontal;
  }
  return result;
};

export async function exportRamusRsf(project: Project): Promise<RamusExportResult> {
  const rows = new Map<string, Row[]>();
  for (const key of Object.keys(SCHEMAS)) rows.set(key, []);
  const add = (key: string, row: Row) => {
    const list = rows.get(key);
    if (list) list.push(row);
  };

  for (const [id, name, plugin, type, comparable, system] of STANDARD_ATTRIBUTES) {
    add('attributes', {
      ATTRIBUTE_ID: String(id),
      ATTRIBUTE_NAME: name,
      ATTRIBUTE_TYPE_PLUGIN_NAME: plugin,
      ATTRIBUTE_TYPE_NAME: type,
      ATTRIBUTE_TYPE_COMPARABLE: bool(comparable),
      ATTRIBUTE_SYSTEM: bool(system),
      CREATED_BRANCH_ID: '0',
      REMOVED_BRANCH_ID: '2147483647',
    });
  }
  for (const [id, name, system, nameAttribute] of STANDARD_QUALIFIERS) {
    add('qualifiers', {
      QUALIFIER_ID: String(id),
      QUALIFIER_NAME: name,
      QUALIFIER_SYSTEM: bool(system),
      ATTRIBUTE_FOR_NAME: String(nameAttribute),
      CREATED_BRANCH_ID: '0',
      REMOVED_BRANCH_ID: '2147483647',
    });
  }
  const qualifierPositions = new Map<number, number>();
  for (const [qualifierId, attributeId, system] of STANDARD_QUALIFIER_ATTRIBUTES) {
    const position = qualifierPositions.get(qualifierId) ?? 0;
    qualifierPositions.set(qualifierId, position + 1);
    add('qualifiers_attributes', {
      QUALIFIER_ID: String(qualifierId),
      ATTRIBUTE_ID: String(attributeId),
      ATTRIBUTE_SYSTEM: bool(system),
      ATTRIBUTE_POSITION: String(position),
      CREATED_BRANCH_ID: '0',
    });
  }
  add('Core/attribute_other_element_properties', {
    ATTRIBUTE: '36',
    QUALIFIER: '6',
    QUALIFIER_ATTRIBUTE: '39',
    VALUE_BRANCH_ID: '0',
  });
  add('Core/attribute_element_list_properties', {
    ATTRIBUTE_ID: '5',
    CONNECTION_TYPES: '',
    QUALIFIER1: '2',
    QUALIFIER2: '3',
    VALUE_BRANCH_ID: '0',
  });

  let nextElement = 1000;
  let nextQualifier = 100;
  let nextCrosspoint = 1_000_000;
  let nextOrdinate = 2_000_000;
  let lastStream = -1;

  const addElement = (qualifierId: number, name = ''): number => {
    const id = nextElement++;
    add('elements', {
      ELEMENT_ID: String(id),
      ELEMENT_NAME: name,
      QUALIFIER_ID: String(qualifierId),
      CREATED_BRANCH_ID: '0',
      REMOVED_BRANCH_ID: '2147483647',
    });
    return id;
  };
  const addQualifier = (name: string): number => {
    const id = nextQualifier++;
    add('qualifiers', {
      QUALIFIER_ID: String(id),
      QUALIFIER_NAME: name,
      QUALIFIER_SYSTEM: 'FALSE',
      ATTRIBUTE_FOR_NAME: '55',
      CREATED_BRANCH_ID: '0',
      REMOVED_BRANCH_ID: '2147483647',
    });
    return id;
  };
  const addQualifierAttribute = (qualifierId: number, attributeId: number, system: boolean) => {
    const position = qualifierPositions.get(qualifierId) ?? 0;
    qualifierPositions.set(qualifierId, position + 1);
    add('qualifiers_attributes', {
      QUALIFIER_ID: String(qualifierId),
      ATTRIBUTE_ID: String(attributeId),
      ATTRIBUTE_SYSTEM: bool(system),
      ATTRIBUTE_POSITION: String(position),
      CREATED_BRANCH_ID: '0',
    });
  };
  const addHierarchy = (elementId: number, parent: number, previous: number) => {
    add('Core/attribute_hierarchicals', {
      ATTRIBUTE_ID: '1',
      ELEMENT_ID: String(elementId),
      ICON_ID: '-1',
      PARENT_ELEMENT_ID: String(parent),
      PREVIOUS_ELEMENT_ID: String(previous),
      VALUE_BRANCH_ID: '0',
    });
  };
  const addText = (elementId: number, attributeId: number, value: string) => {
    add('Core/attribute_texts', {
      ATTRIBUTE_ID: String(attributeId),
      ELEMENT_ID: String(elementId),
      VALUE: value,
      VALUE_BRANCH_ID: '0',
    });
  };
  const addLong = (elementId: number, attributeId: number, value: number) => {
    add('Core/attribute_longs', {
      ATTRIBUTE_ID: String(attributeId),
      ELEMENT_ID: String(elementId),
      VALUE: String(value),
      VALUE_BRANCH_ID: '0',
    });
  };
  const addOtherElement = (elementId: number, attributeId: number, other: number) => {
    add('Core/attribute_other_elements', {
      ATTRIBUTE_ID: String(attributeId),
      ELEMENT_ID: String(elementId),
      OTHER_ELEMENT: String(other),
      VALUE_BRANCH_ID: '0',
    });
  };
  const addModelTree = (name: string, qualifierId: number) => {
    const element = addElement(9, name);
    addHierarchy(element, -1, -1);
    addText(element, 8, name);
    addLong(element, 6, qualifierId);
    return element;
  };

  const functionQualifier = (name: string) => {
    const id = addQualifier(name);
    for (const attributeId of FUNCTION_QUALIFIER_SYSTEM_ATTRIBUTES)
      addQualifierAttribute(id, attributeId, true);
    for (const attributeId of FUNCTION_QUALIFIER_USER_ATTRIBUTES)
      addQualifierAttribute(id, attributeId, false);
    addModelTree(name, id);
    return id;
  };

  const parentModelOf = (model: Model) =>
    project.models.find((candidate) =>
      candidate.blocks.some((block) => block.id === model.parentBlockId),
    );
  const childModelOf = (blockId: string) =>
    project.models.find((model) => model.parentBlockId === blockId);

  const blockElement = new Map<string, number>();
  const blockRect = new Map<string, { x: number; y: number; width: number; height: number }>();

  const addFunction = (
    block: Block,
    parentElement: number,
    previousElement: number,
    qualifierId: number,
    childNotation?: 'IDEF0' | 'DFD',
  ) => {
    const element = addElement(qualifierId, block.name);
    blockElement.set(block.id, element);
    blockRect.set(block.id, {
      x: block.x + RAMUS_MARGIN,
      y: block.y + RAMUS_MARGIN,
      width: block.width ?? 210,
      height: block.height ?? 110,
    });
    addHierarchy(element, parentElement, previousElement);
    addText(element, 55, block.name);
    add('IDEF0/attribute_rectangles', {
      ATTRIBUTE_ID: '24',
      ELEMENT_ID: String(element),
      HEIGHT: String(block.height ?? 110),
      WIDTH: String(block.width ?? 210),
      X: String(block.x + RAMUS_MARGIN),
      Y: String(block.y + RAMUS_MARGIN),
      VALUE_BRANCH_ID: '0',
    });
    add('IDEF0/attribute_function_types', {
      ATTRIBUTE_ID: '27',
      ELEMENT_ID: String(element),
      TYPE: String(block.kind === 'external' ? 1001 : block.kind === 'dataStore' ? 1002 : 1),
      VALUE_BRANCH_ID: '0',
    });
    const fontStyle = block.fontStyle ?? 'normal';
    const fontStyleCode =
      (fontStyle.includes('bold') ? 1 : 0) | (fontStyle.includes('italic') ? 2 : 0);
    add('IDEF0/attribute_fonts', {
      ATTRIBUTE_ID: '25',
      ELEMENT_ID: String(element),
      NAME: block.fontName ?? 'Dialog',
      SIZE: String(block.fontSize ?? 10),
      STYLE: String(fontStyleCode),
      VALUE_BRANCH_ID: '0',
    });
    add('IDEF0/attribute_statuses', {
      ATTRIBUTE_ID: '26',
      ELEMENT_ID: String(element),
      OTHER_NAME: '',
      TYPE: '0',
      VALUE_BRANCH_ID: '0',
    });
    add('IDEF0/attribute_visual_datas', {
      ATTRIBUTE_ID: '20',
      DATA: '8280808080808080',
      ELEMENT_ID: String(element),
      VALUE_BRANCH_ID: '0',
    });
    const fill = colorInteger(block.fillColor);
    const ink = colorInteger(block.textColor);
    if (fill)
      add('IDEF0/attribute_colors', {
        ATTRIBUTE_ID: '22',
        COLOR: fill,
        ELEMENT_ID: String(element),
        VALUE_BRANCH_ID: '0',
      });
    if (ink)
      add('IDEF0/attribute_colors', {
        ATTRIBUTE_ID: '23',
        COLOR: ink,
        ELEMENT_ID: String(element),
        VALUE_BRANCH_ID: '0',
      });
    if (childNotation === 'DFD')
      add('IDEF0/attribute_decomposition_types', {
        ATTRIBUTE_ID: '29',
        ELEMENT_ID: String(element),
        TYPE: '1',
        VALUE_BRANCH_ID: '0',
      });
    return element;
  };

  const addModelFunctions = (model: Model, parentElement: number, qualifierId: number) => {
    let previous = -1;
    for (const block of model.blocks) {
      const child = childModelOf(block.id);
      const element = addFunction(block, parentElement, previous, qualifierId, child?.notation);
      previous = element;
    }
    for (const block of model.blocks) {
      const child = childModelOf(block.id);
      if (child) addModelFunctions(child, blockElement.get(block.id)!, qualifierId);
    }
  };

  const rootElementByModel = new Map<string, number>();
  const flowInfo = new Map<string, { model: Model; flow: Flow }>();
  for (const model of project.models)
    for (const flow of model.flows) flowInfo.set(flow.id, { model, flow });

  const rootOf = (model: Model, flow: Flow): { model: Model; flow: Flow } => {
    let current: { model: Model; flow: Flow } = { model, flow };
    const visited = new Set<string>();
    while (current.flow.parentFlowId && !visited.has(current.flow.id)) {
      visited.add(current.flow.id);
      const parent = parentModelOf(current.model);
      if (!parent) break;
      const parentFlow = parent.flows.find((item) => item.id === current.flow.parentFlowId);
      if (!parentFlow) break;
      current = { model: parent, flow: parentFlow };
    }
    return current;
  };

  const roots = project.models.filter((model) => !model.parentBlockId);
  const rootModels = roots.length > 0 ? roots : [];
  rootModels.forEach((model, index) => {
    const qualifierId = functionQualifier(index === 0 ? 'Работы' : `Работы ${index + 1}`);
    const rootElement = addElement(8, model.name);
    rootElementByModel.set(model.id, rootElement);
    addHierarchy(rootElement, -1, -1);
    addLong(rootElement, 44, qualifierId);
    add('IDEF0/attribute_visual_datas', {
      ATTRIBUTE_ID: '20',
      DATA: '8280808080808080',
      ELEMENT_ID: String(rootElement),
      VALUE_BRANCH_ID: '0',
    });
    const background = colorInteger(model.backgroundColor);
    if (background)
      add('IDEF0/attribute_colors', {
        ATTRIBUTE_ID: '22',
        COLOR: background,
        ELEMENT_ID: String(rootElement),
        VALUE_BRANCH_ID: '0',
      });
    if (model.notation === 'DFD')
      add('IDEF0/attribute_decomposition_types', {
        ATTRIBUTE_ID: '29',
        ELEMENT_ID: String(rootElement),
        TYPE: '1',
        VALUE_BRANCH_ID: '0',
      });
    add('IDEF0/attribute_model_preferences', {
      ATTRIBUTE_ID: '45',
      CHANGE_DATE: isoDate(model.sheet?.revisedAt ?? ''),
      CREATE_DATE: isoDate(model.sheet?.createdAt ?? ''),
      DEFINITION: model.description || project.description,
      DIAGRAM_SIZE: 'A4',
      ELEMENT_ID: String(rootElement),
      MODEL_LETTER: model.sheet?.number ?? '',
      PROJECT_AUTOR: model.sheet?.author ?? '',
      PROJECT_NAME: model.name || project.name,
      TERM_ATTRIBUTE: '55',
      USED_AT: model.sheet?.usedAt ?? '',
      VALUE_BRANCH_ID: '0',
    });
    addModelFunctions(model, rootElement, qualifierId);
  });

  const objectElement = new Map<string, number>();
  for (const qualifier of project.qualifiers) {
    const qualifierId = addQualifier(qualifier.name || 'Классификатор');
    addQualifierAttribute(qualifierId, 1, true);
    addQualifierAttribute(qualifierId, 55, false);
    addModelTree(qualifier.name || 'Классификатор', qualifierId);
    let previous = -1;
    for (const element of qualifier.elements) {
      const ramusElement = addElement(qualifierId, element.name);
      objectElement.set(element.id, ramusElement);
      addHierarchy(ramusElement, -1, previous);
      addText(ramusElement, 55, element.name);
      previous = ramusElement;
    }
  }

  const streamByRoot = new Map<string, number>();
  const crosspoints = new Map<string, number>();
  const crosspoint = (key: string) => {
    const existing = crosspoints.get(key);
    if (existing !== undefined) return existing;
    const value = nextCrosspoint++;
    crosspoints.set(key, value);
    return value;
  };
  const streamAttachments = new Set<string>();
  const rootStream = (model: Model, flow: Flow) => {
    const root = rootOf(model, flow);
    const key = root.flow.id;
    let element = streamByRoot.get(key);
    if (element === undefined) {
      element = addElement(7, flowName(project, root.flow));
      addHierarchy(element, -1, lastStream);
      addText(element, 39, flowName(project, root.flow));
      lastStream = element;
      streamByRoot.set(key, element);
    }
    const objects = new Set([
      ...(root.flow.objectIds ?? []),
      ...(flow.id === root.flow.id ? [] : (flow.objectIds ?? [])),
    ]);
    for (const objectId of objects) {
      const target = objectElement.get(objectId);
      const attachmentKey = `${element}|${target}`;
      if (target === undefined || streamAttachments.has(attachmentKey)) continue;
      streamAttachments.add(attachmentKey);
      add('IDEF0/attribute_any_to_any_elements', {
        ATTRIBUTE_ID: '43',
        ELEMENT_ID: String(element),
        ELEMENT_STATUS: '',
        OTHER_ELEMENT: String(target),
        VALUE_BRANCH_ID: '0',
      });
    }
    return element;
  };

  const attachPoint = (
    rect: { x: number; y: number; width: number; height: number },
    side: PortSide,
    position: number,
  ) => {
    const p = clamp(position, 0.05, 0.95);
    return side === 'left'
      ? { x: rect.x, y: rect.y + rect.height * p }
      : side === 'right'
        ? { x: rect.x + rect.width, y: rect.y + rect.height * p }
        : side === 'top'
          ? { x: rect.x + rect.width * p, y: rect.y }
          : { x: rect.x + rect.width * p, y: rect.y + rect.height };
  };
  const edgePoint = (model: Model, side: PortSide, position: number) => {
    const width = Math.max(1, (model.pageWidth ?? 1050) - 30);
    const height = Math.max(1, (model.pageHeight ?? 742) - 182);
    const p = clamp(position, 0.05, 0.95);
    return side === 'left'
      ? { x: RAMUS_MARGIN, y: height * p + RAMUS_MARGIN }
      : side === 'right'
        ? { x: width + RAMUS_MARGIN, y: height * p + RAMUS_MARGIN }
        : side === 'top'
          ? { x: width * p + RAMUS_MARGIN, y: RAMUS_MARGIN }
          : { x: width * p + RAMUS_MARGIN, y: height + RAMUS_MARGIN };
  };

  for (const model of project.models) {
    const owner = model.parentBlockId
      ? blockElement.get(model.parentBlockId)
      : rootElementByModel.get(model.id);
    if (owner === undefined) continue;
    const parentModel = parentModelOf(model);
    for (const flow of model.flows) {
      const stream = rootStream(model, flow);
      const sector = addElement(6, '');
      addOtherElement(sector, 35, owner);
      addOtherElement(sector, 36, stream);
      const sourceSide = flow.sourceSide ?? (flow.sourceId ? 'right' : 'left');
      const targetSide = flow.targetSide ?? (flow.targetId ? 'left' : 'right');
      const sourceRect = flow.sourceId ? blockRect.get(flow.sourceId) : undefined;
      const targetRect = flow.targetId ? blockRect.get(flow.targetId) : undefined;
      const start = sourceRect
        ? attachPoint(sourceRect, sourceSide, flow.sourcePosition ?? 0.5)
        : edgePoint(model, sourceSide, flow.sourcePosition ?? 0.5);
      const end = targetRect
        ? attachPoint(targetRect, targetSide, flow.targetPosition ?? 0.5)
        : edgePoint(model, targetSide, flow.targetPosition ?? 0.5);
      const bodyWidth = Math.max(1, (model.pageWidth ?? 1050) - 30);
      const bodyHeight = Math.max(1, (model.pageHeight ?? 742) - 182);
      const manual = (flow.waypoints?.length ?? 0) > 0;
      const waypoints = (flow.waypoints ?? []).map((point) => ({
        x: clamp(point.x, 0, bodyWidth) + RAMUS_MARGIN,
        y: clamp(point.y, 0, bodyHeight) + RAMUS_MARGIN,
      }));
      const points = manual
        ? simplifyPolyline(
            orthogonalExportRoute([start, ...waypoints, end], sourceSide, targetSide),
          )
        : [start];
      if (!manual) {
        if (start.x !== end.x && start.y !== end.y) {
          const targetHorizontal = targetSide === 'left' || targetSide === 'right';
          points.push(targetHorizontal ? { x: start.x, y: end.y } : { x: end.x, y: start.y });
        }
        points.push(end);
      }

      const parentFlow =
        flow.parentFlowId && parentModel
          ? parentModel.flows.find((item) => item.id === flow.parentFlowId)
          : undefined;
      const sourceKey = flow.sourceId
        ? `${stream}|${model.id}|${flow.sourceId}|${sourceSide}|out`
        : parentFlow && parentModel && flow.sourceId === null
          ? `${stream}|${parentModel.id}|${model.parentBlockId}|${parentFlow.targetSide ?? 'left'}|in`
          : `${stream}|${model.id}|boundary|${sourceSide}|out|${flow.id}`;
      const targetKey = flow.targetId
        ? `${stream}|${model.id}|${flow.targetId}|${targetSide}|in`
        : parentFlow && parentModel && flow.targetId === null
          ? `${stream}|${parentModel.id}|${model.parentBlockId}|${parentFlow.sourceSide ?? 'right'}|out`
          : `${stream}|${model.id}|boundary|${targetSide}|in|${flow.id}`;
      const startCrosspoint = crosspoint(sourceKey);
      const endCrosspoint = crosspoint(targetKey);
      const startFunction = flow.sourceId ? (blockElement.get(flow.sourceId) ?? -1) : -1;
      const endFunction = flow.targetId ? (blockElement.get(flow.targetId) ?? -1) : -1;
      add('IDEF0/attribute_sector_borders', {
        ATTRIBUTE_ID: '41',
        BORDER_TYPE: startFunction >= 0 ? '-1' : String(sideToFunctionType[sourceSide]),
        CROSSPOINT: String(startCrosspoint),
        ELEMENT_ID: String(sector),
        FUNCTION: String(startFunction),
        FUNCTION_TYPE: startFunction >= 0 ? String(sideToFunctionType[sourceSide]) : '-1',
        TUNNEL_SOFT: '0',
        VALUE_BRANCH_ID: '0',
      });
      add('IDEF0/attribute_sector_borders', {
        ATTRIBUTE_ID: '42',
        BORDER_TYPE: endFunction >= 0 ? '-1' : String(sideToFunctionType[targetSide]),
        CROSSPOINT: String(endCrosspoint),
        ELEMENT_ID: String(sector),
        FUNCTION: String(endFunction),
        FUNCTION_TYPE: endFunction >= 0 ? String(sideToFunctionType[targetSide]) : '-1',
        TUNNEL_SOFT: '0',
        VALUE_BRANCH_ID: '0',
      });
      points.forEach((point, index) => {
        add('IDEF0/attribute_sector_points', {
          ATTRIBUTE_ID: '37',
          ELEMENT_ID: String(sector),
          POINT_TYPE: '-1',
          POSITION: String(index),
          X_ORDINATE_ID: String(nextOrdinate++),
          X_POSITION: String(point.x),
          Y_ORDINATE_ID: String(nextOrdinate++),
          Y_POSITION: String(point.y),
          VALUE_BRANCH_ID: '0',
        });
      });
      const labels = [points[0], points[points.length - 1]];
      const explicitLabel =
        flow.labelX !== undefined && flow.labelY !== undefined
          ? { x: flow.labelX, y: flow.labelY }
          : undefined;
      const label =
        explicitLabel ??
        (labels[0] && labels[1]
          ? { x: (labels[0].x + labels[1].x) / 2, y: (labels[0].y + labels[1].y) / 2 }
          : { x: start.x, y: start.y });
      add('IDEF0/attribute_sector_properties', {
        ATTRIBUTE_ID: '38',
        ELEMENT_ID: String(sector),
        SHOW_TEXT: '1',
        SHOW_TILDA: '0',
        TEXT_HIEGHT: '9.421875',
        TEXT_WIDTH: String(Math.max(12, flowName(project, flow).length * 7)),
        TEXT_X: String(label.x + (explicitLabel ? RAMUS_MARGIN : 0)),
        TEXT_Y: String(label.y + (explicitLabel ? RAMUS_MARGIN : 0)),
        TILDA_POS: '0',
        TRANSPARENT: '1',
        VALUE_BRANCH_ID: '0',
      });
      add('IDEF0/attribute_sectors', {
        ALTERNATIVE_TEXT: '',
        ATTRIBUTE_ID: '40',
        CREATE_POS: '0',
        CREATE_STATE: '-1',
        ELEMENT_ID: String(sector),
        SHOW_TEXT: '1',
        TEXT_ALIGMENT: '0',
        VISUAL_ATTRIBUTES: '',
        VALUE_BRANCH_ID: '0',
      });
    }
  }

  const sequences = formatProperties({
    crosspoint_sequence: nextCrosspoint,
    ordinates__sequence: nextOrdinate,
  });
  const metadata = formatProperties({
    ApplicationName: 'Ramus',
    ApplicationVersion: '2.0.2',
    FileOpenMinimumVersion: '2.0',
    PluginCount: 0,
  });

  const entries: ZipEntry[] = [
    { name: 'data/application_metadata.xml', data: encoder.encode(metadata) },
    { name: 'data/sequences.xml', data: encoder.encode(sequences) },
  ];
  const plainTables = Object.keys(SCHEMAS).filter((key) => !key.includes('/'));
  const persistentTables = Object.keys(SCHEMAS)
    .filter((key) => key.includes('/'))
    .sort();
  for (const key of [...plainTables, ...persistentTables]) {
    entries.push({
      name: `data/${key}.xml`,
      data: encoder.encode(
        tableXml({
          name: key.split('/').at(-1) ?? key,
          fields: schemaFields(key),
          rows: rows.get(key) ?? [],
        }),
      ),
    });
  }

  return {
    data: writeZip(entries),
    fileName: `${cleanFileName(project.name)}.rsf`,
    models: project.models.length,
    blocks: project.models.reduce((sum, model) => sum + model.blocks.length, 0),
    flows: project.models.reduce((sum, model) => sum + model.flows.length, 0),
    qualifiers: project.qualifiers.length,
  };
}
