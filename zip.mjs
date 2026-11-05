const encoder = new TextEncoder();
const UINT32_MAX = 0xffffffff;
const crcTable = Uint32Array.from({length: 256}, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc;
});

async function checksum(blob) {
  let crc = UINT32_MAX;
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      for (const byte of value) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    }
  } finally { reader.releaseLock(); }
  return (crc ^ UINT32_MAX) >>> 0;
}

export class ZipArchive {
  #parts = [];
  #directory = [];
  #offset = 0;

  async add(path, blob) {
    const name = encoder.encode(path);
    if (this.#directory.length >= 65534 || name.length > 65535 || this.#offset + blob.size + name.length + 30 >= UINT32_MAX) {
      throw new Error('ZIP_TOO_LARGE');
    }
    const crc = await checksum(blob);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 paths
    local.setUint16(12, 33, true); // 1980-01-01, valid DOS date
    local.setUint32(14, crc, true);
    local.setUint32(18, blob.size, true);
    local.setUint32(22, blob.size, true);
    local.setUint16(26, name.length, true);

    const central = new DataView(new ArrayBuffer(46 + name.length));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    new Uint8Array(central.buffer).set(new Uint8Array(local.buffer, 4, 26), 6);
    central.setUint32(42, this.#offset, true);
    new Uint8Array(central.buffer).set(name, 46);
    this.#directory.push(central.buffer);
    this.#parts.push(local.buffer, name, blob);
    this.#offset += 30 + name.length + blob.size;
  }

  finish() {
    const size = this.#directory.reduce((sum, part) => sum + part.byteLength, 0);
    if (this.#offset + size + 22 >= UINT32_MAX) throw new Error('ZIP_TOO_LARGE');
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.#directory.length, true);
    end.setUint16(10, this.#directory.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, this.#offset, true);
    return new Blob([...this.#parts, ...this.#directory, end.buffer], {type:'application/zip'});
  }
}
