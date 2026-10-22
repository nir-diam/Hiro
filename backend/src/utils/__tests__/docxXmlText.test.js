const { extractWordprocessingMlText, extractDocxXmlText } = require('../docxXmlText');
const { sniffResumeKind } = require('../resumeFileKind');

function storedZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const local = Buffer.alloc(30 + name.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    data.copy(local, 30 + name.length);
    locals.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe('extractWordprocessingMlText', () => {
  it('reads text inside a text box, which mammoth skips', () => {
    const xml = `
      <w:document>
        <w:p><w:r><w:t>כותרת</w:t></w:r></w:p>
        <w:txbxContent>
          <w:p><w:r><w:t>גדעון כהן</w:t></w:r></w:p>
          <w:p><w:r><w:t>מנהל תפעול בחברת אלפא 2018-2024</w:t></w:r></w:p>
        </w:txbxContent>
      </w:document>`;
    const text = extractWordprocessingMlText(xml);
    expect(text).toContain('גדעון כהן');
    expect(text).toContain('מנהל תפעול');
  });
});

describe('extractDocxXmlText', () => {
  it('reads word/document.xml from a docx zip regardless of extension', () => {
    const xml = '<w:document><w:p><w:r><w:t>ניסיון בחברת ביתא</w:t></w:r></w:p></w:document>';
    const zip = storedZip([{ name: 'word/document.xml', data: xml }]);
    expect(sniffResumeKind(zip)).toBe('docx');
    expect(extractDocxXmlText(zip)).toContain('ניסיון בחברת ביתא');
  });
});

describe('sniffResumeKind', () => {
  it('detects pdf and legacy doc from magic bytes', () => {
    expect(sniffResumeKind(Buffer.from('%PDF-1.4 rest'))).toBe('pdf');
    const doc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00]);
    expect(sniffResumeKind(doc)).toBe('doc');
  });
});
