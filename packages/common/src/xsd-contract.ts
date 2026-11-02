/**
 * Tests de contrato: compara los schemas del DSL (`@ramiidv/arca-common/schema`)
 * contra los tipos del XSD de un WSDL oficial, para detectar elementos con otro
 * nombre, en otro orden, que faltan o con otra cardinalidad.
 *
 * Se exporta desde `@ramiidv/arca-common/testing`.
 *
 * @module
 */
import { XMLParser } from 'fast-xml-parser';
import type { Field, Schema } from './schema.js';

/** Elemento de una secuencia del XSD. */
export interface XsdElement {
  name: string;
  minOccurs: number;
  /** `Infinity` para `unbounded`. */
  maxOccurs: number;
  /** Tipo (nombre local, sin prefijo), si es un tipo con nombre. */
  type?: string;
  /** Tipo complejo anónimo declarado en el elemento. */
  inline?: XsdComplexType;
  /** El elemento es parte de un `xsd:choice`. */
  choice?: boolean;
  /** El elemento es parte de un `xsd:all` (sin orden). */
  all?: boolean;
}

/** Tipo complejo del XSD: sus elementos en orden. */
export interface XsdComplexType {
  elements: XsdElement[];
}

/** Tipos del XSD: complexTypes con nombre y elementos globales. */
export interface XsdTypes {
  complexTypes: Map<string, XsdComplexType>;
  /** Elementos globales (ej: los wrappers de cada operación). */
  elements: Map<string, XsdElement>;
}

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => ['schema', 'complexType', 'element', 'sequence', 'choice', 'all', 'extension'].includes(name),
});

const localName = (qname: string | undefined) => qname?.split(':').pop();
const occurs = (v: unknown, dflt: number) => (v === undefined ? dflt : v === 'unbounded' ? Infinity : Number(v));
const children = (node: XmlNode | undefined, name: string) => (node?.[name] as XmlNode[] | undefined) ?? [];

function readElement(node: XmlNode, choice: boolean, minOverride?: number, all = false): XsdElement {
  const inline = children(node, 'complexType')[0];
  return {
    name: String(node.name ?? localName(node.ref as string)),
    minOccurs: minOverride ?? occurs(node.minOccurs, 1),
    maxOccurs: occurs(node.maxOccurs, 1),
    type: localName(node.type as string | undefined) ?? localName(node.ref as string | undefined),
    inline: inline ? readComplexType(inline) : undefined,
    choice: choice || undefined,
    all: all || undefined,
  };
}

/** Elementos de una `sequence`/`choice`/`all` (con choices y sequences anidados). */
function readGroup(group: XmlNode, choice: boolean, all = false): XsdElement[] {
  const out: XsdElement[] = [];
  const groupMin = occurs(group.minOccurs, 1);
  // fast-xml-parser no conserva el orden entre elementos de distinto nombre
  // dentro del grupo (element vs choice); en los WSDL de ARCA los choices
  // anidados van al final o solos, así que se agregan después.
  for (const el of children(group, 'element')) {
    out.push(readElement(el, choice, choice || groupMin === 0 ? 0 : undefined, all));
  }
  for (const c of children(group, 'choice')) out.push(...readGroup(c, true));
  for (const s of children(group, 'sequence')) out.push(...readGroup(s, choice));
  return out;
}

function readComplexType(node: XmlNode): XsdComplexType {
  const elements: XsdElement[] = [];
  const content = children(node, 'complexContent' as never)[0] ?? (node.complexContent as XmlNode | undefined);
  const extension = children(content, 'extension')[0];
  const body = extension ?? node;
  if (extension?.base)
    elements.push({ name: `__base:${localName(extension.base as string)}`, minOccurs: 1, maxOccurs: 1 });
  for (const s of children(body, 'sequence')) elements.push(...readGroup(s, false));
  for (const c of children(body, 'choice')) elements.push(...readGroup(c, true));
  for (const a of children(body, 'all')) elements.push(...readGroup(a, false, true));
  return { elements };
}

/** Lee los tipos de uno o más documentos (WSDL con `wsdl:types` o XSD sueltos). */
export function loadXsdTypes(...documents: string[]): XsdTypes {
  const types: XsdTypes = { complexTypes: new Map(), elements: new Map() };
  for (const doc of documents) {
    const parsed = parser.parse(doc) as XmlNode;
    const definitions = parsed.definitions as XmlNode | undefined;
    const schemas = definitions ? children(definitions.types as XmlNode, 'schema') : children(parsed, 'schema');
    for (const schema of schemas) {
      for (const ct of children(schema, 'complexType')) types.complexTypes.set(String(ct.name), readComplexType(ct));
      for (const el of children(schema, 'element')) types.elements.set(String(el.name), readElement(el, false));
    }
  }
  // Resolver herencia (complexContent/extension): los elementos del tipo base van primero.
  const resolve = (t: XsdComplexType, seen = new Set<XsdComplexType>()): XsdElement[] => {
    if (seen.has(t)) return t.elements;
    seen.add(t);
    return t.elements.flatMap((e) => {
      if (!e.name.startsWith('__base:')) return [e];
      const base = types.complexTypes.get(e.name.slice(7));
      return base ? resolve(base, seen) : [];
    });
  };
  for (const t of types.complexTypes.values()) t.elements = resolve(t);
  return types;
}

/** Tipo complejo de un elemento (con nombre o anónimo). */
function complexTypeOf(el: XsdElement, types: XsdTypes): XsdComplexType | undefined {
  if (el.inline) return el.inline;
  if (!el.type) return undefined;
  const t = types.complexTypes.get(el.type);
  if (t) return t;
  const global = types.elements.get(el.type);
  return global && global !== el ? complexTypeOf(global, types) : undefined;
}

/** Opciones de `checkSchemaAgainstXsd`. */
export interface ContractOptions {
  /**
   * `request`: los elementos obligatorios del XSD tienen que estar en el schema
   * y no ser opcionales. `response`: el schema puede ignorar elementos (no los
   * decodifica) y ser más estricto (`must()` donde el XSD dice `minOccurs=0`).
   */
  direction: 'request' | 'response';
  /** Elementos del XSD que el SDK ignora a propósito (nombres del XML, con ruta: `a.b`). */
  ignore?: readonly string[];
}

/**
 * Compara un schema del DSL con un tipo del XSD (nombre de un complexType o de
 * un elemento global) y devuelve las diferencias (vacío si coinciden): nombres
 * que no existen en el XSD, orden distinto al de la `xsd:sequence`, elementos
 * obligatorios ausentes u opcionales en el schema, y listas que en el XSD no
 * se repiten (o al revés), y `xsd:choice` que no son `choice()` en el schema (o
 * al revés). Los elementos de un `xsd:all` no tienen orden. Recorre los
 * objetos anidados.
 */
export function checkSchemaAgainstXsd(
  schema: Schema,
  typeName: string,
  types: XsdTypes,
  options: ContractOptions,
): string[] {
  const type =
    types.complexTypes.get(typeName) ??
    (types.elements.has(typeName) ? complexTypeOf(types.elements.get(typeName)!, types) : undefined);
  if (!type) return [`${typeName}: no existe en el XSD`];
  const problems: string[] = [];
  compare(schema, type, typeName, types, options, problems, new Set());
  return problems;
}

function compare(
  schema: Schema,
  type: XsdComplexType,
  path: string,
  types: XsdTypes,
  options: ContractOptions,
  problems: string[],
  visiting: Set<XsdComplexType>,
): void {
  if (visiting.has(type)) return;
  visiting.add(type);
  const ignored = new Set(options.ignore ?? []);
  const byName = new Map(type.elements.map((e, i) => [e.name, { el: e, index: i }]));
  let lastIndex = -1;
  let lastName = '';

  for (const [key, field] of Object.entries(schema)) {
    const name = field.xml ?? key;
    const p = `${path}.${name}`;
    const match = byName.get(name);
    if (!match) {
      problems.push(`${p}: no existe en el XSD (elementos: ${type.elements.map((e) => e.name).join(', ')})`);
      continue;
    }
    const { el, index } = match;
    const ordered = !el.choice && !el.all;
    if (ordered && index < lastIndex) problems.push(`${p}: en el XSD va antes que ${lastName}`);
    if (ordered) {
      lastIndex = Math.max(lastIndex, index);
      lastName = name;
    }
    checkField(field, el, p, types, options, problems, visiting);
  }

  if (options.direction === 'request') {
    const names = new Set(Object.entries(schema).map(([k, f]) => f.xml ?? k));
    for (const el of type.elements) {
      const p = `${path}.${el.name}`;
      if (el.minOccurs >= 1 && !el.choice && !names.has(el.name) && !ignored.has(p.slice(p.indexOf('.') + 1))) {
        problems.push(`${p}: obligatorio en el XSD (minOccurs=${el.minOccurs}) y no está en el schema`);
      }
    }
  }
  visiting.delete(type);
}

function checkField(
  field: Field,
  el: XsdElement,
  path: string,
  types: XsdTypes,
  options: ContractOptions,
  problems: string[],
  visiting: Set<XsdComplexType>,
): void {
  const isList = field.minItems !== undefined;
  let itemType = complexTypeOf(el, types);
  let repeated = el.maxOccurs > 1;

  if (isList && field.wrap) {
    // Contenedor: <el><wrap/>...</el>.
    const item = itemType?.elements.find((e) => e.name === field.wrap);
    if (!item) {
      problems.push(`${path}: el contenedor no tiene el elemento ${field.wrap} en el XSD`);
      return;
    }
    repeated = item.maxOccurs > 1;
    if (!repeated) problems.push(`${path}.${field.wrap}: es una lista en el schema pero no se repite en el XSD`);
    itemType = complexTypeOf(item, types);
  } else if (isList && !repeated) {
    problems.push(`${path}: es una lista en el schema pero no se repite en el XSD (maxOccurs=1)`);
  } else if (!isList && repeated) {
    problems.push(`${path}: se repite en el XSD (maxOccurs=${el.maxOccurs}) pero no es una lista en el schema`);
  }

  if (options.direction === 'request' && field.optional && el.minOccurs >= 1 && !el.choice) {
    problems.push(`${path}: obligatorio en el XSD pero opcional en el schema`);
  }

  if (field.schema) {
    if (!itemType) problems.push(`${path}: es un objeto en el schema pero un tipo simple en el XSD`);
    else {
      const isChoice = itemType.elements.length > 0 && itemType.elements.every((e) => e.choice);
      if (isChoice && !field.choice) problems.push(`${path}: es un xsd:choice en el XSD; usar choice() en el schema`);
      if (!isChoice && field.choice) problems.push(`${path}: es choice() en el schema pero no un xsd:choice en el XSD`);
      compare(field.schema, itemType, path, types, options, problems, visiting);
    }
  } else if (itemType && itemType.elements.length > 0) {
    problems.push(`${path}: es un tipo complejo en el XSD pero un escalar en el schema`);
  }
}
