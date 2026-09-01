import { createReadStream, createWriteStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";

/*
 * Adapted from the ZIP reader in @nshiab/journalism-web-scraping. This
 * version streams the selected entry to disk so complete StatCan tables do
 * not need to be buffered in JavaScript memory.
 */

const END_OF_CENTRAL_DIRECTORY = 0x0605_4b50;
const CENTRAL_DIRECTORY_ENTRY = 0x0201_4b50;
const LOCAL_FILE_HEADER = 0x0403_4b50;
const MAX_COMMENT_LENGTH = 0xffff;
const MAX_END_RECORD_LENGTH = 22 + MAX_COMMENT_LENGTH;
const CRC_TABLE = createCrcTable();

type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  expectedCrc: number;
  localHeaderOffset: number;
};

class ChecksumTransform extends Transform {
  #crc = 0xffff_ffff;
  size = 0;

  get crc32(): number {
    return (this.#crc ^ 0xffff_ffff) >>> 0;
  }

  override _transform(
    chunk: Uint8Array,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    for (const byte of chunk) {
      this.#crc = CRC_TABLE[(this.#crc ^ byte) & 0xff] ^ (this.#crc >>> 8);
    }
    this.size += chunk.byteLength;
    callback(null, chunk);
  }
}

/** Extracts one entry from a non-ZIP64, single-disk ZIP without buffering it. */
export default async function extractZipEntryToFile(
  archive: string,
  wantedName: string,
  output: string,
): Promise<void> {
  const entry = await findZipEntry(archive, wantedName);
  if (entry === undefined) {
    throw new Error(`No ${wantedName} in the zipped file.`);
  }
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new Error(
      `ZIP entry ${wantedName} uses unsupported compression method ${entry.compressionMethod}.`,
    );
  }

  const file = await open(archive, "r");
  let operationError: unknown;
  try {
    const localHeader = new Uint8Array(30);
    await readExactly(file, localHeader, entry.localHeaderOffset);
    const view = new DataView(localHeader.buffer);
    assertSignature(view, 0, LOCAL_FILE_HEADER, "local file header");
    const fileNameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const dataOffset = entry.localHeaderOffset + 30 + fileNameLength +
      extraLength;
    const checksum = new ChecksumTransform();
    const source = createReadStream(archive, {
      start: dataOffset,
      end: dataOffset + entry.compressedSize - 1,
    });
    const streams = entry.compressionMethod === 8
      ? [
        source,
        createInflateRaw(),
        checksum,
        createWriteStream(output, {
          flags: "wx",
        }),
      ]
      : [source, checksum, createWriteStream(output, { flags: "wx" })];
    await pipeline(streams);

    if (checksum.size !== entry.uncompressedSize) {
      throw new Error(`ZIP entry ${wantedName} has an invalid size.`);
    }
    if (checksum.crc32 !== entry.expectedCrc) {
      throw new Error(`ZIP entry ${wantedName} failed its CRC check.`);
    }
  } catch (error) {
    operationError = error;
  }

  try {
    await file.close();
  } catch (closeError) {
    operationError = operationError === undefined
      ? closeError
      : new AggregateError(
        [operationError, closeError],
        "Extracting and closing the ZIP archive both failed.",
        { cause: operationError },
      );
  }

  if (operationError !== undefined) {
    try {
      await rm(output, { force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [operationError, cleanupError],
        "Extracting and cleaning up the ZIP entry both failed.",
        { cause: operationError },
      );
    }
    throw operationError;
  }
}

async function findZipEntry(
  archive: string,
  wantedName: string,
): Promise<ZipEntry | undefined> {
  const file = await open(archive, "r");
  try {
    const size = (await stat(archive)).size;
    const tailLength = Math.min(size, MAX_END_RECORD_LENGTH);
    const tail = new Uint8Array(tailLength);
    await readExactly(file, tail, size - tailLength);
    const tailView = new DataView(tail.buffer);
    const endOffset = findEndOfCentralDirectory(tailView);
    const diskNumber = tailView.getUint16(endOffset + 4, true);
    const centralDirectoryDisk = tailView.getUint16(endOffset + 6, true);
    const entriesOnDisk = tailView.getUint16(endOffset + 8, true);
    const entryCount = tailView.getUint16(endOffset + 10, true);
    const centralDirectorySize = tailView.getUint32(endOffset + 12, true);
    const centralDirectoryOffset = tailView.getUint32(endOffset + 16, true);

    if (
      diskNumber !== 0 || centralDirectoryDisk !== 0 ||
      entriesOnDisk !== entryCount
    ) {
      throw new Error("Multi-disk ZIP archives are not supported.");
    }
    if (
      entryCount === 0xffff || centralDirectorySize === 0xffff_ffff ||
      centralDirectoryOffset === 0xffff_ffff
    ) {
      throw new Error("ZIP64 archives are not supported.");
    }
    if (centralDirectoryOffset + centralDirectorySize > size) {
      throw new Error("Invalid ZIP archive: truncated central directory.");
    }

    const centralDirectory = new Uint8Array(centralDirectorySize);
    await readExactly(file, centralDirectory, centralDirectoryOffset);
    const view = new DataView(centralDirectory.buffer);
    let offset = 0;
    for (let index = 0; index < entryCount; index++) {
      assertSignature(
        view,
        offset,
        CENTRAL_DIRECTORY_ENTRY,
        "central directory",
      );
      assertRange(centralDirectory, offset, 46, "central directory entry");
      const flags = view.getUint16(offset + 8, true);
      const compressionMethod = view.getUint16(offset + 10, true);
      const expectedCrc = view.getUint32(offset + 16, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const entryLength = 46 + fileNameLength + extraLength + commentLength;
      assertRange(
        centralDirectory,
        offset,
        entryLength,
        "central directory entry",
      );
      const name = new TextDecoder().decode(
        centralDirectory.subarray(offset + 46, offset + 46 + fileNameLength),
      );
      if (name === wantedName) {
        if ((flags & 1) !== 0) {
          throw new Error(`ZIP entry ${wantedName} is encrypted.`);
        }
        if (
          compressedSize === 0xffff_ffff ||
          uncompressedSize === 0xffff_ffff ||
          localHeaderOffset === 0xffff_ffff
        ) {
          throw new Error("ZIP64 archives are not supported.");
        }
        return {
          compressionMethod,
          compressedSize,
          uncompressedSize,
          expectedCrc,
          localHeaderOffset,
        };
      }
      offset += entryLength;
    }
    return undefined;
  } finally {
    await file.close();
  }
}

async function readExactly(
  file: Awaited<ReturnType<typeof open>>,
  buffer: Uint8Array,
  position: number,
): Promise<void> {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await file.read(
      buffer,
      offset,
      buffer.byteLength - offset,
      position + offset,
    );
    if (bytesRead === 0) {
      throw new Error("Invalid ZIP archive: unexpected end of file.");
    }
    offset += bytesRead;
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset--) {
    if (
      view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY &&
      offset + 22 + view.getUint16(offset + 20, true) === view.byteLength
    ) {
      return offset;
    }
  }
  throw new Error("Invalid ZIP archive: end of central directory not found.");
}

function assertSignature(
  view: DataView,
  offset: number,
  expected: number,
  description: string,
): void {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw new Error(`Invalid ZIP archive: truncated ${description}.`);
  }
  if (view.getUint32(offset, true) !== expected) {
    throw new Error(`Invalid ZIP archive: malformed ${description}.`);
  }
}

function assertRange(
  data: Uint8Array,
  offset: number,
  length: number,
  description: string,
): void {
  if (offset < 0 || length < 0 || offset + length > data.byteLength) {
    throw new Error(`Invalid ZIP archive: truncated ${description}.`);
  }
}

function createCrcTable(): Uint32Array {
  return Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = (value >>> 1) ^ (0xedb8_8320 & -(value & 1));
    }
    return value >>> 0;
  });
}
