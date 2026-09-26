import { containsPattern } from './search.js';

describe('containsPattern', () => {
  it('não filtra sem termo', () => {
    expect(containsPattern(undefined)).toBeUndefined();
    expect(containsPattern('')).toBeUndefined();
  });

  it('envolve o termo em curingas', () => {
    expect(containsPattern('silva')).toBe('%silva%');
  });

  it('escapa curingas digitados pelo usuário', () => {
    expect(containsPattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  });
});
