// external imports
import path from 'path'
import { Config } from 'houdini-common'
import { writeFile } from '../../utils'

export default async function generateAdapter(config: Config) {
	// the location of the adapter
	const adapterLocation = path.join(config.runtimeDirectory, 'adapter.mjs')

	// figure out which adapter we need to lay down
	const adapter = config.framework === 'sapper' ? sapperAdapter : sveltekitAdapter

	// write the index file that exports the runtime
	await writeFile(adapterLocation, adapter)
}

const sapperAdapter = `import { stores, goto as go } from '@sapper/app'

export function getSession() {
    return stores().session
}

export function goTo(location, options) {
    go(location, options)
}
`

const sveltekitAdapter = `import { goto as go } from '$app/navigation'
import { getStores } from '$app/stores'

export function getSession() {
    return getStores().session
}

export function goTo(location, options) {
    go(location, options)
}
`
