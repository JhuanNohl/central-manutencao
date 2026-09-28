/** Conteúdos mínimos reconhecidos pela verificação de arquivos. */
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
export const PDF = Buffer.from('%PDF-1.7\n% declaração de conteúdo\n');

/** NF-e fictícia com emitente, destinatário e CFOP informados. */
export function nfeXml(input: {
  number?: string;
  issuerDocument: string;
  recipientDocument?: string;
  cfop?: string;
}): Buffer {
  const recipient = input.recipientDocument
    ? `<dest><CNPJ>${input.recipientDocument}</CNPJ><xNome>Fábrica Fictícia</xNome></dest>`
    : '';
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe0000" versao="4.00">
    <ide><serie>1</serie><nNF>${input.number ?? '4521'}</nNF></ide>
    <emit><CNPJ>${input.issuerDocument}</CNPJ><xNome>Cliente &amp; Filhos Ltda.</xNome></emit>
    ${recipient}
    <det nItem="1"><prod><cProd>1</cProd><CFOP>${input.cfop ?? '5915'}</CFOP></prod></det>
  </infNFe></NFe>
</nfeProc>`);
}
