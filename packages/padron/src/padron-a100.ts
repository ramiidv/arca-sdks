import { ArcaValidationError } from '@ramiidv/arca-common';
import type { CallOptions } from '@ramiidv/arca-common';
import { decode, list, must, obj, str, type Schema } from './mapping.js';
import { BasePadronClient, type PadronClientConfig } from './base-client.js';
import type { ParameterAttribute, ParameterRecord, WsAuth } from './types.js';

export type PadronA100ClientConfig = PadronClientConfig;

const METHOD = 'getParameterCollectionByName';

/** Respuesta (WSDL parameterServiceA100, orden del WSDL; los `must()` son los que el SDK exige). */
const ParameterCollectionReturnSchema: Schema = {
  parameterCollection: must(
    obj({
      name: str(),
      parameterList: list(
        obj({
          attributeList: list(obj({ name: must(str({ minLen: 1 })), value: str() })),
          description: must(str()),
          id: must(str({ minLen: 1 })),
        }),
      ),
    }),
  ),
};

interface ParameterCollectionReturn {
  parameterCollection: {
    name?: string;
    parameterList?: Array<{ attributeList?: ParameterAttribute[]; description: string; id: string }>;
  };
}

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

    const { parameterCollection } = decode<ParameterCollectionReturn>(
      result,
      ParameterCollectionReturnSchema,
      `${METHOD}.parameterCollectionReturn`,
    );
    return (parameterCollection.parameterList ?? []).map((p) => ({
      id: p.id,
      descripcion: p.description,
      atributos: p.attributeList?.length ? p.attributeList : undefined,
    }));
  }
}
