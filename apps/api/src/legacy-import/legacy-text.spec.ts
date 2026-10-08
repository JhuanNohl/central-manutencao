import { describe, expect, it } from 'vitest';
import { plainTextOf, splitText } from './legacy-text.js';

describe('texto das mensagens do sistema anterior', () => {
  it('converte o HTML em texto, com as quebras de linha', () => {
    const html =
      '<p>Bom dia,</p><p>O equipamento <b>não liga</b>.<br>Segue&nbsp;a NF &amp; a foto.</p><ul><li>Item 1</li><li>Item 2</li></ul>';
    expect(plainTextOf(html, 'html')).toBe(
      'Bom dia,\nO equipamento não liga.\nSegue a NF & a foto.\n- Item 1\n- Item 2',
    );
  });

  it('remove scripts e estilos e decodifica entidades numéricas', () => {
    expect(
      plainTextOf(
        '<style>p{}</style>Olá&#33; &#x2014; ok<script>x()</script>',
        'html',
      ),
    ).toBe('Olá! — ok');
  });

  it('mantém o texto simples como está, sem espaços sobrando', () => {
    expect(plainTextOf('Linha 1  \r\n\r\n\r\nLinha 2', 'text')).toBe(
      'Linha 1\n\nLinha 2',
    );
  });

  it('divide o texto longo sem perder conteúdo', () => {
    const text = 'palavra '.repeat(600).trim();
    const parts = splitText(text, 2000);
    expect(parts.length).toBe(3);
    expect(parts.every((part) => part.length <= 2000)).toBe(true);
    expect(parts.join(' ')).toBe(text);
  });

  it('não divide o texto curto', () => {
    expect(splitText('curto', 2000)).toEqual(['curto']);
  });
});
