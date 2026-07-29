import type { ReactNode } from 'react'

export function CodeWindow({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="tevm-codewin">
			<div className="tevm-codewin-titlebar">
				<span className="tevm-codewin-dot" />
				<span className="tevm-codewin-dot" />
				<span className="tevm-codewin-dot" />
				<span className="tevm-codewin-title">{title}</span>
			</div>
			<div className="tevm-codewin-body">{children}</div>
		</div>
	)
}
