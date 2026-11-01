import { ArcaValidationError } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { ArcaPadronError } from './errors.js';
import { optString, record, records as list, reqString, type SoapRecord as R } from './mapping.js';
import { BasePadronClient, type PadronClientConfig } from './base-client.js';
import type { ParameterRecord, WsAuth } from './types.js';

export type PadronA100ClientConfig = PadronClientConfig;

const METHOD = 'getParameterCollectionByName';

/**
 * Client for ws_sr_padron_a100 - Tablas de parámetros.
 *
 * `id`, `description`, `name` y `value` son `xs:string` en el WSDL y se
 * devuelven tal cual los envía ARCA (`"10.50"`, `"1E3"`, `"007"`): la
 * respuesta se parsea sin conversión a número (ver `BasePadronClient`).
 */
export class PadronA100Client extends BasePadronClient {
  /**
   * Tabla de parámetros por nombre de colección (ver `CollectionName`).
   * @param collectionName - Nombre de la colección (ej: "SUPA.E_PROVINCIA")
   * @returns los registros de la tabla (`[]` si ARCA devuelve la colección vacía)
   */
  async getParameterCollectionByName(
    auth: WsAuth,
    collectionName: string,
    opts?: CallOptions,
  ): Promise<ParameterRecord[]> {
    if (typeof collectionName !== 'string' || collectionName.trim() === '') {
      throw new ArcaValidationError(
        'collectionName es obligatorio',
        [{ field: 'collectionName', message: 'Indicá el nombre de la colección', value: collectionName }],
        'collectionName',
      );
    }

    const result = await this.call(METHOD, { ...this.authParams(auth), collectionName: collectionName.trim() }, opts);

    const collection = record(result['parameterCollection']);
    if (!collection) {
      throw new ArcaPadronError(`Respuesta inválida de ARCA (${METHOD}): falta parameterCollection`);
    }

    return list(collection['parameterList']).map((p: R) => {
      const atributos = list(p['attributeList']).map((a) => ({
        name: reqString(a['name'], 'attributeList.name'),
        value: optString(a['value']),
      }));
      const descripcion = optString(p['description']);
      if (descripcion === undefined) throw new ArcaPadronError(`Respuesta inválida de ARCA (${METHOD}): falta description`);
      return {
        id: reqString(p['id'], 'parameterList.id'),
        descripcion,
        atributos: atributos.length > 0 ? atributos : undefined,
      };
    });
  }
}
