# TEVM Bundler

TEVM Bundler is the compiler and tooling workspace behind Solidity imports in
JavaScript and TypeScript. It contains the shared configuration, compiler,
resolution, `solc`, runtime, cache, and base-bundler pipeline; plugins for Bun,
esbuild, RequireJS, Rollup, Rspack, Vite, and webpack; the universal unplugin;
the TEVM language server and TypeScript plugin; the VS Code extension; and
`@tevm/effect`.

This repository is maintained independently from
[`tevm`](https://github.com/evmts/tevm-monorepo). Applications install `tevm`
for the in-process Ethereum node and install one of the packages here to compile
and load Solidity. Keeping the bundler pipeline separate lets its packages
release without forcing a release of the core node.

## Install

Choose the adapter for your build tool:

```sh
pnpm add -D @tevm/vite-plugin
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tevmVite } from '@tevm/vite-plugin'

export default defineConfig({
	plugins: [tevmVite()],
})
```

Other adapters include `@tevm/bun-plugin`, `@tevm/esbuild-plugin`,
`@tevm/requirejs-plugin`, `@tevm/rollup-plugin`, `@tevm/rspack-plugin`, and
`@tevm/webpack-plugin`. Lower-level integrations can use `@tevm/unplugin`,
`@tevm/base-bundler`, `@tevm/compiler`, `@tevm/resolutions`, `@tevm/solc`, and
`@tevm/runtime` directly.

## Development

The workspace requires Node.js 24 and pnpm 9.

```sh
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

### Tests, fuzzing, and benchmarks

| Command | What it runs |
| --- | --- |
| `pnpm test` | Every unit, end-to-end, and fuzz spec (`vitest run`) plus `cargo test` for the Rust crates |
| `pnpm test:fuzz` | Only the property fuzz suites |
| `pnpm bench` | `vitest bench --run` in every package with a `bench/` directory (the Bun plugin bench needs `bun`) |

Fuzz suites are seeded and deterministic. A failure prints the seed and the
counterexample. Reproduce it or widen the search with environment variables:

```sh
FUZZ_SEED=42 FUZZ_RUNS=1000 pnpm --filter @tevm/compiler test:fuzz
```

| Package | Fuzz target |
| --- | --- |
| `@tevm/config` | `remappings.txt` and Foundry remapping parsing |
| `@tevm/resolutions` | Import graphs, cycles, and remapping resolution |
| `@tevm/compiler` | Compiling random import DAGs with the real `solc` |
| `@tevm/runtime` | Generated code for arbitrary ABIs and contract names |
| `@tevm/base-bundler` | Sync, async, and cached resolution for every module format |
| `resolutions-rs`, `runtime-rs`, `solc-rs` | `proptest` suites (`cargo test fuzz_`) |

`packages/unplugin/src/e2e.spec.ts` is the end-to-end test: it builds a project
on disk through config loading, import resolution, `solc`, code generation, and
the cache, then imports the generated module against the real `@tevm/contract`.

The Rust crates need the toolchain pinned in `rust-toolchain.toml`. Each crate
builds its own `target/` directory (1 to 2 GB); run `cargo clean` in a crate to
reclaim the space.

Packages are versioned and published from changesets after changes merge to
`main`. Documentation is hosted at [bundler.tevm.sh](https://bundler.tevm.sh).

## License

MIT
