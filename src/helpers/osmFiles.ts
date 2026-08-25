import crypto from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export type OsmFileSuffix = ".osm" | ".osm.pbf";

export function getOsmFileSuffix(file: string): OsmFileSuffix | null {
  const comparable = isRemoteOsmUrl(file) ? new URL(file).pathname : file;
  const lower = comparable.toLowerCase();
  if (lower.endsWith(".osm.pbf")) {
    return ".osm.pbf";
  }
  if (lower.endsWith(".osm")) {
    return ".osm";
  }
  return null;
}

export function isRemoteOsmUrl(file: string): boolean {
  try {
    const protocol = new URL(file).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export async function downloadOsmToTemporaryFile(
  url: string,
  options: {
    suffix: OsmFileSuffix;
    prefix?: string;
    request?: RequestInit;
  },
): Promise<string> {
  const temporaryDirectory = ".sda-cache/tmp";
  mkdirSync(temporaryDirectory, { recursive: true });
  const prefix = options.prefix === undefined ? "remote" : options.prefix;
  const temporaryFile =
    `${temporaryDirectory}/${prefix}.${crypto.randomUUID()}${options.suffix}`;
  const response = await fetch(url, options.request);

  if (!response.ok) {
    const responseText = (await response.text()).slice(0, 500).trim();
    throw new Error(
      `Could not download OSM data from ${
        JSON.stringify(url)
      }: HTTP ${response.status} ${response.statusText}${
        responseText.length > 0 ? `\n${responseText}` : ""
      }`,
    );
  }
  if (response.body === null) {
    throw new Error(
      `Could not download OSM data from ${
        JSON.stringify(url)
      }: the response body is empty.`,
    );
  }

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(temporaryFile, { flags: "wx" }),
    );
  } catch (error) {
    try {
      await rm(temporaryFile, { force: true });
    } catch {
      // Preserve the download error.
    }
    throw error;
  }

  return temporaryFile;
}
