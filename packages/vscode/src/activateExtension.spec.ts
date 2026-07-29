import { describe, expect, it, vi } from 'vitest'
import { activateExtension } from './activateExtension.js'

describe('VS Code extension activation', () => {
	it('starts the TEVM language client with the shipped server and language selectors', async () => {
		const start = vi.fn(async () => undefined)
		const stop = vi.fn(async () => undefined)
		const createClient = vi.fn(() => ({ start, stop }))
		const activateAutoInsertion = vi.fn()
		const addLanguageClient = vi.fn()
		const extensionExports = { volarLabs: { version: '2.3.1' } }
		const createLabsInfo = vi.fn(() => ({ extensionExports, addLanguageClient }))
		const result = await activateExtension(
			{ fsPath: '/extension' },
			{
				joinPath: (base, ...segments) => ({ fsPath: [base.fsPath, ...segments].join('/') }),
				createClient,
				activateAutoInsertion,
				createLabsInfo,
				transportKindIpc: 'ipc',
				languageServerProtocol: { protocol: true },
			},
		)

		expect(start).toHaveBeenCalledOnce()
		expect(createClient).toHaveBeenCalledWith(
			'tevm-language-server',
			'Tevm Language Server',
			expect.objectContaining({
				run: expect.objectContaining({ module: '/extension/dist/server.js', transport: 'ipc' }),
			}),
			{
				documentSelector: [{ language: 'solidity' }, { language: 'typescript' }, { language: 'javascript' }],
				initializationOptions: {},
			},
		)
		expect(activateAutoInsertion).toHaveBeenCalledWith(
			[{ language: 'solidity' }, { language: 'typescript' }, { language: 'javascript' }],
			result.client,
		)
		expect(createLabsInfo).toHaveBeenCalledWith({ protocol: true })
		expect(addLanguageClient).toHaveBeenCalledWith(result.client)
		expect(result.exports).toBe(extensionExports)
		await result.client.stop()
		expect(stop).toHaveBeenCalledOnce()
	})
})
