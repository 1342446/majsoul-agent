# Bundled dependency license sources

Reviewed on 2026-10-24. The complete license files in this directory accompany the distributed extension archives.

## Pi 1.4.0

- Packages: `@earendil-works/pi-agent-core@1.4.0`, `@earendil-works/pi-ai@1.4.0`.
- npm repository: `https://github.com/earendil-works/pi`, directories `packages/agent` and `packages/ai`.
- Fixed release tag: [`v1.4.0`](https://github.com/earendil-works/pi/releases/tag/v1.4.0).
- Release commit: [`4a080252f06caf63a525d7873c5d94d3c23887e0`](https://github.com/earendil-works/pi/commit/4a080252f06caf63a525d7873c5d94d3c23887e0), linked by that release. Both package manifests at this commit declare version `1.4.0` and license `MIT`. npm metadata does not expose `gitHead`; no npm-to-commit attestation is claimed.
- The npm packages omit a separate LICENSE file, so `pi-LICENSE.txt` is copied verbatim from [the repository root LICENSE at the fixed commit](https://raw.githubusercontent.com/earendil-works/pi/4a080252f06caf63a525d7873c5d94d3c23887e0/LICENSE).
- Copyright: `Copyright (c) 2025 Mario Zechner`.
- SHA-256 of `pi-LICENSE.txt`: `0457f5bcec3b3b211605dfb5d1a49042fd638f3686a410fe099c24a25af13c48`.

## TypeBox 1.3.27

- Package: `typebox@1.3.27`, installed and integrity-locked by `package-lock.json`.
- Source: <https://github.com/sinclairzx81/typebox>.
- `typebox-LICENSE.txt` is copied verbatim from the npm package's `license` file (`node_modules/typebox/license`).
- Copyright: `Copyright (c) 2017-2026 Haydn Paterson`.
- SHA-256 of `typebox-LICENSE.txt`: `e8a7cc256941a26ba8234f04390165243a4d42f74fd6491934140605bf7eae2d`.

`bundlePiRuntime()` audits `metafile.outputs[*].inputs[*].bytesInOutput`: only the two Pi packages and TypeBox contribute third-party code. Parsed but eliminated modules, such as `partial-json`, are not distributed in `pi-runtime.js`. Any additional contributing package causes the build to fail pending a license review.
