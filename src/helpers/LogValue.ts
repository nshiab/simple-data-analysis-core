/** Internal display metadata; never returned by public data extraction. */
export default class LogValue {
  constructor(
    readonly text: string,
    readonly jsType: string,
    readonly category: "number" | "string" | "date" | "boolean" | "null",
  ) {}
}
