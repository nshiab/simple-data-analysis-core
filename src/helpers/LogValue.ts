/** Internal display metadata; never returned by public data extraction. */
export default class LogValue {
  readonly text: string;
  readonly jsType: string;
  readonly category: "number" | "string" | "date" | "boolean" | "null";

  constructor(
    text: string,
    jsType: string,
    category: "number" | "string" | "date" | "boolean" | "null",
  ) {
    this.text = text;
    this.jsType = jsType;
    this.category = category;
  }
}
