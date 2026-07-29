import { compileContract } from './compiler/compileContracts.js'

/**
 * Resolves the import graph of a Solidity file, compiles it with solc, and
 * extracts one artifact per contract defined in the file.
 *
 * Bytecode is only compiled when `includeBytecode` is true — the bundlers pass
 * true for `.s.sol` files and false for plain `.sol`, because most application
 * code only needs the ABI.
 *
 * @type {import('./types.js').ResolveArtifacts}
 * @throws {Error} `'Not a solidity file'` if `solFile` does not end in `.sol`
 * @throws {Error} `'Compilation failed'` if solc produced no artifacts. Solc's own
 *   diagnostics are reported through `logger.error` before this is thrown.
 * @example
 * ```javascript
 * import { resolveArtifacts } from '@tevm/compiler'
 * import { defaultConfig } from '@tevm/config'
 * import { createSolc } from '@tevm/solc'
 * import { existsSync, readFileSync } from 'node:fs'
 * import { readFile } from 'node:fs/promises'
 *
 * const fao = {
 *   readFile: (path, encoding) => readFile(path, { encoding }),
 *   readFileSync,
 *   existsSync,
 *   exists: async (path) => existsSync(path),
 * }
 *
 * const { artifacts, modules } = await resolveArtifacts(
 *   './contracts/Counter.s.sol',
 *   process.cwd(),
 *   console,
 *   defaultConfig,
 *   false, // includeAst
 *   true,  // includeBytecode
 *   fao,
 *   await createSolc('0.8.30'),
 * )
 *
 * console.log(Object.keys(artifacts)) // ['Counter']
 * console.log(Object.keys(modules))   // every file in the import graph
 * ```
 */
export const resolveArtifacts = async (solFile, basedir, logger, config, includeAst, includeBytecode, fao, solc) => {
	if (!solFile.endsWith('.sol')) {
		throw new Error('Not a solidity file')
	}
	const { artifacts, modules, asts, solcInput, solcOutput } = await compileContract(
		solFile,
		basedir,
		config,
		includeAst,
		includeBytecode,
		fao,
		logger,
		solc,
	)

	if (!artifacts) {
		logger.error(`Compilation failed for ${solFile}`)
		throw new Error('Compilation failed')
	}

	return {
		artifacts: Object.fromEntries(
			Object.entries(artifacts).map(([contractName, contract]) => {
				return [
					contractName,
					{
						contractName,
						abi: contract.abi,
						userdoc: contract.userdoc,
						evm: contract.evm,
					},
				]
			}),
		),
		modules,
		asts,
		solcInput,
		solcOutput,
	}
}
