export type GraphMetricOptions = {
  elapsedTime?: boolean;
  minimize?: "weight" | "elapsedTime";
  weight?: string;
  startTimeColumn?: string;
  endTimeColumn?: string;
};

export type PreparedGraphMetricOptions = {
  elapsedTime: boolean;
  minimize: "weight" | "elapsedTime" | "connections";
};

/** Resolves graph cost selection separately from optional elapsed-time reporting. */
export default function prepareGraphMetricOptions(
  options: GraphMetricOptions,
  method: string,
  optimize: boolean,
): PreparedGraphMetricOptions {
  if (
    options.elapsedTime !== undefined &&
    typeof options.elapsedTime !== "boolean"
  ) {
    throw new TypeError(`${method} options.elapsedTime must be a boolean.`);
  }
  const elapsedTime = options.elapsedTime === true;
  if (
    elapsedTime &&
    (options.startTimeColumn === undefined ||
      options.endTimeColumn === undefined)
  ) {
    throw new TypeError(
      `${method} options.elapsedTime requires both options.startTimeColumn and options.endTimeColumn.`,
    );
  }
  if (options.minimize !== undefined) {
    if (!optimize) {
      throw new TypeError(
        `${method} options.minimize is not supported because this method returns all routes.`,
      );
    }
    if (options.minimize !== "weight" && options.minimize !== "elapsedTime") {
      throw new TypeError(
        `${method} options.minimize must be "weight" or "elapsedTime".`,
      );
    }
    if (options.minimize === "weight" && options.weight === undefined) {
      throw new TypeError(
        `${method} options.minimize: "weight" requires options.weight.`,
      );
    }
    if (options.minimize === "elapsedTime" && !elapsedTime) {
      throw new TypeError(
        `${method} options.minimize: "elapsedTime" requires options.elapsedTime: true.`,
      );
    }
  }
  if (
    optimize && elapsedTime && options.weight !== undefined &&
    options.minimize === undefined
  ) {
    throw new TypeError(
      `${method} when weight and elapsedTime are both enabled, specify options.minimize: "weight" or "elapsedTime".`,
    );
  }
  return {
    elapsedTime,
    minimize: options.minimize ??
      (options.weight !== undefined
        ? "weight"
        : elapsedTime
        ? "elapsedTime"
        : "connections"),
  };
}
