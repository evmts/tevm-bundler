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

Packages are versioned and published from changesets after changes merge to
`main`. Documentation is hosted at [bundler.tevm.sh](https://bundler.tevm.sh).

## License

MIT
