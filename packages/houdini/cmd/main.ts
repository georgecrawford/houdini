#!/usr/bin/env node

// external imports
import { getConfig } from 'houdini-common'
import { Command } from 'commander'
import path from 'path'
import * as graphql from 'graphql'
// local imports
import compile from './compile'
import init from './init'
import { writeSchema } from './utils/writeSchema'

// build up the cli
const program = new Command()

// register the generate command
program
	.command('generate')
	.description('generate the application runtime')
	.option('-p, --pull-schema', 'pull the latest schema before generating')
	.action(async (args: { pullSchema: boolean } = { pullSchema: false }) => {
		// grab the config file
		const config = await getConfig()

		try {
			// Pull the newest schema if the flag is set
			if (args.pullSchema) {
				// Check if apiUrl is set in config
				if (!config.apiUrl) {
					throw new Error(
						'Your config should contain a valid apiUrl to pull the latest schema.'
					)
				}
				// The target path -> current working directory by default. Should we allow passing custom paths?
				const targetPath = process.cwd()
				// Write the schema
				const schema = await writeSchema(
					config.apiUrl,
					config.schemaPath ? config.schemaPath : path.resolve(targetPath, 'schema.json')
				)
				// Set the newly written schema into the config
				config.schema = schema
			}
			await compile(config)
		} catch (e) {
			console.error(e)
		}
	})

// register the init command
program.command('init [path]').description('initialize a new houdini project').action(init)

// start the command
program.parse()
