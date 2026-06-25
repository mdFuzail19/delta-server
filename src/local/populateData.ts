import chalk from 'chalk'
import { batchUpdateIntoTable, createTableIfNotExist } from '../utils/sdkHelpers'
import { AppReleasesTableSchema } from './schema'
import { sampleAppReleasesData as sampleData, sampleAppRegistryData } from './sampleData'
import { Table } from '../data/model'
import envlocal from '../../envlocal.json' //Run `yarn load-env` if this file is missing.
import { Logger } from '../utils/LoggerWrapper'

const _loadEnvFromJsonForThisScript = () => {
    //This file (and function) will not run in production !
    if (envlocal?.Parameters) {
        Object.keys(envlocal.Parameters).forEach((key) => {
            //@ts-ignore
            process.env[key] = envlocal.Parameters[key]
        })
    }
}

_loadEnvFromJsonForThisScript()

const runPopulateData = async () => {
    await createTableIfNotExist(AppReleasesTableSchema)

    if (!sampleData || !Array.isArray(sampleData) || sampleData.length === 0) {
        throw new Error('Please provide valid releases data to populate')
    }

    await batchUpdateIntoTable(Table.getAppReleases(), { putItems: sampleData })

    if (!sampleAppRegistryData || !Array.isArray(sampleAppRegistryData) || sampleAppRegistryData.length === 0) {
        throw new Error('Please provide valid app registry data to populate')
    }

    await batchUpdateIntoTable(Table.getAppReleases(), { putItems: sampleAppRegistryData })
}

runPopulateData()
    .then(() => {
        Logger.success('\n\n--------- Local Data Populated Successfully ----------\n\n')
    })
    .catch((err) => {
        if (err?.message) {
            Logger.error(`\n\n${err.message}\n\n`)
            return
        }
        Logger.error('\n\n--------- Something Went Wrong ----------\n\n')
    })
