import formatDate from "./formatDate.ts";
import prettyDuration from "./prettyDuration.ts";

export function cacheEntryExpired(
  creation: number,
  ttl: number | undefined,
  now: number,
): boolean {
  return ttl !== undefined && now - creation >= ttl * 1000;
}

export function cacheTtlMessage(
  creation: number,
  ttl: number,
  now: number,
  expired: boolean,
): string {
  const creationDate = formatDate(
    new Date(creation),
    "Month DD, YYYY, at HH:MM period",
  );
  const ttlDuration = prettyDuration(0, { end: ttl * 1000 });
  if (expired) {
    return `TTL of ${ttlDuration} has expired.\nThe creation date is ${creationDate}.\nIt was created ${
      prettyDuration(creation, { end: now })
    } ago.`;
  }

  const ttlLimit = creation + ttl * 1000;
  return `TTL of ${ttlDuration} has not expired.\nThe creation date is ${creationDate}.\nThere are ${
    prettyDuration(now, { end: ttlLimit })
  } left.`;
}

export function cacheLoadMessage(
  start: number,
  end: number,
  cachedDuration: number | undefined,
): string {
  const loaded = `Data loaded in ${prettyDuration(start, { end })}.`;
  if (cachedDuration === undefined) {
    return loaded;
  }
  return `${loaded}\nRunning computations previously took ${
    prettyDuration(0, { end: cachedDuration })
  }.\nYou saved ${prettyDuration(end - start, { end: cachedDuration })}.`;
}
