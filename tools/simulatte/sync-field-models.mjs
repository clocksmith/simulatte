import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, "../..");
const write = process.argv.includes("--write");
for (const id of ["living-tissue", "river-formation", "crystal-foundry"]) {
  const filename = path.join(
      root,
      "public/data/field-experiments",
      id + ".json",
    ),
    config = JSON.parse(fs.readFileSync(filename, "utf8"));
  const modelPath = path.posix.normalize(
    path.posix.join("public/simulatte/field-experiments", config.modelPath),
  );
  if (
    !modelPath.startsWith("public/shared/core/simulation/") ||
    !modelPath.endsWith(".js")
  )
    throw Error("Field model path is outside its owner");
  const files = [
    modelPath,
    ...(config.view === "cells"
      ? []
      : ["public/shared/core/simulation/field-grid.js"]),
  ];
  const sources = files.map((file) => ({
    id: path.basename(file, ".js"),
    path: "../../" + file.slice("public/".length),
    sha256: createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex"),
  }));
  if (JSON.stringify(config.modelSources) !== JSON.stringify(sources)) {
    if (!write) throw Error(id + " model integrity is stale");
    config.modelSources = sources;
    fs.writeFileSync(filename, JSON.stringify(config, null, 2) + "\n");
  }
}
console.log("Field model integrity synchronized");
