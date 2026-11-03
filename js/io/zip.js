/* Minimal ZIP writer (stored, no compression) for multi-file exports. */
'use strict';
(function (SB) {
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  /** files: [{ name, data: Uint8Array }] → Blob */
  SB.zip = files => {
    const enc = new TextEncoder(), parts = [], cent = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), d = f.data, crc = crc32(d), hd = new DataView(new ArrayBuffer(30));
      hd.setUint32(0, 0x04034b50, true); hd.setUint16(4, 20, true); hd.setUint16(6, 0x0800, true); hd.setUint32(14, crc, true); hd.setUint32(18, d.length, true); hd.setUint32(22, d.length, true); hd.setUint16(26, name.length, true);
      parts.push(hd.buffer, name, d);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cent.push(c.buffer, name); off += 30 + name.length + d.length;
    }
    const size = cent.reduce((a, b) => a + b.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cent, e.buffer], { type: 'application/zip' });
  };
})(window.SB);
