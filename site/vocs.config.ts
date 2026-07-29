import { defineConfig } from 'vocs/config'

export default defineConfig({
	title: 'Tevm Bundler',
	titleTemplate: '%s · Tevm Bundler',
	description:
		'Import Solidity files directly in JavaScript and TypeScript. Bundler plugins for Vite, Rollup, esbuild, webpack, Rspack, Bun and RequireJS, plus the Tevm compiler pipeline, TypeScript plugin, language server and VS Code extension.',
	accentColor: 'light-dark(#0069cc, #4da6ff)',
	colorScheme: 'light dark',
	logoUrl: { light: '/tevm-logo-light.png', dark: '/tevm-logo-dark.png' },
	iconUrl: { light: '/tevm-logo-light.png', dark: '/tevm-logo-dark.png' },
	baseUrl: 'https://bundler.tevm.sh',
	// Prerender pages at build time so Vercel serves static HTML.
	renderStrategy: 'partial-static',
	topNav: [
		{ text: 'Getting started', link: '/getting-started', match: '/getting-started' },
		{ text: 'Guides', link: '/guides/vite', match: '/guides' },
		{ text: 'API', link: '/api', match: '/api' },
		{ text: 'Playground', link: '/playground', match: '/playground' },
		{
			text: 'tevm.sh family',
			items: [
				{ text: 'tevm.sh — core', link: 'https://tevm.sh', external: true },
				{ text: 'contract.tevm.sh', link: 'https://contract.tevm.sh', external: true },
				{ text: 'utils.tevm.sh', link: 'https://utils.tevm.sh', external: true },
				{ text: 'logger.tevm.sh', link: 'https://logger.tevm.sh', external: true },
				{ text: 'test.tevm.sh', link: 'https://test.tevm.sh', external: true },
				{ text: 'ethers.tevm.sh', link: 'https://ethers.tevm.sh', external: true },
				{ text: 'mud.tevm.sh', link: 'https://mud.tevm.sh', external: true },
				{ text: 'cli.tevm.sh', link: 'https://cli.tevm.sh', external: true },
				{ text: 'bundler.tevm.sh', link: 'https://bundler.tevm.sh', external: true },
				{ text: 'examples.tevm.sh', link: 'https://examples.tevm.sh', external: true },
			],
		},
	],
	sidebar: [
		{ text: 'Introduction', link: '/' },
		{ text: 'Getting started', link: '/getting-started' },
		{ text: 'Playground', link: '/playground' },
		{
			text: 'Bundler guides',
			collapsed: false,
			items: [
				{ text: 'Vite', link: '/guides/vite' },
				{ text: 'Rollup', link: '/guides/rollup' },
				{ text: 'esbuild', link: '/guides/esbuild' },
				{ text: 'webpack', link: '/guides/webpack' },
				{ text: 'Rspack', link: '/guides/rspack' },
				{ text: 'Bun', link: '/guides/bun' },
				{ text: 'RequireJS', link: '/guides/requirejs' },
			],
		},
		{
			text: 'Core guides',
			collapsed: false,
			items: [
				{ text: 'Configuration', link: '/guides/configuration' },
				{ text: 'Foundry projects', link: '/guides/foundry' },
				{ text: 'Editor & TypeScript setup', link: '/guides/editor-setup' },
				{ text: 'Caching', link: '/guides/caching' },
				{ text: 'Building a custom integration', link: '/guides/custom-integration' },
				{ text: 'Troubleshooting', link: '/guides/troubleshooting' },
			],
		},
		{
			text: 'API reference',
			collapsed: false,
			items: [
				{ text: 'Overview', link: '/api' },
				{ text: 'Bundler plugins', link: '/api/plugins' },
				{ text: '@tevm/unplugin', link: '/api/unplugin' },
				{ text: '@tevm/base-bundler', link: '/api/base-bundler' },
				{ text: '@tevm/config', link: '/api/config' },
				{ text: '@tevm/compiler', link: '/api/compiler' },
				{ text: '@tevm/resolutions', link: '/api/resolutions' },
				{ text: '@tevm/solc', link: '/api/solc' },
				{ text: '@tevm/runtime', link: '/api/runtime' },
				{ text: '@tevm/bundler-cache', link: '/api/bundler-cache' },
				{ text: '@tevm/ts-plugin', link: '/api/ts-plugin' },
				{ text: '@tevm/lsp & VS Code', link: '/api/lsp' },
				{ text: '@tevm/effect', link: '/api/effect' },
			],
		},
		{
			text: 'Project',
			items: [
				{ text: 'How it works', link: '/how-it-works' },
				{ text: 'Ecosystem & repo layout', link: '/ecosystem' },
			],
		},
	],
	socials: [
		{ icon: 'github', link: 'https://github.com/evmts/tevm-bundler' },
		{ icon: 'x', link: 'https://x.com/tevm_sh' },
	],
	editLink: {
		link: 'https://github.com/evmts/tevm-bundler/edit/main/site/src/pages/:path',
		text: 'Suggest changes to this page',
	},
})
