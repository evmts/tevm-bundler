/**
 * Property fuzz tests for the compile pipeline (`resolveArtifacts`, `resolveArtifactsSync`).
 *
 * Random Solidity projects (import DAGs with inheritance, relative and remapped imports,
 * unreachable files) are written to an in-memory file system and compiled with the real solc.
 *
 * Self-contained: uses a seeded PRNG instead of an external property testing dependency.
 * Override with FUZZ_SEED and FUZZ_RUNS.
 */
import { posix } from 'node:path'
import solc from 'solc'
import { describe, expect, it } from 'vitest'
import { resolveArtifacts } from './resolveArtifacts.js'
import { resolveArtifactsSync } from './resolveArtifactsSync.js'
import type { FileAccessObject } from './types.js'

const SEED = Number(process.env['FUZZ_SEED'] ?? 0x7e5d2026) >>> 0
const RUNS = Math.max(1, Number(process.env['FUZZ_RUNS'] ?? 25))

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
// project generator
// ---------------------------------------------------------------------------

const ROOT = '/tevm-fuzz-vfs'
const LIB_PREFIX = '@lib/'
const LIB_DIR = `${ROOT}/lib/`
const DIRS = ['src', 'src/utils', 'lib', 'lib/deep', 'contracts/with space']
const TYPES = ['uint256', 'address', 'bool', 'bytes32', 'string memory', 'uint8[] memory'] as const

type Fn = { name: string; params: string[]; view: boolean }
type File = {
	path: string
	/** indexes of imported files; always greater than the importing index, so the graph is a DAG */
	imports: number[]
	/** subset of `imports` the contract inherits from */
	parents: number[]
	functions: Fn[]
	/** a second, independent contract defined in the same file */
	extraContract: boolean
}
type Project = { files: File[]; useRemappings: boolean }

const genProject = (rng: Rng): Project => {
	const count = rng.int(1, 6)
	const files: File[] = []
	for (let i = 0; i < count; i++) {
		const imports: number[] = []
		for (let j = i + 1; j < count; j++) if (rng.bool(0.4)) imports.push(j)
		const functions: Fn[] = Array.from({ length: rng.int(0, 3) }, (_, k) => ({
			// function names are unique across the project so inheritance never clashes
			name: `f${i}_${k}`,
			params: Array.from({ length: rng.int(0, 3) }, () => rng.pick(TYPES)),
			view: rng.bool(),
		}))
		files.push({
			path: `${ROOT}/${rng.pick(DIRS)}/C${i}${rng.pick(['', '.s', '.t'])}.sol`,
			imports,
			// most base-like first (higher index), otherwise C3 linearization is impossible
			parents: imports.filter(() => rng.bool(0.6)).reverse(),
			functions,
			extraContract: rng.bool(0.3),
		})
	}
	return { files, useRemappings: rng.bool() }
}

const specifierFor = (project: Project, from: File, to: File) => {
	if (project.useRemappings && to.path.startsWith(LIB_DIR)) {
		return `${LIB_PREFIX}${to.path.slice(LIB_DIR.length)}`
	}
	const relative = posix.relative(posix.dirname(from.path), to.path)
	return relative.startsWith('.') ? relative : `./${relative}`
}

const renderFile = (project: Project, index: number) => {
	const file = project.files[index] as File
	const lines = ['// SPDX-License-Identifier: MIT', 'pragma solidity ^0.8.20;']
	for (const to of file.imports) {
		lines.push(`import {C${to}} from "${specifierFor(project, file, project.files[to] as File)}";`)
	}
	const inheritance = file.parents.length > 0 ? ` is ${file.parents.map((parent) => `C${parent}`).join(', ')}` : ''
	lines.push(`contract C${index}${inheritance} {`)
	for (const fn of file.functions) {
		const params = fn.params.map((type, i) => `${type} p${i}`).join(', ')
		lines.push(
			`\tfunction ${fn.name}(${params}) external ${fn.view ? 'view ' : ''}returns (uint256) { return ${index}; }`,
		)
	}
	lines.push('}')
	if (file.extraContract) {
		lines.push(`contract Extra${index} { event Ping${index}(uint256 indexed value); }`)
	}
	return lines.join('\n')
}

const renderProject = (project: Project) =>
	new Map(project.files.map((file, index) => [file.path, renderFile(project, index)]))

const closure = (project: Project, start: number, edges: (file: File) => number[]) => {
	const seen = new Set<number>()
	const stack = [start]
	while (stack.length > 0) {
		const index = stack.pop() as number
		if (seen.has(index)) continue
		seen.add(index)
		stack.push(...edges(project.files[index] as File))
	}
	return seen
}

const makeFao = (sources: Map<string, string>): FileAccessObject => {
	const read = (file: string) => {
		const source = sources.get(file)
		if (source === undefined) throw new Error(`ENOENT: no such file or directory, open '${file}'`)
		return source
	}
	return {
		readFile: async (file) => read(file),
		readFileSync: (file) => read(file),
		exists: async (file) => sources.has(file),
		existsSync: (file) => sources.has(file),
	}
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

const configFor = (project: Project) => ({
	jsonAsConst: [],
	foundryProject: false,
	debug: false,
	cacheDir: '.tevm',
	libs: [],
	remappings: project.useRemappings ? { [LIB_PREFIX]: LIB_DIR } : {},
})

const compile = async (project: Project, sources: Map<string, string>, includeBytecode: boolean) => {
	const entry = (project.files[0] as File).path
	const { logger } = makeLogger()
	const fao = makeFao(sources)
	const config = configFor(project)
	const asyncResult = await resolveArtifacts(entry, ROOT, logger, config, false, includeBytecode, fao, solc)
	const syncResult = resolveArtifactsSync(entry, ROOT, logger, config, false, includeBytecode, fao, solc)
	return { asyncResult, syncResult }
}

const functionNames = (abi: ReadonlyArray<{ type: string; name?: string }>) =>
	abi
		.filter((item) => item.type === 'function')
		.map((item) => item.name as string)
		.sort()

// ---------------------------------------------------------------------------
// properties
// ---------------------------------------------------------------------------

describe('compiler fuzz', { timeout: 300_000 }, () => {
	it('compiles exactly the reachable import graph and agrees between async and sync', async () => {
		await forAll('reachable graph', genProject, async (project) => {
			const sources = renderProject(project)
			const includeBytecode = project.files.length % 2 === 0
			const { asyncResult, syncResult } = await compile(project, sources, includeBytecode)

			// sync and async are the same pipeline
			expect(syncResult.solcInput).toEqual(asyncResult.solcInput)
			expect(syncResult.artifacts).toEqual(asyncResult.artifacts)
			expect(Object.keys(syncResult.modules).sort()).toEqual(Object.keys(asyncResult.modules).sort())

			// solc receives the reachable files and nothing else
			const reachable = [...closure(project, 0, (file) => file.imports)].map(
				(index) => (project.files[index] as File).path,
			)
			expect(Object.keys(asyncResult.solcInput?.sources ?? {}).sort()).toEqual([...reachable].sort())
			expect(Object.keys(asyncResult.modules).sort()).toEqual([...reachable].sort())
			for (const path of reachable) {
				const module = asyncResult.modules[path]
				expect(module?.rawCode).toBe(sources.get(path))
				// solc compiles the rewritten module code (absolute import paths), not the raw source
				const source = asyncResult.solcInput?.sources[path] as { content?: string } | undefined
				expect(source?.content).toBe(module?.code)
			}

			// artifacts are the contracts defined in the entry file
			const entry = project.files[0] as File
			expect(Object.keys(asyncResult.artifacts).sort()).toEqual(
				['C0', ...(entry.extraContract ? ['Extra0'] : [])].sort(),
			)

			// the entry ABI holds its own functions plus every inherited one
			const ancestors = closure(project, 0, (file) => file.parents)
			const expectedFunctions = [...ancestors].flatMap((index) =>
				(project.files[index] as File).functions.map((fn) => fn.name),
			)
			const entryArtifact = asyncResult.artifacts['C0']
			expect(entryArtifact?.contractName).toBe('C0')
			expect(functionNames(entryArtifact?.abi as any)).toEqual(expectedFunctions.sort())

			// bytecode is only emitted on request
			const bytecode = entryArtifact?.evm?.bytecode?.object
			if (includeBytecode) {
				expect(bytecode).toMatch(/^[0-9a-f]+$/)
			} else {
				expect(bytecode).toBeUndefined()
			}
		})
	})

	it('is deterministic for the same project', async () => {
		await forAll('deterministic', genProject, async (project) => {
			const sources = renderProject(project)
			const first = await compile(project, sources, true)
			const second = await compile(project, sources, true)
			expect(second.asyncResult.artifacts).toEqual(first.asyncResult.artifacts)
			expect(second.asyncResult.solcInput).toEqual(first.asyncResult.solcInput)
		})
	})

	it('fails on a syntax error in a reachable file and ignores one in an unreachable file', async () => {
		await forAll(
			'syntax errors',
			(rng) => {
				const project = genProject(rng)
				return { project, target: rng.int(0, project.files.length - 1) }
			},
			async ({ project, target }) => {
				const sources = renderProject(project)
				const path = (project.files[target] as File).path
				sources.set(path, `${sources.get(path)}\ncontract Broken${target} { function (`)
				const reachable = closure(project, 0, (file) => file.imports)
				const entry = (project.files[0] as File).path
				const config = configFor(project)
				const fao = makeFao(sources)

				if (!reachable.has(target)) {
					const { asyncResult, syncResult } = await compile(project, sources, false)
					expect(Object.keys(asyncResult.artifacts)).toContain('C0')
					expect(syncResult.artifacts).toEqual(asyncResult.artifacts)
					return
				}

				const asyncLog = makeLogger()
				await expect(resolveArtifacts(entry, ROOT, asyncLog.logger, config, false, false, fao, solc)).rejects.toThrow(
					'Compilation failed',
				)
				// solc's diagnostics reach the logger before the throw
				expect(JSON.stringify(asyncLog.errors)).toContain('ParserError')

				const syncLog = makeLogger()
				expect(() => resolveArtifactsSync(entry, ROOT, syncLog.logger, config, false, false, fao, solc)).toThrow(
					'Compilation failed',
				)
				expect(JSON.stringify(syncLog.errors)).toContain('ParserError')
			},
		)
	})

	it('rejects paths that are not Solidity files', async () => {
		await forAll(
			'non solidity',
			(rng) => `${ROOT}/src/File${rng.int(0, 99)}${rng.pick(['.ts', '.sol.js', '', '.json', '.solx'])}`,
			async (path) => {
				const { logger } = makeLogger()
				const fao = makeFao(new Map([[path, 'contract A {}']]))
				const config = configFor({ files: [], useRemappings: false })
				await expect(resolveArtifacts(path, ROOT, logger, config, false, false, fao, solc)).rejects.toThrow(
					'Not a solidity file',
				)
				expect(() => resolveArtifactsSync(path, ROOT, logger, config, false, false, fao, solc)).toThrow(
					'Not a solidity file',
				)
			},
		)
	})
})
