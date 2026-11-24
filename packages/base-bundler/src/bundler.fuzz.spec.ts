/**
 * Property fuzz tests for the full bundler pipeline (`bundler` -> compiler -> runtime -> cache).
 *
 * Random Solidity files are written to a temporary directory, compiled with the real solc,
 * and resolved to every module format through the real file system cache.
 *
 * Self-contained: uses a seeded PRNG instead of an external property testing dependency.
 * Override with FUZZ_SEED and FUZZ_RUNS.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCache } from '@tevm/bundler-cache'
import { defaultConfig } from '@tevm/config'
import solc from 'solc'
import { afterEach, describe, expect, it } from 'vitest'
import { bundler } from './bundler.js'

const SEED = Number(process.env['FUZZ_SEED'] ?? 0x7e5d2026) >>> 0
const RUNS = Math.max(1, Number(process.env['FUZZ_RUNS'] ?? 40))

type Rng = {
	int: (min: number, max: number) => number
	bool: (probability?: number) => boolean
	pick: <T>(values: ReadonlyArray<T>) => T
}

const makeRng = (seed: number): Rng => {
	let state = seed >>> 0
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
	return {
		int,
		bool: (probability = 0.5) => next() < probability,
		pick: (values) => values[int(0, values.length - 1)] as (typeof values)[number],
	}
}

const hash = (text: string) => {
	let h = 2166136261
	for (let i = 0; i < text.length; i++) {
		h = Math.imul(h ^ text.charCodeAt(i), 16777619)
	}
	return h >>> 0
}

const forAll = async <T>(name: string, generate: (rng: Rng) => T, property: (value: T) => void | Promise<void>) => {
	for (let run = 0; run < RUNS; run++) {
		const caseSeed = (SEED ^ hash(name) ^ Math.imul(run + 1, 0x9e3779b9)) >>> 0
		const value = generate(makeRng(caseSeed))
		try {
			await property(value)
		} catch (e) {
			const error = e instanceof Error ? e : new Error(String(e))
			throw new Error(
				`Property "${name}" failed on run ${run} (FUZZ_SEED=${SEED}).\nCounterexample: ${JSON.stringify(value)}\n${error.stack}`,
			)
		}
	}
}

// ---------------------------------------------------------------------------
// generators
// ---------------------------------------------------------------------------

/** Legal Solidity identifiers, including ones that are reserved or special in JavaScript */
const CONTRACT_NAMES = [
	'Counter',
	'ERC20',
	'_Under',
	'$Dollar',
	'class',
	'export',
	'await',
	'yield',
	'arguments',
	'eval',
	'extends',
	'artifacts',
	'createContract',
	'Object',
] as const
// disjoint from CONTRACT_NAMES: a function named after its contract is a compile error
const FUNCTION_NAMES = ['transfer', 'balanceOf', '$', '_', 'package', 'constructor_', 'toString', 'then', 'f1'] as const
const TYPES = ['uint256', 'address', 'bool', 'bytes32', 'string memory', 'uint8[] memory'] as const

type Fn = { name: string; params: string[]; view: boolean; notice: string | undefined }
type Contract = { name: string; functions: Fn[]; event: boolean }
type Project = { contracts: Contract[]; includeBytecode: boolean; script: boolean }

const genProject = (rng: Rng): Project => {
	const names: string[] = []
	const count = rng.int(1, 4)
	while (names.length < count) {
		const name = rng.pick(CONTRACT_NAMES)
		if (!names.includes(name)) names.push(name)
	}
	return {
		contracts: names.map((name) => {
			const functionNames = [...new Set(Array.from({ length: rng.int(0, 4) }, () => rng.pick(FUNCTION_NAMES)))]
			return {
				name,
				functions: functionNames.map((fn) => ({
					name: fn,
					params: Array.from({ length: rng.int(0, 3) }, () => rng.pick(TYPES)),
					view: rng.bool(),
					notice: rng.bool(0.4)
						? rng.pick(['Does a thing', 'Ends a comment */ early', ['uses `ticks` and $', '{x}'].join('')])
						: undefined,
				})),
				event: rng.bool(),
			}
		}),
		includeBytecode: rng.bool(),
		script: rng.bool(0.3),
	}
}

const render = (project: Project) =>
	[
		'// SPDX-License-Identifier: MIT',
		'pragma solidity ^0.8.20;',
		...project.contracts.flatMap((contract) => [
			`contract ${contract.name} {`,
			...(contract.event ? ['\tevent Changed(address indexed who, uint256 value);'] : []),
			...contract.functions.flatMap((fn) => [
				...(fn.notice ? [`\t/// @notice ${fn.notice}`] : []),
				`\tfunction ${fn.name}(${fn.params.map((type, i) => `${type} p${i}`).join(', ')}) external ${fn.view ? 'view ' : ''}returns (uint256) { return 1; }`,
			]),
			'}',
		]),
	].join('\n')

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

const fao = {
	existsSync,
	readFileSync,
	readFile: (path: string, encoding: BufferEncoding) => readFile(path, { encoding }),
	writeFileSync,
	writeFile,
	statSync,
	stat,
	mkdirSync,
	mkdir,
	exists: async (path: string) => {
		try {
			await access(path)
			return true
		} catch {
			return false
		}
	},
}

const makeLogger = () => {
	const errors: unknown[] = []
	return {
		errors,
		logger: {
			info: () => {},
			log: () => {},
			warn: () => {},
			error: (...messages: unknown[]) => {
				errors.push(...messages)
			},
		},
	}
}

/** Wraps solc to count compiles and to let pending non-blocking cache writes be awaited */
const makeBundler = (workspace: string, cacheDir: string) => {
	const realCache = createCache(cacheDir, fao, workspace)
	const pending: Array<Promise<unknown>> = []
	const track = <T>(promise: Promise<T>): Promise<T> => {
		pending.push(promise)
		return promise
	}
	const cache = {
		...realCache,
		writeArtifacts: (...args: Parameters<typeof realCache.writeArtifacts>) => track(realCache.writeArtifacts(...args)),
		writeMjs: (...args: Parameters<typeof realCache.writeMjs>) => track(realCache.writeMjs(...args)),
		writeDts: (...args: Parameters<typeof realCache.writeDts>) => track(realCache.writeDts(...args)),
	}
	let compiles = 0
	const countingSolc = {
		...solc,
		version: () => solc.version(),
		compile: (...args: Parameters<typeof solc.compile>) => {
			compiles += 1
			return solc.compile(...args)
		},
	}
	const { logger, errors } = makeLogger()
	return {
		errors,
		compiles: () => compiles,
		flush: () => Promise.all(pending.splice(0)),
		bundler: bundler({ ...defaultConfig, cacheDir }, logger, fao, countingSolc as any, cache, '@tevm/contract'),
	}
}

/** Executes generated CommonJS with a stub `createContract` that returns its config */
const runCjs = (code: string): Record<string, any> => {
	const module = { exports: {} as Record<string, any> }
	const require = (id: string) => {
		expect(id).toBe('@tevm/contract')
		return { createContract: (config: unknown) => config }
	}
	new Function('require', 'module', 'exports', code)(require, module, module.exports)
	return module.exports
}

describe('bundler fuzz', { timeout: 300_000 }, () => {
	const tempDirs: string[] = []
	const makeWorkspace = () => {
		const workspace = mkdtempSync(join(tmpdir(), 'tevm-base-bundler-fuzz-'))
		tempDirs.push(workspace)
		return workspace
	}

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('generates equivalent modules for cold async, cold sync, and warm cache resolution', async () => {
		await forAll('cold warm sync async', genProject, async (project) => {
			const workspace = makeWorkspace()
			const file = join(workspace, project.script ? 'Fuzz.s.sol' : 'Fuzz.sol')
			writeFileSync(file, render(project))
			const { includeBytecode } = project

			const a = makeBundler(workspace, join(workspace, '.tevm-async'))
			const b = makeBundler(workspace, join(workspace, '.tevm-sync'))

			const formats = [
				['resolveEsmModule', 'resolveEsmModuleSync'],
				['resolveCjsModule', 'resolveCjsModuleSync'],
				['resolveTsModule', 'resolveTsModuleSync'],
				['resolveDts', 'resolveDtsSync'],
			] as const

			const codes: Record<string, string> = {}
			for (const [asyncName, syncName] of formats) {
				const coldAsync = await a.bundler[asyncName](file, workspace, false, includeBytecode)
				await a.flush()
				const coldSync = b.bundler[syncName](file, workspace, false, includeBytecode)
				expect(coldSync.code).toBe(coldAsync.code)

				// warm hits from the other code path return the same module
				const warmSync = a.bundler[syncName](file, workspace, false, includeBytecode)
				const warmAsync = await b.bundler[asyncName](file, workspace, false, includeBytecode)
				await b.flush()
				expect(warmSync.code).toBe(coldAsync.code)
				expect(warmAsync.code).toBe(coldAsync.code)
				codes[asyncName] = coldAsync.code
			}

			// each cache compiled the file exactly once across all formats
			expect(a.compiles()).toBe(1)
			expect(b.compiles()).toBe(1)
			expect(a.errors).toEqual([])
			expect(b.errors).toEqual([])

			// generated CommonJS runs and exports every contract with its ABI
			const exported = runCjs(codes['resolveCjsModule'] as string)
			for (const contract of project.contracts) {
				const config = exported[contract.name]
				expect(config?.name).toBe(contract.name)
				const abiText = JSON.stringify(config.humanReadableAbi ?? config.abi)
				for (const fn of contract.functions) {
					expect(abiText).toContain(`function ${fn.name}(`)
				}
				if (contract.event) expect(abiText).toContain('event Changed(')
				if (includeBytecode) {
					expect(config.bytecode).toMatch(/^0x[0-9a-f]+$/)
					expect(config.deployedBytecode).toMatch(/^0x[0-9a-f]+$/)
				} else {
					expect(config).not.toHaveProperty('bytecode')
				}
			}

			// ESM, TypeScript, and declaration output mention every contract
			for (const name of ['resolveEsmModule', 'resolveTsModule', 'resolveDts']) {
				const code = codes[name] as string
				expect(code).toContain("from '@tevm/contract'")
				for (const contract of project.contracts) {
					expect(code).toContain(contract.name)
				}
			}
		})
	})

	it('never serves a stale module after the Solidity source changes', async () => {
		await forAll('invalidation', genProject, async (project) => {
			const workspace = makeWorkspace()
			const file = join(workspace, 'Fuzz.sol')
			writeFileSync(file, render(project))
			const { bundler: resolved, flush, compiles } = makeBundler(workspace, join(workspace, '.tevm'))

			const before = await resolved.resolveCjsModule(file, workspace, false, false)
			await flush()
			expect(runCjs(before.code)).not.toHaveProperty('AddedLater')

			writeFileSync(file, `${render(project)}\ncontract AddedLater { function added() external {} }`)
			// make the change visible even on file systems with coarse timestamps
			const future = new Date(Date.now() + 5_000)
			utimesSync(file, future, future)

			const after = await resolved.resolveCjsModule(file, workspace, false, false)
			await flush()
			expect(compiles()).toBe(2)
			expect(runCjs(after.code)['AddedLater']?.name).toBe('AddedLater')
			expect(resolved.resolveCjsModuleSync(file, workspace, false, false).code).toBe(after.code)
			expect(compiles()).toBe(2)
		})
	})

	it('rejects invalid Solidity in every format without writing a cache entry that later succeeds', async () => {
		await forAll('invalid source', genProject, async (project) => {
			const workspace = makeWorkspace()
			const file = join(workspace, 'Fuzz.sol')
			writeFileSync(file, `${render(project)}\ncontract Broken { function (`)
			const { bundler: resolved, flush, errors } = makeBundler(workspace, join(workspace, '.tevm'))

			await expect(resolved.resolveEsmModule(file, workspace, false, false)).rejects.toThrow('Compilation failed')
			await flush()
			expect(() => resolved.resolveEsmModuleSync(file, workspace, false, false)).toThrow('Compilation failed')
			await expect(resolved.resolveDts(file, workspace, false, false)).rejects.toThrow('Compilation failed')
			expect(errors.length).toBeGreaterThan(0)
		})
	})
})
