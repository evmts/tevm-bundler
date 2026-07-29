'use client'

import { useState } from 'react'
import { CodeWindow } from './CodeWindow'

type View = 'sol' | 'write' | 'get'

const VIEWS: { id: View; label: string }[] = [
	{ id: 'sol', label: 'Counter.sol' },
	{ id: 'write', label: 'you write' },
	{ id: 'get', label: 'you get' },
]

function SolPane() {
	return (
		<CodeWindow title="contracts/Counter.sol — the source of truth">
			<span className="tok-com">{'// SPDX-License-Identifier: MIT'}</span>
			{'\n'}
			<span className="tok-kw">pragma solidity</span> <span className="tok-num">^0.8.24</span>;{'\n\n'}
			<span className="tok-kw">contract</span> <span className="tok-type">Counter</span> {'{\n    '}
			<span className="tok-type">uint256</span> <span className="tok-kw">public</span> count;{'\n\n    '}
			<span className="tok-kw">function</span> <span className="tok-fn">increment</span>(){' '}
			<span className="tok-kw">public</span> {'{\n        '}
			count += <span className="tok-num">1</span>;{'\n    }\n}'}
		</CodeWindow>
	)
}

function WritePane() {
	return (
		<CodeWindow title="app.ts — import the .sol file like any module">
			<span className="tok-kw">import</span> {'{ '}
			<span className="tok-type">Counter</span>
			{' }'} <span className="tok-kw">from</span> <span className="tok-str">'./contracts/Counter.sol'</span>
			{'\n\n'}
			<span className="tok-com">{'// fully typed — no codegen, no copied ABI'}</span>
			{'\n'}
			<span className="tok-kw">const</span> tx = <span className="tok-kw">await</span> client.
			<span className="tok-fn">writeContract</span>({'{\n    '}
			abi: <span className="tok-type">Counter</span>.abi,{'\n    '}
			functionName: <span className="tok-str">'increment'</span>,{'\n}'})
		</CodeWindow>
	)
}

function GetPane() {
	return (
		<CodeWindow title="what the bundler hands you (compiled on demand, cached)">
			{'{\n    '}
			<span className="tok-type">abi</span>: [...] <span className="tok-kw">as const</span>,{'\n    '}
			<span className="tok-type">humanReadableAbi</span>: [<span className="tok-str">'function increment()'</span>,
			...],
			{'\n    '}
			<span className="tok-type">bytecode</span>: <span className="tok-str">'0x6080604052...'</span>,{'\n    '}
			<span className="tok-type">deployedBytecode</span>: <span className="tok-str">'0x6080604052...'</span>,{'\n'}
			{'}'} <span className="tok-com">{'// typed as Contract<"Counter", ...>'}</span>
			{'\n\n'}
			<span className="tok-ok">✓ tsc passes</span>
			{'   '}
			<span className="tok-ok">✓ editor autocomplete on .sol imports</span>
			{'   '}
			<span className="tok-ok">✓ recompiles when Counter.sol changes</span>
		</CodeWindow>
	)
}

const NOTES: Record<View, { icon: string; bad?: boolean; html: React.ReactNode }[]> = {
	sol: [
		{
			icon: '1',
			html: (
				<span>
					<strong>Write Solidity.</strong> Your contract stays the single source of truth — no ABI copies checked into
					the repo.
				</span>
			),
		},
	],
	write: [
		{
			icon: '2',
			html: (
				<span>
					<strong>Import it.</strong> The bundler plugin resolves <strong>.sol</strong> files through the Tevm compiler
					pipeline.
				</span>
			),
		},
	],
	get: [
		{
			icon: '✓',
			html: (
				<span>
					<strong>Typed contract object.</strong> ABI, human-readable ABI, and bytecode with types derived from the real
					contract.
				</span>
			),
		},
		{
			icon: '✓',
			html: (
				<span>
					<strong>Editor agrees.</strong> The ts-plugin and LSP share the same pipeline, so autocomplete and hover work
					on .sol imports.
				</span>
			),
		},
		{
			icon: '✓',
			html: (
				<span>
					<strong>Cached.</strong> Compilation results are cached and invalidated exactly when a dependency changes.
				</span>
			),
		},
	],
}

export function SolImportTransform() {
	const [view, setView] = useState<View>('write')

	return (
		<div className="tevm-transform">
			<div className="tevm-transform-toggle" role="tablist" aria-label="Solidity import walkthrough">
				{VIEWS.map((v) => (
					<button
						key={v.id}
						type="button"
						role="tab"
						aria-selected={view === v.id}
						data-active={view === v.id}
						onClick={() => setView(v.id)}
					>
						{v.label}
					</button>
				))}
			</div>
			<div className="tevm-transform-stage">
				<div className="tevm-transform-pane" key={view}>
					{view === 'sol' ? <SolPane /> : view === 'write' ? <WritePane /> : <GetPane />}
				</div>
			</div>
			<div className="tevm-transform-arrow">Counter.sol ──▶ tevm bundler plugin ──▶ typed Contract module</div>
			<div className="tevm-transform-notes">
				{NOTES[view].map((note) => (
					<div
						key={typeof note.icon === 'string' ? note.icon : undefined}
						className={`tevm-transform-note${note.bad ? ' tevm-transform-note--bad' : ''}`}
					>
						<span className="tevm-transform-note-icon">{note.icon}</span>
						{note.html}
					</div>
				))}
			</div>
		</div>
	)
}
