import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	webpack: vi.fn((options) => ({
		name: '@tevm/webpack-plugin',
		options,
		apply: vi.fn(),
	})),
}))

vi.mock('./unplugin.js', () => ({
	unplugin: { webpack: mocks.webpack },
}))

import { WebpackPluginTevm } from './index.js'

describe('WebpackPluginTevm', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('creates and returns the webpack adapter with the provided options', () => {
		const options = { solc: '0.8.30' as const }
		const plugin = new WebpackPluginTevm(options)

		expect(mocks.webpack).toHaveBeenCalledOnce()
		expect(mocks.webpack).toHaveBeenCalledWith(options)
		expect(plugin).toMatchObject({
			name: '@tevm/webpack-plugin',
			options,
		})
		expect(plugin.apply).toBeTypeOf('function')
	})
})
