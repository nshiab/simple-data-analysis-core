/*
 * Spherical area and containment subset of d3-geo 3.1.1, with the
 * compensated Adder from d3-array 3.2.4 (Copyright 2010-2023 Mike Bostock).
 * https://github.com/d3/d3-geo and https://github.com/d3/d3-array
 * Rewinding adapted from @nshiab/journalism-dataviz 1.0.10 (MIT).
 *
 * Copyright 2010-2024 Mike Bostock
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose
 * with or without fee is hereby granted, provided that the above copyright notice
 * and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
 * TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
 * THIS SOFTWARE.
 *
 * This license applies to GeographicLib, versions 1.12 and later.
 *
 * Copyright 2008-2012 Charles Karney
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

type Position = number[];
type Vector = [number, number, number];
export type GeoGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "MultiPoint" | "LineString"; coordinates: Position[] }
  | { type: "MultiLineString" | "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] }
  | { type: "GeometryCollection"; geometries: GeoGeometry[] };
type Feature = { type: "Feature"; geometry: GeoGeometry | null; properties?: unknown };
export type GeoObject = GeoGeometry | Feature | { type: "FeatureCollection"; features: Feature[] };

const pi = Math.PI;
const tau = 2 * pi;
const halfPi = pi / 2;
const quarterPi = pi / 4;
const radians = pi / 180;
const epsilon = 1e-6;
const epsilon2 = 1e-12;

// Preserve D3's compensated summation: rounding at the hemisphere boundary
// determines whether a polygon must be reversed.
class Adder {
  private readonly partials = new Float64Array(32);
  private count = 0;

  add(x: number): void {
    const p = this.partials;
    let i = 0;
    for (let j = 0; j < this.count && j < 32; j++) {
      const y = p[j];
      const hi = x + y;
      const lo = Math.abs(x) < Math.abs(y) ? x - (hi - y) : y - (hi - x);
      if (lo) p[i++] = lo;
      x = hi;
    }
    p[i] = x;
    this.count = i + 1;
  }

  valueOf(): number {
    const p = this.partials;
    let n = this.count;
    let hi = 0;
    let lo = 0;
    if (n > 0) {
      hi = p[--n];
      while (n > 0) {
        const x = hi;
        const y = p[--n];
        hi = x + y;
        lo = y - (hi - x);
        if (lo) break;
      }
      if (n > 0 && ((lo < 0 && p[n - 1] < 0) || (lo > 0 && p[n - 1] > 0))) {
        const y = lo * 2;
        const x = hi + y;
        if (y === x - hi) hi = x;
      }
    }
    return hi;
  }
}

function ringArea(ring: Position[]): number {
  const sum = new Adder();
  let lambda0 = ring[0][0] * radians;
  const phi0 = (ring[0][1] * radians) / 2 + quarterPi;
  let cosPhi0 = Math.cos(phi0);
  let sinPhi0 = Math.sin(phi0);
  // A closed ring is streamed without its last point, then closed explicitly.
  for (let i = 1; i < ring.length; i++) {
    const point = i === ring.length - 1 ? ring[0] : ring[i];
    const lambda = point[0] * radians;
    const phi = (point[1] * radians) / 2 + quarterPi;
    const delta = lambda - lambda0;
    const sign = delta >= 0 ? 1 : -1;
    const absDelta = sign * delta;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const k = sinPhi0 * sinPhi;
    sum.add(Math.atan2(k * sign * Math.sin(absDelta), cosPhi0 * cosPhi + k * Math.cos(absDelta)));
    lambda0 = lambda;
    cosPhi0 = cosPhi;
    sinPhi0 = sinPhi;
  }
  const area = sum.valueOf();
  return (area < 0 ? tau + area : area) * 2;
}

function longitude(point: Position): number {
  return Math.abs(point[0]) <= pi
    ? point[0]
    : Math.sign(point[0]) * (((Math.abs(point[0]) + pi) % tau) - pi);
}

function cartesian(point: Position): Vector {
  const cosPhi = Math.cos(point[1]);
  return [cosPhi * Math.cos(point[0]), cosPhi * Math.sin(point[0]), Math.sin(point[1])];
}

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(vector: Vector): void {
  const length = Math.sqrt(vector[0] ** 2 + vector[1] ** 2 + vector[2] ** 2);
  vector[0] /= length;
  vector[1] /= length;
  vector[2] /= length;
}

function ringContains(closedRing: Position[], point: Position): boolean {
  const ring = closedRing.slice(0, -1).map(([x, y]) => [x * radians, y * radians]);
  const lambda = longitude([point[0] * radians, point[1] * radians]);
  let phi = point[1] * radians;
  const sinPhi = Math.sin(phi);
  const normal: Vector = [Math.sin(lambda), -Math.cos(lambda), 0];
  let angle = 0;
  let winding = 0;
  const sum = new Adder();
  if (sinPhi === 1) phi = halfPi + epsilon;
  else if (sinPhi === -1) phi = -halfPi - epsilon;
  if (ring.length > 0) {
    let point0 = ring[ring.length - 1];
    let lambda0 = longitude(point0);
    const phi0 = point0[1] / 2 + quarterPi;
    let sinPhi0 = Math.sin(phi0);
    let cosPhi0 = Math.cos(phi0);
    for (const point1 of ring) {
      const lambda1 = longitude(point1);
      const phi1 = point1[1] / 2 + quarterPi;
      const sinPhi1 = Math.sin(phi1);
      const cosPhi1 = Math.cos(phi1);
      const delta = lambda1 - lambda0;
      const sign = delta >= 0 ? 1 : -1;
      const absDelta = sign * delta;
      const antimeridian = absDelta > pi;
      const k = sinPhi0 * sinPhi1;
      sum.add(
        Math.atan2(k * sign * Math.sin(absDelta), cosPhi0 * cosPhi1 + k * Math.cos(absDelta)),
      );
      angle += antimeridian ? delta + sign * tau : delta;
      if (Number(antimeridian) ^ Number(lambda0 >= lambda) ^ Number(lambda1 >= lambda)) {
        const arc = cross(cartesian(point0), cartesian(point1));
        normalize(arc);
        const intersection = cross(normal, arc);
        normalize(intersection);
        const z = intersection[2];
        const asin = z > 1 ? halfPi : z < -1 ? -halfPi : Math.asin(z);
        const direction = antimeridian !== delta >= 0;
        const phiArc = (direction ? -1 : 1) * asin;
        if (phi > phiArc || (phi === phiArc && (arc[0] || arc[1]))) {
          winding += direction ? 1 : -1;
        }
      }
      point0 = point1;
      lambda0 = lambda1;
      sinPhi0 = sinPhi1;
      cosPhi0 = cosPhi1;
    }
  }
  return Boolean(
    Number(angle < -epsilon || (angle < epsilon && sum.valueOf() < -epsilon2)) ^ (winding & 1),
  );
}

function rewindPolygon(coordinates: Position[][]): Position[][] {
  const polygon = coordinates.map((ring) => ring.slice(0, -1).map(([x, y]) => [x, y]));
  for (const [index, ring] of polygon.entries()) {
    ring.push([...ring[0]]);
    const reverse = index
      ? !ringContains(ring, polygon[0][0])
      : polygon[1]
        ? !ringContains(ring, polygon[1][0])
        : ringArea(ring) > 2 * pi;
    if (reverse) ring.reverse();
    ring.pop();
  }
  return polygon.map((ring) => [...ring, [...ring[0]]]);
}

function rewindGeometry(geometry: GeoGeometry): GeoGeometry {
  switch (geometry.type) {
    case "GeometryCollection":
      return { ...geometry, geometries: geometry.geometries.map(rewindGeometry) };
    case "Polygon":
      return { ...geometry, coordinates: rewindPolygon(geometry.coordinates) };
    case "MultiPolygon":
      return { ...geometry, coordinates: geometry.coordinates.map(rewindPolygon) };
    default:
      return geometry;
  }
}

export default function rewind<T extends GeoObject>(geojson: T): T;
export default function rewind(geojson: unknown): GeoObject | null;
export default function rewind(geojson: unknown): GeoObject | null {
  if (geojson == null) return null;
  if (!isGeoObject(geojson)) throw new Error("Invalid GeoJSON object.");
  if (geojson.type === "FeatureCollection") {
    return {
      ...geojson,
      features: geojson.features.map((feature) => ({
        ...feature,
        geometry: feature.geometry ? rewindGeometry(feature.geometry) : null,
      })),
    };
  }
  if (geojson.type === "Feature") {
    return { ...geojson, geometry: geojson.geometry ? rewindGeometry(geojson.geometry) : null };
  }
  return rewindGeometry(geojson);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isPosition(value: unknown): value is number[] {
  return isArray(value) && value.every((coordinate) => typeof coordinate === "number");
}

function isLine(value: unknown): value is number[][] {
  return isArray(value) && value.every(isPosition);
}

function isPolygon(value: unknown): value is number[][][] {
  return isArray(value) && value.every(isLine);
}

export function isGeometry(value: unknown): value is GeoGeometry {
  if (value === null || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "GeometryCollection") {
    return "geometries" in value && isArray(value.geometries) && value.geometries.every(isGeometry);
  }
  if (!("coordinates" in value)) return false;
  switch (value.type) {
    case "Point":
      return isPosition(value.coordinates);
    case "MultiPoint":
    case "LineString":
      return isLine(value.coordinates);
    case "MultiLineString":
    case "Polygon":
      return isPolygon(value.coordinates);
    case "MultiPolygon":
      return isArray(value.coordinates) && value.coordinates.every(isPolygon);
    default:
      return false;
  }
}

export function isGeoObject(value: unknown): value is GeoObject {
  if (value === null || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "Feature") {
    return "geometry" in value && (value.geometry === null || isGeometry(value.geometry));
  }
  if (value.type === "FeatureCollection") {
    return (
      "features" in value &&
      isArray(value.features) &&
      value.features.every(
        (feature) =>
          feature !== null &&
          typeof feature === "object" &&
          "type" in feature &&
          feature.type === "Feature" &&
          "geometry" in feature &&
          (feature.geometry === null || isGeometry(feature.geometry)),
      )
    );
  }
  return isGeometry(value);
}
