import * as serverProtocol from '@volar/language-server/protocol'
import { activateAutoInsertion, createLabsInfo, type LabsInfo } from '@volar/vscode'
import * as vscode from 'vscode'
import * as lsp from 'vscode-languageclient/node'
import { activateExtension } from './activateExtension.js'

let client: lsp.BaseLanguageClient

export async function activate(context: vscode.ExtensionContext) {
	const activated = await activateExtension(context.extensionUri, {
		joinPath: vscode.Uri.joinPath,
		createClient: (id, name, serverOptions, clientOptions) =>
			new lsp.LanguageClient(id, name, serverOptions as lsp.ServerOptions, clientOptions as lsp.LanguageClientOptions),
		activateAutoInsertion: (selector, languageClient) =>
			activateAutoInsertion(selector as vscode.DocumentSelector, languageClient as lsp.BaseLanguageClient),
		createLabsInfo: (protocol) => {
			const labsInfo = createLabsInfo(protocol as typeof serverProtocol)
			return {
				extensionExports: labsInfo.extensionExports,
				addLanguageClient: (languageClient) => labsInfo.addLanguageClient(languageClient as lsp.BaseLanguageClient),
			}
		},
		transportKindIpc: lsp.TransportKind.ipc,
		languageServerProtocol: serverProtocol,
	})
	client = activated.client as lsp.BaseLanguageClient
	return activated.exports as LabsInfo
}

export function deactivate(): Thenable<any> | undefined {
	return client?.stop()
}
