/** Converts validated GeoJSON SQL text to an explicitly typed WGS84 geometry. */
export default function geometryFromJSON(expression: string): string {
  return `ST_GeomFromGeoJSON(${expression})::GEOMETRY('EPSG:4326')`;
}
