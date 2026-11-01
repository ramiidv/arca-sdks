import { describe, expect, it } from 'vitest';
import { choice, dec, int, list, must, obj, opt, str, wrapped, xml } from '../src/schema.js';
import { checkSchemaAgainstXsd, loadXsdTypes } from '../src/testing.js';

const WSDL = `<?xml version="1.0"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:tns="urn:t">
  <wsdl:types>
    <xs:schema targetNamespace="urn:t">
      <xs:element name="autorizar">
        <xs:complexType><xs:sequence>
          <xs:element name="auth" type="tns:Auth"/>
          <xs:element name="comprobante" type="tns:Comprobante"/>
        </xs:sequence></xs:complexType>
      </xs:element>
      <xs:complexType name="Auth"><xs:sequence>
        <xs:element name="token" type="xs:string"/>
        <xs:element name="sign" type="xs:string"/>
      </xs:sequence></xs:complexType>
      <xs:complexType name="Base"><xs:sequence>
        <xs:element name="ptoVta" type="xs:int"/>
      </xs:sequence></xs:complexType>
      <xs:complexType name="Comprobante"><xs:complexContent><xs:extension base="tns:Base"><xs:sequence>
        <xs:element name="importe" type="xs:decimal"/>
        <xs:element name="obs" type="xs:string" minOccurs="0"/>
        <xs:element name="items" type="tns:ArrayItems" minOccurs="0"/>
        <xs:element name="tributo" type="tns:Tributo" minOccurs="0" maxOccurs="unbounded"/>
      </xs:sequence></xs:extension></xs:complexContent></xs:complexType>
      <xs:complexType name="ArrayItems"><xs:sequence>
        <xs:element name="item" type="tns:Item" maxOccurs="unbounded"/>
      </xs:sequence></xs:complexType>
      <xs:complexType name="Item"><xs:sequence>
        <xs:element name="codigo" type="xs:string"/>
      </xs:sequence></xs:complexType>
      <xs:complexType name="Tributo"><xs:choice>
        <xs:element name="a" type="xs:string"/>
        <xs:element name="b" type="xs:string"/>
      </xs:choice></xs:complexType>
      <xs:complexType name="SinOrden"><xs:all>
        <xs:element name="x" type="xs:string"/>
        <xs:element name="y" type="xs:string"/>
      </xs:all></xs:complexType>
    </xs:schema>
  </wsdl:types>
</wsdl:definitions>`;

const types = loadXsdTypes(WSDL);
const Auth = { token: str(), sign: str() };
const Comprobante = {
  ptoVta: int(),
  importe: dec(2),
  obs: opt(str()),
  items: opt(wrapped('item', obj({ codigo: str() }))),
  tributos: xml('tributo', opt(list(choice({ a: str(), b: str() }), 0))),
};

describe('checkSchemaAgainstXsd', () => {
  it('un schema que coincide con el XSD no tiene diferencias (herencia, wrapped, choice, xml())', () => {
    expect(
      checkSchemaAgainstXsd({ auth: obj(Auth), comprobante: obj(Comprobante) }, 'autorizar', types, {
        direction: 'request',
      }),
    ).toEqual([]);
  });

  it('detecta nombre inexistente, orden distinto y obligatorio faltante', () => {
    const problems = checkSchemaAgainstXsd({ sign: str(), token: str(), firma: opt(str()) }, 'Auth', types, {
      direction: 'request',
    });
    expect(problems).toEqual([
      'Auth.token: en el XSD va antes que sign',
      expect.stringMatching(/^Auth\.firma: no existe en el XSD/),
    ]);
    expect(checkSchemaAgainstXsd({ token: str() }, 'Auth', types, { direction: 'request' })).toEqual([
      'Auth.sign: obligatorio en el XSD (minOccurs=1) y no está en el schema',
    ]);
  });

  it('en requests un obligatorio del XSD no puede ser opcional; en respuestas se puede omitir o exigir', () => {
    expect(checkSchemaAgainstXsd({ token: opt(str()), sign: str() }, 'Auth', types, { direction: 'request' })).toEqual([
      'Auth.token: obligatorio en el XSD pero opcional en el schema',
    ]);
    expect(checkSchemaAgainstXsd({ obs: must(str()) }, 'Comprobante', types, { direction: 'response' })).toEqual([]);
  });

  it('detecta listas que no se repiten y repetidos que no son lista', () => {
    const problems = checkSchemaAgainstXsd(
      { ptoVta: list(int()), importe: dec(2), tributo: opt(choice({ a: str() })) },
      'Comprobante',
      types,
      { direction: 'response' },
    );
    expect(problems).toEqual([
      expect.stringMatching(/ptoVta: es una lista en el schema pero no se repite/),
      expect.stringMatching(/tributo: se repite en el XSD .* pero no es una lista/),
    ]);
  });

  it('xsd:all no exige orden, pero sí los obligatorios', () => {
    expect(checkSchemaAgainstXsd({ y: str(), x: str() }, 'SinOrden', types, { direction: 'request' })).toEqual([]);
    expect(checkSchemaAgainstXsd({ y: str() }, 'SinOrden', types, { direction: 'request' })).toEqual([
      'SinOrden.x: obligatorio en el XSD (minOccurs=1) y no está en el schema',
    ]);
  });

  it('xsd:choice tiene que ser choice() en el schema (y al revés)', () => {
    expect(
      checkSchemaAgainstXsd({ tributo: list(obj({ a: opt(str()) }), 0) }, 'Comprobante', types, {
        direction: 'response',
      }),
    ).toEqual([expect.stringMatching(/tributo: es un xsd:choice en el XSD; usar choice\(\)/)]);
    expect(
      checkSchemaAgainstXsd({ items: opt(wrapped('item', choice({ codigo: str() }), 0)) }, 'Comprobante', types, {
        direction: 'response',
      }),
    ).toEqual([expect.stringMatching(/items: es choice\(\) en el schema pero no un xsd:choice/)]);
  });

  it('tipo inexistente', () => {
    expect(checkSchemaAgainstXsd({}, 'NoExiste', types, { direction: 'request' })).toEqual([
      'NoExiste: no existe en el XSD',
    ]);
  });
});
