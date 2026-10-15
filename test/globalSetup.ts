import { mkdirSync, rmSync } from "node:fs";

export default function setup() {
  rmSync("test/output", { recursive: true, force: true });
  mkdirSync("test/output", { recursive: true });
}
