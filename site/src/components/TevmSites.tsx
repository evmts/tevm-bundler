const SITES = [
	{ name: 'tevm', host: 'tevm.sh', href: 'https://tevm.sh' },
	{ name: 'test', host: 'test.tevm.sh', href: 'https://test.tevm.sh' },
	{ name: 'ethers', host: 'ethers.tevm.sh', href: 'https://ethers.tevm.sh' },
	{ name: 'mud', host: 'mud.tevm.sh', href: 'https://mud.tevm.sh' },
	{ name: 'cli', host: 'cli.tevm.sh', href: 'https://cli.tevm.sh' },
	{ name: 'bundler', host: 'bundler.tevm.sh', href: 'https://bundler.tevm.sh', current: true },
	{ name: 'examples', host: 'examples.tevm.sh', href: 'https://examples.tevm.sh' },
] as const

export function TevmSites() {
	return (
		<div className="tevm-sites">
			{SITES.map((site) => (
				<a
					key={site.host}
					className="tevm-site-card"
					data-current={'current' in site && site.current ? 'true' : undefined}
					href={site.href}
				>
					<span className="tevm-site-card-name">
						{site.name}
						{'current' in site && site.current ? ' · you are here' : ''}
					</span>
					<span className="tevm-site-card-host">{site.host}</span>
				</a>
			))}
		</div>
	)
}
