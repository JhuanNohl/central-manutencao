import {
  INVOICE_RULES_VERSION,
  isInvoiceAccepted,
  readIssuerDocument,
  validateInvoiceXml,
} from './invoice-xml.js';

const CUSTOMER = '11222333000181';
const FACTORY = '11444777000161';

/** Endereço fictício da fábrica, no formato da configuração. */
const FACTORY_ADDRESS = {
  street: 'Rua das Palmeiras',
  number: '100',
  district: 'Jardim São José',
  city: 'Cidade Exemplo',
  state: 'SP',
};

const enderDest = (street: string, city = 'CIDADE EXEMPLO') =>
  `<enderDest><xLgr>${street}</xLgr><nro>100</nro><xBairro>JARDIM SAO JOSE</xBairro><xMun>${city}</xMun><UF>SP</UF></enderDest>`;

function nfe(parts: {
  emit?: string;
  dest?: string;
  address?: string;
  nNF?: string;
  ns?: boolean;
}) {
  const ns =
    parts.ns === false ? '' : ' xmlns="http://www.portalfiscal.inf.br/nfe"';
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<nfeProc${ns}><NFe><infNFe Id="NFe1">
  <ide><serie>1</serie><nNF>${parts.nNF ?? '004521'}</nNF></ide>
  <emit><CNPJ>${parts.emit ?? CUSTOMER}</CNPJ><xNome>Cliente &amp; Cia</xNome></emit>
  ${parts.dest ? `<dest><CNPJ>${parts.dest}</CNPJ><xNome>Fábrica</xNome>${parts.address ?? ''}</dest>` : ''}
  <det nItem="1"><prod><CFOP>5915</CFOP></prod></det>
  <det nItem="2"><prod><CFOP>5915</CFOP></prod></det>
</infNFe></NFe></nfeProc>`);
}

describe('validateInvoiceXml', () => {
  it('lê a nota e aprova quando emitente e destinatário conferem', () => {
    const result = validateInvoiceXml(nfe({ dest: FACTORY }), {
      customerDocument: CUSTOMER,
      recipientDocument: FACTORY,
    });
    expect(result).toEqual({
      status: 'valido',
      rulesVersion: INVOICE_RULES_VERSION,
      issues: [],
      invoice: {
        number: '004521',
        series: '1',
        issuerName: 'Cliente & Cia',
        issuerDocument: CUSTOMER,
        recipientName: 'Fábrica',
        recipientDocument: FACTORY,
        recipientAddress: null,
        cfops: ['5915'],
      },
    });
    expect(isInvoiceAccepted(result)).toBe(true);
  });

  it('aponta cada divergência com a regra e os documentos envolvidos', () => {
    const result = validateInvoiceXml(
      nfe({ emit: '99999999000191', nNF: '' }),
      {
        customerDocument: CUSTOMER,
        recipientDocument: FACTORY,
      },
    );
    expect(result.status).toBe('com_divergencias');
    expect(result.issues.map((issue) => issue.rule)).toEqual([
      'numero_nota',
      'emitente_cliente',
      'destinatario_fabrica',
    ]);
    expect(result.issues[1].message).toBe(
      'O emitente da nota (99.999.999/0001-91) não é o cliente do atendimento (11.222.333/0001-81).',
    );
    expect(isInvoiceAccepted(result)).toBe(false);
  });

  it('sem CNPJ da fábrica configurado, não aplica a regra do destinatário', () => {
    const result = validateInvoiceXml(nfe({ ns: false }), {
      customerDocument: CUSTOMER,
    });
    expect(result.status).toBe('valido');
  });

  describe('endereço da fábrica no destinatário', () => {
    const expected = {
      customerDocument: CUSTOMER,
      recipientDocument: FACTORY,
      recipientAddress: FACTORY_ADDRESS,
    };

    it.each([
      'RUA DAS PALMEIRAS',
      'R. das Palmeiras',
      'R DAS PALMEIRAS',
      'GALPAO 01 - AREA 01 - R. DAS PALMEIRAS',
    ])('aceita a escrita "%s"', (street) => {
      const result = validateInvoiceXml(
        nfe({ dest: FACTORY, address: enderDest(street) }),
        expected,
      );
      expect(result.status).toBe('valido');
      expect(result.invoice?.recipientAddress?.street).toBe(street);
    });

    it('aponta o que diverge, sem impedir a abertura', () => {
      const result = validateInvoiceXml(
        nfe({
          dest: FACTORY,
          address: enderDest('ROD SP-010', 'Outra Cidade'),
        }),
        expected,
      );
      expect(result.status).toBe('com_divergencias');
      expect(result.issues).toEqual([
        {
          rule: 'endereco_fabrica',
          blocking: false,
          message:
            'O endereço do destinatário não confere com o da fábrica (Rua das Palmeiras, 100, Jardim São José, Cidade Exemplo/SP): logradouro "ROD SP-010", município "Outra Cidade".',
        },
      ]);
      expect(isInvoiceAccepted(result)).toBe(true);
    });

    it('nota sem o endereço do destinatário também diverge', () => {
      const result = validateInvoiceXml(nfe({ dest: FACTORY }), expected);
      expect(result.issues.map((issue) => issue.rule)).toEqual([
        'endereco_fabrica',
      ]);
    });

    it('sem endereço configurado, a regra não se aplica', () => {
      const result = validateInvoiceXml(
        nfe({ dest: FACTORY, address: enderDest('Outra rua') }),
        { customerDocument: CUSTOMER, recipientDocument: FACTORY },
      );
      expect(result.status).toBe('valido');
    });
  });

  it('lê o emitente da nota ou de uma carta de correção', () => {
    expect(readIssuerDocument(nfe({ dest: FACTORY }).toString())).toBe(
      CUSTOMER,
    );
    const correction = `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe"><evento><infEvento Id="ID1">
  <cOrgao>31</cOrgao><CNPJ>${CUSTOMER}</CNPJ><tpEvento>110110</tpEvento>
</infEvento></evento></procEventoNFe>`;
    expect(readIssuerDocument(correction)).toBe(CUSTOMER);
    expect(readIssuerDocument('<pedido><n>1</n></pedido>')).toBeNull();
  });

  it('distingue XML que não é NF-e de XML ilegível', () => {
    const other = validateInvoiceXml(Buffer.from('<pedido><n>1</n></pedido>'), {
      customerDocument: CUSTOMER,
    });
    expect(other.issues).toEqual([
      {
        rule: 'estrutura_nfe',
        message: 'O XML não é de uma NF-e (infNFe ausente).',
        blocking: true,
      },
    ]);
    const broken = validateInvoiceXml(Buffer.from('<a>'), {
      customerDocument: CUSTOMER,
    });
    expect(broken.issues[0].message).toBe('O arquivo não é um XML válido.');
  });

  it('não resolve entidades externas (XXE)', () => {
    const xxe = Buffer.from(
      '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><NFe><infNFe><emit><xNome>&e;</xNome></emit></infNFe></NFe>',
    );
    const result = validateInvoiceXml(xxe, { customerDocument: CUSTOMER });
    expect(result.invoice).toBeNull();
    expect(result.status).toBe('com_divergencias');
  });
});
