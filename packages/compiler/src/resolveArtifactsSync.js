import { compileContractSync } from './compiler/compileContractsSync.js'

/**
 * Synchronous variant of {@link import('./resolveArtifacts.js').resolveArtifacts}.
 *
 * This exists for callers that cannot await — the TypeScript language service
 * plugin and the Bun plugin both have to answer module resolution synchronously.
 * Prefer the async version everywhere else.
 *
 * @type {import('./types.js').ResolveArtifactsSync}
 * @throws {Error} `'Not a solidity file'` if `solFile` does not end in `.sol`
 * @throws {Error} `'Compilation failed'` if solc produced no artifacts. Solc's own
 *   diagnostics are reported through `logger.error` before this is thrown.
 * @example
 * ```javascript
 * import { resolveArtifactsSync } from '@tevm/compiler'
 * import { defaultConfig } from '@tevm/config'
 * import { existsSync, readFileSync } from 'node:fs'
 * import { readFile } from 'node:fs/promises'
 * import solc from 'solc'
 *
 * const fao = {
 *   readFile: (path, encoding) => readFile(path, { encoding }),
 *   readFileSync,
 *   existsSync,
 *   exists: async (path) => existsSync(path),
 * }
 *
 * const { artifacts } = resolveArtifactsSync(
 *   './contracts/Counter.sol',
 *   process.cwd(),
 *   console,
 *   defaultConfig,
 *   false, // includeAst
 *   false, // includeBytecode
 *   fao,
 *   solc,
 * )
 *
 * console.log(Object.keys(artifacts)) // ['Counter']
 * ```
 */
export const resolveArtifactsSync = (solFile, basedir, logger, config, includeAst, includeBytecode, fao, solc) => {
	if (!solFile.endsWith('.sol')) {
		throw new Error('Not a solidity file')
	}
	const { artifacts, modules, asts, solcInput, solcOutput } = compileContractSync(
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
