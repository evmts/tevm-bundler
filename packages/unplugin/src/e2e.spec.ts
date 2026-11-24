/**
 * End-to-end test of the bundler pipeline with nothing mocked except `process.cwd()`:
 *
 *   project on disk -> config (tsconfig + remappings.txt) -> import resolution
 *   -> solc -> runtime codegen -> file system cache -> executable ES module
 *
 * The generated module is written to disk and imported, so the test proves the output
 * runs against the real `@tevm/contract`.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { tevmUnplugin } from './tevmUnplugin.js'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))

const files = {
	'tsconfig.json': JSON.stringify({ compilerOptions: { plugins: [{ name: '@tevm/ts-plugin' }] } }),
	'remappings.txt': '@utils/=vendor/utils/\n',
	'vendor/utils/Math.sol': `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
library Math {
	function add(uint256 a, uint256 b) internal pure returns (uint256) { return a + b; }
}
`,
	'contracts/Owned.sol': `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Owned {
	address public owner;
	event OwnerChanged(address indexed previous, address indexed next);
	constructor() { owner = msg.sender; }
}
`,
	'contracts/Counter.s.sol': `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Math} from "@utils/Math.sol";
import "./Owned.sol";
/// @notice Counts things
contract Counter is Owned {
	uint256 public count;
	/// @notice Adds to the count
	function increment(uint256 by) external returns (uint256) {
		count = Math.add(count, by);
		return count;
	}
}
`,
	'contracts/Token.sol': `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Token {
	function balanceOf(address who) external pure returns (uint256) { return who == address(0) ? 0 : 1; }
}
`,
	'contracts/Sidecar.sol': 'contract Sidecar {}',
	'contracts/Sidecar.sol.ts': 'export const Sidecar = {}',
	'contracts/Broken.sol': 'pragma solidity ^0.8.20;\ncontract Broken { function (',
}

/** Polls until the non-blocking cache write has landed on disk */
const waitFor = async (condition: () => boolean) => {
	for (let i = 0; i < 200 && !condition(); i++) {
		await new Promise((resolve) => setTimeout(resolve, 25))
	}
	expect(condition()).toBe(true)
}

const listFiles = (directory: string): string[] =>
	existsSync(directory)
		? readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
				entry.isDirectory() ? listFiles(join(directory, entry.name)) : [join(directory, entry.name)],
			)
		: []

describe('bundler pipeline e2e', { timeout: 120_000 }, () => {
	let project: string

	const startPlugin = async () => {
		const plugin = (tevmUnplugin as any)({})
		const context = { addWatchFile: vi.fn() }
		await plugin.buildStart.call(context)
		return { plugin, context, load: (id: string): Promise<string> => plugin.load.call(context, id) }
	}

	const importGenerated = async (name: string, code: string) => {
		const out = join(project, 'out', name)
		mkdirSync(dirname(out), { recursive: true })
		writeFileSync(out, code)
		return import(/* @vite-ignore */ pathToFileURL(out).href)
	}

	beforeAll(() => {
		// The project lives under this package so the generated module resolves `@tevm/contract`.
		// `tmp/` is ignored by git and biome.
		const parent = join(packageDirectory, 'tmp')
		mkdirSync(parent, { recursive: true })
		project = mkdtempSync(join(parent, 'e2e-'))
		for (const [file, content] of Object.entries(files)) {
			mkdirSync(dirname(join(project, file)), { recursive: true })
			writeFileSync(join(project, file), content)
		}
		vi.spyOn(process, 'cwd').mockReturnValue(project)
	})

	afterAll(() => {
		vi.restoreAllMocks()
		rmSync(project, { recursive: true, force: true })
	})

	it('compiles a script with relative and remapped imports into a runnable contract module', async () => {
		const { plugin, context, load } = await startPlugin()
		const id = join(project, 'contracts/Counter.s.sol')
		expect(plugin.loadInclude(id)).toBe(true)

		const code = await load(id)
		const { Counter } = await importGenerated('Counter.mjs', code)

		expect(Counter.name).toBe('Counter')
		expect(Counter.humanReadableAbi).toEqual(
			expect.arrayContaining([
				'function count() view returns (uint256)',
				'function increment(uint256 by) returns (uint256)',
				'function owner() view returns (address)',
				'event OwnerChanged(address indexed previous, address indexed next)',
			]),
		)
		// `.s.sol` files include bytecode
		expect(Counter.bytecode).toMatch(/^0x[0-9a-f]+$/)
		expect(Counter.deployedBytecode).toMatch(/^0x[0-9a-f]+$/)

		// action creators produced by the real @tevm/contract
		expect(Counter.read.count()).toMatchObject({ functionName: 'count', abi: expect.any(Array) })
		expect(Counter.write.increment(2n)).toMatchObject({ functionName: 'increment', args: [2n] })
		const address = `0x${'11'.repeat(20)}` as const
		expect(Counter.withAddress(address).read.owner()).toMatchObject({ functionName: 'owner', to: address })

		// every project file in the import graph is watched, including the remapped library
		const watched = context.addWatchFile.mock.calls.map(([file]) => file).sort()
		expect(watched).toEqual(
			['contracts/Counter.s.sol', 'contracts/Owned.sol', 'vendor/utils/Math.sol'].map((file) => join(project, file)),
		)
	})

	it('omits bytecode for plain .sol files', async () => {
		const { load } = await startPlugin()
		const code = await load(join(project, 'contracts/Token.sol'))
		const { Token } = await importGenerated('Token.mjs', code)
		expect(Token.humanReadableAbi).toEqual(['function balanceOf(address who) pure returns (uint256)'])
		expect(Token.bytecode).toBeUndefined()
		expect(code).not.toMatch(/bytecode/)
	})

	it('writes the cache on a cold build and a new build reuses it without compiling', async () => {
		const { default: solc } = await import('solc')
		const compile = vi.spyOn(solc, 'compile')
		const id = join(project, 'contracts/Owned.sol')

		const cold = await (await startPlugin()).load(id)
		expect(compile).toHaveBeenCalledTimes(1)
		const cacheDirectory = join(project, '.tevm')
		await waitFor(() => listFiles(cacheDirectory).some((file) => file.includes('Owned.sol') && file.endsWith('.json')))

		// a second build starts from a fresh plugin and resolves from the cache on disk
		const warm = await (await startPlugin()).load(id)
		expect(warm).toBe(cold)
		expect(compile).toHaveBeenCalledTimes(1)
		compile.mockRestore()
	})

	it('skips Solidity files that have a hand-written runtime sidecar', async () => {
		const { plugin } = await startPlugin()
		expect(plugin.loadInclude(join(project, 'contracts/Sidecar.sol'))).toBe(false)
		expect(plugin.loadInclude(join(project, 'contracts/Counter.ts'))).toBe(false)
	})

	it('fails the build on a Solidity compile error', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		const { load } = await startPlugin()
		await expect(load(join(project, 'contracts/Broken.sol'))).rejects.toThrow('Compilation failed')
		expect(JSON.stringify(error.mock.calls)).toContain('ParserError')
		error.mockRestore()
	})
})
