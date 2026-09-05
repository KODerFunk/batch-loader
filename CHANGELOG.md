# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-09-06

### Added

- Dual ESM/CJS package: an `exports` manifest routes native ESM (`dist/index.mjs`) and
  CommonJS (`dist/index.js`) consumers — `import` and `require` both work out of the box in
  Node.js >= 18 and in bundlers.
- Named export `BatchLoader` alongside the default one, so `require()` consumers don't need
  `.default`.

### Changed

- The build switched from per-file `tsc` output to bundled `tsup` output; CI smoke-tests the
  packed tarball in both module formats on Node 18/20/22/24.
- The npm package no longer ships the TypeScript sources and specs — the source maps are
  self-contained (`sourcesContent` is inlined), types come from the bundled `dist/index.d.ts`.

### Breaking

- Deep imports from package subpaths (e.g. `dist/BatchLoader.js`) are no longer supported —
  import from the package root only.

## [0.3.0] - 2026-09-07

> [0.2.0] was never published separately — its changes shipped together with 0.3.0.

### Added

- `maxBatchSize` option: an oversized buffer is flushed in parallel chunks.
- `flush()`: executes the currently scheduled batch immediately, ignoring the scheduling window.
- `clear(id)` / `clearAll()` cache invalidation, backed by the new optional `delete` / `clear`
  methods of `IBatchLoaderItemsStore` (both built-in stores implement them).
- `engines: node >= 18` and `sideEffects: false` in `package.json`.
- New exports from the package root: both items stores, the public types and
  `ItemNotFoundExceptionError`.

### Changed

- Invalid constructor options (`batchFetch`, `batchScheduleFn`, `maxBatchSize`) and
  `load`/`loadMany(null | undefined)` now throw a `TypeError` — previously they silently
  "worked".
- Strict contract for the `batchFetch` result: a non-array or a wrong-length array fails the
  whole batch (items are rejected, `onError` is called).

### Fixed

- An unhandled rejection could leak, and `batchStatus` could hang, when `batchFetch` violated
  its contract.
- `optimisticUpdate` is now protected from being overwritten by a flying batch (per-item
  `optimisticRevision`, snapshotted at dispatch time) — previously server data clobbered the
  optimistic value both in the store and in the already returned promise.
- Deferred lifecycle: `optimisticUpdate` on a known item now replaces the promise, so `load()`
  returns the optimistic value instead of a forever-stale rejected/resolved promise; a promise
  is no longer orphaned by `optimisticUpdate` + `load('refresh')` and settles with the
  optimistic value immediately, without waiting for the flying batch; ids are no longer
  duplicated in the batch buffer.

## [0.1.1] - 2025-06-12

- Fixed `package.json` fields for imports in downstream projects.

## [0.1.0] - 2025-06-12

- `optimisticUpdate` method; respect for falsy non-`undefined` results.

## [0.0.3] and earlier - 2023-12-10

- Initial experimental releases; predates this changelog.
