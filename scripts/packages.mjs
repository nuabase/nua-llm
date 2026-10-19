// The packages this workspace publishes to npm, in release order, with the
// paths whose changes each one ships. Read by release-status.mjs and
// release-packages.mjs.

export const PUBLISHED_PACKAGES = [
  {
    // nuabase: runs casts in this process. It bundles nua-llm-core.
    dir: "nua-client",
    trackedPaths: ["nua-client", "nua-llm-core"],
  },
];
