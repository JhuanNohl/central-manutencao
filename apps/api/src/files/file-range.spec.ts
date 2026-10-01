import { parseByteRange } from './file-range.js';

describe('parseByteRange', () => {
  it('lê o intervalo inicial, aberto e final', () => {
    expect(parseByteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=900-', 1000)).toEqual({
      start: 900,
      end: 999,
    });
    expect(parseByteRange('bytes=-100', 1000)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it('limita o fim ao tamanho do arquivo', () => {
    expect(parseByteRange('bytes=500-5000', 1000)).toEqual({
      start: 500,
      end: 999,
    });
  });

  it('ignora pedido ausente, inválido, múltiplo ou fora do arquivo', () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
    expect(parseByteRange('bytes=-', 1000)).toBeNull();
    expect(parseByteRange('bytes=0-1,5-9', 1000)).toBeNull();
    expect(parseByteRange('bytes=1000-', 1000)).toBeNull();
    expect(parseByteRange('items=0-1', 1000)).toBeNull();
  });
});
