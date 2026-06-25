import { exec } from 'child_process'
import fs from 'fs'
import { Logger } from '../utils/LoggerWrapper'

exec('ipconfig getifaddr en0', (err, stdout, stderr) => {
    const endpoint = err ? '' : stdout?.trim()
    const filePath = 'envlocal.json'

    if (stderr) {
        console.error(stderr)
    }

    const jsonContent = {
        Parameters: {
            LOCAL_DYNAMO_DB_ENDPOINT: `http://${endpoint}:8000`,
            LOCAL_AWS_ACCESS_KEY: 'itsLocalSoAnyStringIsValid',
            LOCAL_AWS_SECRET_KEY: 'itsLocalSoAnyStringIsValid',
            LOCAL_AWS_REGION: 'none',
        },
    }

    if (fs.existsSync(filePath)) {
        Logger.log('🗳️', `${filePath} already exists. Skipping creation.`)
        try {
            const content = JSON.parse(fs.readFileSync(filePath, { encoding: 'utf-8' }).toString())
            content.Parameters.LOCAL_DYNAMO_DB_ENDPOINT = jsonContent.Parameters.LOCAL_DYNAMO_DB_ENDPOINT
            fs.writeFile(filePath, JSON.stringify(content), () => {
                Logger.log('🗳️', filePath, 'db endpoint updated')
            })
        } catch (error) {
            Logger.error(error)
        }

        return
    }

    fs.writeFile(filePath, JSON.stringify(jsonContent), () => {
        Logger.log('🗂️', filePath, 'file created!')
    })
})
