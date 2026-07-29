import { InstallCommand } from './InstallCommand'

export function LandingHero() {
	return (
		<div className="tevm-hero">
			<span className="tevm-hero-eyebrow">@tevm/vite-plugin · @tevm/ts-plugin · +15 packages</span>
			<h1>
				Import <span className="tevm-hero-accent">.sol</span> files like TypeScript
			</h1>
			<p className="tevm-hero-sub">
				The Tevm bundler compiles Solidity on demand inside Vite, Rollup, esbuild, webpack, Rspack, and Bun — and hands
				you back a fully typed contract object. No codegen step, no artifacts directory, no stale ABI JSON.
			</p>
			<div className="tevm-hero-actions">
				<InstallCommand />
				<a className="tevm-button" href="/playground">
					See the transform →
				</a>
			</div>
		</div>
	)
}
