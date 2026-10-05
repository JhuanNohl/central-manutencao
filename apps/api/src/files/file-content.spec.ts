import { checkFileContent, readSafeXml, safeFileName } from './file-content.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const PDF = Buffer.from('%PDF-1.7\n...');
const XML = Buffer.from('<?xml version="1.0"?><nfeProc><NFe/></nfeProc>');
const MP4 = Buffer.from('\0\0\0\x18ftypisom\0\0\x02\0', 'latin1');
const MOV = Buffer.from('\0\0\0\x14ftypqt  \0\0\x02\0', 'latin1');
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86]);

describe('checkFileContent', () => {
  it('reconhece o tipo pelo conteúdo', () => {
    expect(checkFileContent('foto_item', 'frente.JPG', JPEG)).toEqual({
      ok: true,
      contentType: 'image/jpeg',
    });
    expect(checkFileContent('declaracao', 'dc.pdf', PDF)).toEqual({
      ok: true,
      contentType: 'application/pdf',
    });
    expect(checkFileContent('nota_xml', 'nf.xml', XML)).toEqual({
      ok: true,
      contentType: 'application/xml',
    });
  });

  it('reconhece vídeo de Android, iPhone e WebM pelo conteúdo', () => {
    expect(checkFileContent('video_item', 'falha.mp4', MP4)).toEqual({
      ok: true,
      contentType: 'video/mp4',
    });
    expect(checkFileContent('video_validacao', 'IMG_0001.MOV', MOV)).toEqual({
      ok: true,
      contentType: 'video/quicktime',
    });
    expect(checkFileContent('video_item', 'teste.webm', WEBM)).toEqual({
      ok: true,
      contentType: 'video/webm',
    });
    expect(checkFileContent('video_item', 'falha.mp4', JPEG).ok).toBe(false);
    expect(checkFileContent('foto_item', 'foto.jpg', MP4).ok).toBe(false);
  });

  it('recusa foto falsa: extensão de imagem com outro conteúdo (CA02)', () => {
    const result = checkFileContent('foto_item', 'foto.jpg', PDF);
    expect(result).toEqual({
      ok: false,
      message:
        'O conteúdo do arquivo não corresponde a .jpg, .jpeg, .png, .webp.',
    });
  });

  it('recusa extensão fora da finalidade', () => {
    expect(checkFileContent('foto_item', 'foto.gif', JPEG).ok).toBe(false);
    expect(checkFileContent('nota_xml', 'nf.pdf', PDF).ok).toBe(false);
  });

  it('recusa arquivo vazio ou acima do limite da finalidade', () => {
    expect(checkFileContent('foto_item', 'a.png', Buffer.alloc(0))).toEqual({
      ok: false,
      message: 'O arquivo está vazio.',
    });
    const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
    expect(checkFileContent('nota_xml', 'nf.xml', big)).toEqual({
      ok: false,
      message: 'O arquivo passa de 1 MB.',
    });
    expect(checkFileContent('foto_item', 'a.png', big).ok).toBe(true);
  });
});

describe('readSafeXml', () => {
  it('aceita UTF-8 com BOM', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), XML]);
    expect(readSafeXml(withBom)).toContain('<nfeProc>');
  });

  it('recusa DTD e entidades (XXE)', () => {
    const xxe = Buffer.from(
      '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>',
    );
    expect(readSafeXml(xxe)).toBeNull();
  });

  it('recusa XML malformado e texto que não é XML', () => {
    expect(readSafeXml(Buffer.from('<a><b></a>'))).toBeNull();
    expect(readSafeXml(Buffer.from('não é xml'))).toBeNull();
    expect(readSafeXml(Buffer.from([0xc3, 0x28]))).toBeNull();
  });
});

describe('safeFileName', () => {
  it('remove caminho e caracteres de controle', () => {
    expect(safeFileName('C:\\fotos\\frente "1".jpg')).toBe('frente 1.jpg');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('\u0000')).toBe('arquivo');
  });

  it('remove as marcas de direção que disfarçam a extensão', () => {
    expect(safeFileName('foto\u202Egpj.exe')).toBe('fotogpj.exe');
    expect(safeFileName('\u2066nota\u2069.xml')).toBe('nota.xml');
  });
});
