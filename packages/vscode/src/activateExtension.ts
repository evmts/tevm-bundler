type Uri = {
	fsPath: string
}

type Client = {
	start(): Promise<unknown>
	stop(): Promise<unknown>
}

type LabsInfo = {
	extensionExports: unknown
	addLanguageClient(client: Client): void
}

type Dependencies = {
	joinPath(base: Uri, ...segments: string[]): Uri
	createClient(id: string, name: string, serverOptions: unknown, clientOptions: unknown): Client
	activateAutoInsertion(selector: readonly { language: string }[], client: Client): void
	createLabsInfo(languageServerProtocol: unknown): LabsInfo
	transportKindIpc: unknown
	languageServerProtocol: unknown
}

export const supportedLanguages = ['solidity', 'typescript', 'javascript'] as const

export async function activateExtension(extensionUri: Uri, dependencies: Dependencies) {
	const serverModule = dependencies.joinPath(extensionUri, 'dist', 'server.js')
	const serverOptions = {
		run: {
			module: serverModule.fsPath,
			transport: dependencies.transportKindIpc,
			options: { execArgv: [] },
		},
		debug: {
			module: serverModule.fsPath,
			transport: dependencies.transportKindIpc,
			options: { execArgv: ['--nolazy', '--inspect=6009'] },
		},
	}
	const clientOptions = {
		documentSelector: supportedLanguages.map((language) => ({ language })),
		initializationOptions: {},
	}
	const client = dependencies.createClient('tevm-language-server', 'Tevm Language Server', serverOptions, clientOptions)
	await client.start()
	dependencies.activateAutoInsertion(clientOptions.documentSelector, client)
	const labsInfo = dependencies.createLabsInfo(dependencies.languageServerProtocol)
	labsInfo.addLanguageClient(client)
	return {
		client,
		exports: labsInfo.extensionExports,
	}
}
