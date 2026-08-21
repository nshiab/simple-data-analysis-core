import { createReadStream } from "node:fs";
import { type FileHandle, open, rm, stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  Transform,
  type TransformCallback,
  Writable,
  type WritableOptions,
} from "node:stream";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";
import { constants, createDeflateRaw } from "node:zlib";

const maximumZip32Value = 0xffff_fffe;
const maximumZip32Entries = 0xfffe;
const utf8WithDataDescriptor = 0x0808;
const crc32Table = createCrc32Table();

type ZipInput = {
  file: string;
  name?: string;
};

type ZipEntry = {
  name: Uint8Array;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  modificationTime: number;
  modificationDate: number;
};

class ChecksumTransform extends Transform {
  #crc32 = 0;
  size = 0;

  get crc32(): number {
    return this.#crc32;
  }

  override _transform(
    chunk: Uint8Array,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.#crc32 = updateCrc32(chunk, this.#crc32);
    this.size += chunk.byteLength;
    callback(null, chunk);
  }
}

class FileHandleWritable extends Writable {
  bytesWritten = 0;
  readonly #fileHandle: FileHandle;

  constructor(fileHandle: FileHandle, options?: WritableOptions) {
    super(options);
    this.#fileHandle = fileHandle;
  }

  override _write(
    chunk: Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    writeAll(this.#fileHandle, chunk).then(() => {
      this.bytesWritten += chunk.byteLength;
      callback();
    }).catch((error: unknown) => {
      callback(error instanceof Error ? error : new Error(String(error)));
    });
  }
}

/**
 * Writes files to a ZIP archive using streaming DEFLATE compression.
 *
 * The implementation intentionally supports ZIP32 archives only. Shapefile
 * components are conventionally limited to 2 GB, but the combined archive can
 * still exceed ZIP32 limits; those cases fail explicitly instead of producing
 * a corrupt archive.
 */
export default async function writeZip(
  archive: string,
  inputs: ZipInput[],
): Promise<void> {
  if (inputs.length > maximumZip32Entries) {
    throw new Error(
      `ZIP archives support at most ${maximumZip32Entries} files.`,
    );
  }

  const fileHandle = await open(archive, "w");
  const entries: ZipEntry[] = [];
  let offset = 0;
  let operationError: unknown;

  try {
    for (const input of inputs) {
      const fileStats = await stat(input.file);
      if (!fileStats.isFile()) {
        throw new Error(
          `ZIP input is not a file: ${JSON.stringify(input.file)}`,
        );
      }
      assertZip32Value(fileStats.size, "uncompressed file size");

      const name = encodeZipName(input.name ?? basename(input.file));
      const { modificationTime, modificationDate } = encodeDosDateTime(
        fileStats.mtime,
      );
      const localHeaderOffset = offset;
      const localHeader = createLocalHeader(
        name,
        modificationTime,
        modificationDate,
      );
      await writeAll(fileHandle, localHeader);
      offset += localHeader.byteLength;

      const checksum = new ChecksumTransform();
      const output = new FileHandleWritable(fileHandle);
      await pipeline(
        createReadStream(input.file),
        checksum,
        createDeflateRaw({ level: constants.Z_BEST_SPEED }),
        output,
      );

      assertZip32Value(output.bytesWritten, "compressed file size");
      const descriptor = createDataDescriptor(
        checksum.crc32,
        output.bytesWritten,
        checksum.size,
      );
      await writeAll(fileHandle, descriptor);
      offset += output.bytesWritten + descriptor.byteLength;

      entries.push({
        name,
        crc32: checksum.crc32,
        compressedSize: output.bytesWritten,
        uncompressedSize: checksum.size,
        localHeaderOffset,
        modificationTime,
        modificationDate,
      });
    }

    const centralDirectoryOffset = offset;
    for (const entry of entries) {
      assertZip32Value(entry.localHeaderOffset, "local header offset");
      const centralHeader = createCentralDirectoryHeader(entry);
      await writeAll(fileHandle, centralHeader);
      offset += centralHeader.byteLength;
    }

    const centralDirectorySize = offset - centralDirectoryOffset;
    assertZip32Value(centralDirectoryOffset, "central directory offset");
    assertZip32Value(centralDirectorySize, "central directory size");
    await writeAll(
      fileHandle,
      createEndOfCentralDirectory(
        entries.length,
        centralDirectorySize,
        centralDirectoryOffset,
      ),
    );
  } catch (error) {
    operationError = error;
  }

  try {
    await fileHandle.close();
  } catch (closeError) {
    if (operationError !== undefined) {
      operationError = new AggregateError(
        [operationError, closeError],
        "Writing and closing the ZIP archive both failed.",
        { cause: operationError },
      );
    } else {
      operationError = closeError;
    }
  }

  if (operationError !== undefined) {
    try {
      await rm(archive, { force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [operationError, cleanupError],
        "Writing and cleaning up the ZIP archive both failed.",
        { cause: operationError },
      );
    }
    throw operationError;
  }
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) === 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function updateCrc32(data: Uint8Array, previous: number): number {
  if (typeof zlib.crc32 === "function") {
    return zlib.crc32(data, previous);
  }

  let value = (previous ^ 0xffff_ffff) >>> 0;
  for (const byte of data) {
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffff_ffff) >>> 0;
}

function encodeZipName(name: string): Uint8Array {
  const normalizedName = name.replaceAll("\\", "/");
  if (
    normalizedName === "" || normalizedName.startsWith("/") ||
    normalizedName.split("/").includes("..")
  ) {
    throw new Error(`Invalid ZIP entry name: ${JSON.stringify(name)}`);
  }
  const encoded = new TextEncoder().encode(normalizedName);
  if (encoded.byteLength > 0xffff) {
    throw new Error(`ZIP entry name is too long: ${JSON.stringify(name)}`);
  }
  return encoded;
}

function encodeDosDateTime(date: Date): {
  modificationTime: number;
  modificationDate: number;
} {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    modificationTime: (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    modificationDate: ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

function createLocalHeader(
  name: Uint8Array,
  modificationTime: number,
  modificationDate: number,
): Uint8Array {
  const header = new Uint8Array(30 + name.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x0403_4b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, utf8WithDataDescriptor, true);
  view.setUint16(8, 8, true);
  view.setUint16(10, modificationTime, true);
  view.setUint16(12, modificationDate, true);
  view.setUint16(26, name.byteLength, true);
  header.set(name, 30);
  return header;
}

function createDataDescriptor(
  crc32: number,
  compressedSize: number,
  uncompressedSize: number,
): Uint8Array {
  const descriptor = new Uint8Array(16);
  const view = new DataView(descriptor.buffer);
  view.setUint32(0, 0x0807_4b50, true);
  view.setUint32(4, crc32, true);
  view.setUint32(8, compressedSize, true);
  view.setUint32(12, uncompressedSize, true);
  return descriptor;
}

function createCentralDirectoryHeader(entry: ZipEntry): Uint8Array {
  const header = new Uint8Array(46 + entry.name.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x0201_4b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, utf8WithDataDescriptor, true);
  view.setUint16(10, 8, true);
  view.setUint16(12, entry.modificationTime, true);
  view.setUint16(14, entry.modificationDate, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.compressedSize, true);
  view.setUint32(24, entry.uncompressedSize, true);
  view.setUint16(28, entry.name.byteLength, true);
  view.setUint32(42, entry.localHeaderOffset, true);
  header.set(entry.name, 46);
  return header;
}

function createEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Uint8Array {
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x0605_4b50, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  return end;
}

function assertZip32Value(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximumZip32Value) {
    throw new Error(
      `Cannot create ZIP archive: ${label} exceeds the 4 GB ZIP32 limit.`,
    );
  }
}

async function writeAll(
  fileHandle: FileHandle,
  data: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < data.byteLength) {
    const { bytesWritten } = await fileHandle.write(data.subarray(offset));
    if (bytesWritten === 0) {
      throw new Error("Could not write to ZIP archive.");
    }
    offset += bytesWritten;
  }
}
