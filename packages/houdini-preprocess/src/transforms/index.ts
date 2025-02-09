// externals
import * as recast from 'recast'
import { runPipeline, Config, Transform, parseFile } from 'houdini-common'
// locals
import * as types from '../types'
import fragmentProcessor from './fragment'
import queryProcessor from './query'
import mutationProcessor from './mutation'
import subscriptionProcessor from './subscription'

const defaultTransforms = [
	fragmentProcessor,
	queryProcessor,
	mutationProcessor,
	subscriptionProcessor,
]

export default async function applyTransforms(
	config: Config,
	doc: { content: string; filename: string },
	pipeline: Transform<types.TransformDocument>[] = defaultTransforms
): Promise<{ code: string; dependencies: string[] }> {
	// a single transform might need to do different things to the module and
	// instance scripts so we're going to pull them out, push them through separately,
	// and then join them back together
	const scripts = parseFile(doc.content)

	// wrap everything up in an object we'll thread through the transforms
	const result: types.TransformDocument = {
		instance: scripts.instance,
		module: scripts.module,
		config,
		dependencies: [],
		filename: doc.filename,
	}

	// send the scripts through the pipeline
	await runPipeline(config, pipeline, result)

	// we need to apply the changes to the file. we'll do this by printing the mutated
	// content as a string and then replacing everything between the appropriate
	// script tags. the parser tells us the locations for the different tags so we
	// just have to replace the indices it tells us to
	const printedModule = result.module ? (recast.print(result.module.content).code as string) : ''
	const printedInstance = result.instance
		? (recast.print(result.instance.content).code as string)
		: ''

	// if there is a module and no instance
	if (result.module && !result.instance) {
		// just copy the module where it needs to go
		return {
			code: replaceTagContent(
				'module',
				doc.content,
				result.module.start,
				result.module.end,
				printedModule
			),
			dependencies: result.dependencies,
		}
	}

	// if there is an instance and no module
	if (result.instance && !result.module) {
		// the instance is lower than the module

		// just copy the instance where it needs to go
		return {
			code: replaceTagContent(
				'instance',
				doc.content,
				result.instance.start,
				result.instance.end,
				printedInstance
			),
			dependencies: result.dependencies,
		}
	}

	// if we still don't have any javascript on this page
	if (!result.module || !result.instance) {
		// ignore it
		return {
			code: doc.content,
			dependencies: [],
		}
	}

	// there is both a module and an instance so we want to replace the lowest
	// one first so that the first's indices stay valid after we change content

	// if the module is lower than the instance
	if (result.module.end > result.instance.end) {
		// replace the module content first
		const updatedModule = replaceTagContent(
			'module',
			doc.content,
			result.module.start,
			result.module.end,
			printedModule
		)

		return {
			code: replaceTagContent(
				'instance',
				updatedModule,
				result.instance.start,
				result.instance.end,
				printedInstance
			),
			dependencies: result.dependencies,
		}
	}

	// replace the instance content first (so the module indices are valid)
	const updatedInstance = replaceTagContent(
		'instance',
		doc.content,
		result.instance.start,
		result.instance.end,
		printedInstance
	)

	// then replace the module content
	return {
		code: replaceTagContent(
			'module',
			updatedInstance,
			result.module.start,
			result.module.end,
			printedModule
		),
		dependencies: result.dependencies,
	}
}

function replaceTagContent(
	context: 'module' | 'instance',
	source: string,
	start: number,
	end: number,
	insert: string
) {
	// if we're supposed to insert the tag
	if (start === 0 && end === 0) {
		// make sure to define the right context
		const attrs = context === 'module' ? ' context="module"' : ''

		// just add the script at the start
		return `<script${attrs}>${insert}</script>${source}`
	}

	// {start} points to the < of the opening tag, we want to find the >
	let greaterThanIndex = start
	// keep looking until the end
	while (greaterThanIndex < end) {
		// if we found the > we can stop looking
		if (source[greaterThanIndex] === '>') {
			break
		}

		// keep looking
		greaterThanIndex++
	}
	// if we didn't find it
	if (greaterThanIndex === start) {
		throw new Error('Could not find the end of the tag open')
	}

	// {end} points to the > of the closing tag
	let lessThanIndex = end
	while (lessThanIndex > greaterThanIndex) {
		// if we found the < we can stop looking
		if (source[lessThanIndex] === '<') {
			break
		}
		// keep looking
		lessThanIndex--
	}
	// if we didn't find it
	if (lessThanIndex === end) {
		throw new Error('Could not find the start of the tag close')
	}

	// replace the content between the closing of the open and open of the close
	return replaceBetween(source, greaterThanIndex + 1, lessThanIndex, insert)
}

// replaceSubstring replaces the substring string between the indices with the provided new value
const replaceBetween = (origin: string, startIndex: number, endIndex: number, insertion: string) =>
	origin.substring(0, startIndex) + insertion + origin.substring(endIndex)
