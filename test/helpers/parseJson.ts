/** Parse fixture data without allowing the JSON parser's any type to escape. */
export default function parseJson(value: string): unknown {
  return JSON.parse(value);
}
