import { afipSoapCall as unqualifiedSoapCall, ensureArray as toArray } from '@ramiidv/arca-common';
import type { CallOptions, ServiceTransport } from '@ramiidv/arca-common';
import { ENDPOINTS, PADRON_A5_NAMESPACE, PADRON_A13_NAMESPACE } from './constants.js';
import type { WsfeAuth, Contribuyente } from './types.js';
import { transportDe } from './wsfe.js';
import type { WsClientOptions } from './wsfe.js';

type R = Record<string, any>;

function nombreDe(p: R): string {
  if (p.razonSocial) return String(p.razonSocial);
  return [p.apellido, p.nombre].filter(Boolean).join(' ');
}

function domicilio(d: R | undefined): Contribuyente['domicilioFiscal'] {
  if (!d) return undefined;
  const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
  return {
    direccion: str(d.direccion),
    localidad: str(d.localidad),
    codPostal: str(d.codPostal ?? d.codigoPostal),
    tipoDomicilio: str(d.tipoDomicilio),
  };
}

/** Parsea `personaReturn` de Padrón A13 (`getPersona`). */
export function parsePersonaA13(result: R): Contribuyente {
  const persona: R = result.persona ?? result;
  const domicilios = toArray<R>(persona.domicilio);
  const fiscal = domicilios.find((d) => d.tipoDomicilio === 'FISCAL') ?? domicilios[0];

  return {
    cuit: Number(persona.idPersona ?? 0),
    nombre: nombreDe(persona),
    tipoPersona: persona.tipoPersona ?? '',
    estadoClave: persona.estadoClave ?? '',
    domicilioFiscal: domicilio(fiscal),
    raw: persona,
  };
}

/** Parsea `personaReturn` de la constancia de inscripción (`getPersona_v2`). */
export function parsePersonaA5(result: R): Contribuyente {
  const generales: R = result.datosGenerales ?? {};
  const error: R | undefined = result.errorConstancia;
  const impuestos = [
    ...toArray<R>(result.datosRegimenGeneral?.impuesto),
    ...toArray<R>(result.datosMonotributo?.impuesto),
  ].map((i) => ({
    id: Number(i.idImpuesto ?? 0),
    descripcion: String(i.descripcionImpuesto ?? ''),
    estado: String(i.estadoImpuesto ?? i.estado ?? ''),
  }));

  return {
    cuit: Number(generales.idPersona ?? error?.idPersona ?? 0),
    nombre: nombreDe(Object.keys(generales).length > 0 ? generales : (error ?? {})),
    tipoPersona: generales.tipoPersona ?? '',
    estadoClave: generales.estadoClave ?? '',
    domicilioFiscal: domicilio(generales.domicilioFiscal),
    impuestos,
    raw: result,
  };
}

/**
 * Cliente de Padrón incluido en arca-facturacion.
 *
 * @deprecated Usar `@ramiidv/arca-padron`, que cubre la constancia de
 * inscripción, A4, A10, A13 y A100 con tipos completos y helpers como
 * `condicionIvaDesdePadron`. Este cliente se mantiene por compatibilidad y se
 * va a quitar en una próxima major.
 */
export class PadronClient {
  private readonly endpoints: { padronA5: string; padronA13: string };
  private readonly transport: ServiceTransport;

  constructor(
    production: boolean,
    opts: Omit<WsClientOptions, 'endpoint'> & { endpoints?: { padronA5?: string; padronA13?: string } } = {},
  ) {
    const env = production ? 'production' : 'testing';
    this.endpoints = {
      padronA5: opts.endpoints?.padronA5 ?? ENDPOINTS.padronA5[env],
      padronA13: opts.endpoints?.padronA13 ?? ENDPOINTS.padronA13[env],
    };
    this.transport = transportDe(opts);
  }

  /**
   * Los WS de Padrón declaran sus parámetros sin namespace
   * (`elementFormDefault="unqualified"`), a diferencia de WSFE: se usa el
   * `afipSoapCall` de arca-common, que prefija el método y deja los
   * parámetros sin namespace. Orden según el WSDL: token, sign,
   * cuitRepresentada, idPersona.
   */
  private getPersona(
    endpoint: string,
    namespace: string,
    method: string,
    auth: WsfeAuth,
    cuit: number,
    opts?: CallOptions,
  ): Promise<Record<string, unknown>> {
    return unqualifiedSoapCall(
      endpoint,
      namespace,
      method,
      {
        token: auth.Token,
        sign: auth.Sign,
        cuitRepresentada: auth.Cuit,
        idPersona: cuit,
      },
      { ...this.transport, signal: opts?.signal },
    );
  }

  /**
   * Consulta datos de un contribuyente usando el padrón A13.
   * Requiere cert con acceso a `ws_sr_padron_a13`.
   */
  async getPersonaA13(auth: WsfeAuth, cuit: number, opts?: CallOptions): Promise<Contribuyente> {
    const result = await this.getPersona(
      this.endpoints.padronA13,
      PADRON_A13_NAMESPACE,
      'getPersona',
      auth,
      cuit,
      opts,
    );
    return parsePersonaA13(result);
  }

  /**
   * Consulta la constancia de inscripción (ex Padrón A5) de un contribuyente,
   * con domicilio fiscal e impuestos. Requiere cert con acceso a
   * `ws_sr_constancia_inscripcion`.
   */
  async getPersonaA5(auth: WsfeAuth, cuit: number, opts?: CallOptions): Promise<Contribuyente> {
    const result = await this.getPersona(
      this.endpoints.padronA5,
      PADRON_A5_NAMESPACE,
      'getPersona_v2',
      auth,
      cuit,
      opts,
    );
    return parsePersonaA5(result);
  }
}
