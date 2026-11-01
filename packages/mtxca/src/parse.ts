import { ArcaSoapError, ensureArray } from '@ramiidv/arca-common';
import type { SoapOperationKind } from '@ramiidv/arca-common';
import type { CodigoDescripcion } from './types.js';

export type R = Record<string, unknown>;

function scalar(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, '#text')) {
    return (value as R)['#text'];
  }
  return value;
}

/**
 * Lee campos de una respuesta parseada. Un campo obligatorio ausente o con
 * formato inesperado lanza `ArcaSoapError` (`uncertain` en emisiones: el
 * comprobante pudo haberse procesado aunque la respuesta no se pueda leer).
 */
export class ResponseReader {
  constructor(
    private readonly method: string,
    private readonly kind: SoapOperationKind,
  ) {}

  invalid(field: string, detail = 'falta el campo'): ArcaSoapError {
    return new ArcaSoapError(`Respuesta inválida de ${this.method}: ${detail} ${field}`, {
      uncertain: this.kind === 'emision',
    });
  }

  has(obj: R, key: string): boolean {
    const v = scalar(obj?.[key]);
    return v !== undefined && v !== null && v !== '';
  }

  str(obj: R, key: string, path = key): string {
    if (!this.has(obj, key)) throw this.invalid(path);
    return String(scalar(obj[key]));
  }

  optStr(obj: R, key: string): string | undefined {
    return this.has(obj, key) ? String(scalar(obj[key])) : undefined;
  }

  num(obj: R, key: string, path = key): number {
    if (!this.has(obj, key)) throw this.invalid(path);
    const n = Number(scalar(obj[key]));
    if (!Number.isFinite(n)) throw this.invalid(path, 'valor no numérico en');
    return n;
  }

  optNum(obj: R, key: string, path = key): number | undefined {
    return this.has(obj, key) ? this.num(obj, key, path) : undefined;
  }

  obj(obj: R, key: string, path = key): R {
    const v = obj?.[key];
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw this.invalid(path);
    return v as R;
  }

  optObj(obj: R, key: string): R | undefined {
    const v = obj?.[key];
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as R) : undefined;
  }

  /** Ítems `itemKey` de un contenedor (`ensureArray` sobre el hijo, no sobre el contenedor). */
  list(container: unknown, itemKey: string): R[] {
    if (container === null || typeof container !== 'object' || Array.isArray(container)) return [];
    return ensureArray((container as R)[itemKey]).filter((x): x is R => x !== null && typeof x === 'object');
  }

  /** Contenedor obligatorio en el XSD: si falta, lanza; si viene vacío, devuelve []. */
  requiredList(obj: R, containerKey: string, itemKey: string): R[] {
    if (!Object.hasOwn(obj ?? {}, containerKey) || obj[containerKey] === null) throw this.invalid(containerKey);
    return this.list(obj[containerKey], itemKey);
  }

  /** `ArrayCodigosDescripcionesType` (`codigoDescripcion[]`). */
  codigosDescripciones(container: unknown, path: string): CodigoDescripcion[] {
    return this.list(container, 'codigoDescripcion').map((cd, i) => this.codigoDescripcion(cd, `${path}[${i}]`));
  }

  codigoDescripcion(cd: R, path: string): CodigoDescripcion {
    return {
      codigo: this.num(cd, 'codigo', `${path}.codigo`),
      descripcion: this.str(cd, 'descripcion', `${path}.descripcion`),
    };
  }

  evento(result: R): CodigoDescripcion | undefined {
    const ev = this.optObj(result, 'evento');
    return ev ? this.codigoDescripcion(ev, 'evento') : undefined;
  }
}
