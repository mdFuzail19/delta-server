'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

function readSamDeployParams() {
    const cfgPath = path.join(__dirname, '..', 'samconfig.toml')
    const txt = fs.readFileSync(cfgPath, 'utf8')
    const stackMatch = txt.match(/stack_name\s*=\s*"([^"]+)"/)
    const regionMatch = txt.match(/^\s*region\s*=\s*"([^"]+)"/m)
    return {
        stack: stackMatch ? stackMatch[1] : null,
        region: regionMatch ? regionMatch[1] : process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || null,
    }
}

function main() {
    const envStack = process.env.STACK_NAME
    const { stack: cfgStack, region } = readSamDeployParams()
    const stackName = envStack || cfgStack
    if (!stackName) {
        console.error('postDeploy: no stack name — set STACK_NAME or stack_name in samconfig.toml.')
        process.exit(1)
    }

    console.error(
        `postDeploy: describing CloudFormation outputs for stack="${stackName}"` +
            (region ? ` region="${region}"` : ' (no region in samconfig.toml; using AWS CLI default)'),
    )

    const args = [
        'cloudformation',
        'describe-stacks',
        '--stack-name',
        stackName,
        '--query',
        'Stacks[0].Outputs',
        '--output',
        'json',
    ]
    if (region) {
        args.push('--region', region)
    }

    let raw
    try {
        raw = execFileSync('aws', args, { encoding: 'utf8' })
    } catch (e) {
        console.error(`postDeploy: aws describe-stacks failed for "${stackName}":`, e.message || e)
        process.exit(1)
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) {
        console.error(
            `postDeploy: stack "${stackName}" has no Outputs. Use the same stack name ` +
                'as sam deploy (see samconfig.toml `stack_name`) and confirm the deployment succeeded.',
        )
        process.exit(1)
    }

    const outputs = parsed.reduce((acc, o) => {
        acc[o.OutputKey] = o.OutputValue
        return acc
    }, {})

    const required = ['S3Bucket', 'S3Region', 'LambdaRegion', 'GetLatestPatchFunction']
    const missingKeys = required.filter((k) => !outputs[k])
    if (missingKeys.length > 0) {
        console.error(
            `postDeploy: Outputs missing keys: ${missingKeys.join(', ')}. ` +
                `Got keys: ${Object.keys(outputs).sort().join(', ')}`,
        )
        process.exit(1)
    }

    const config = {
        s3: { bucket: outputs.S3Bucket, region: outputs.S3Region },
        lambda: {
            region: outputs.LambdaRegion,
            getLatestPatch: outputs.GetLatestPatchFunction,
            getReleaseList: outputs.GetReleaseListFunction,
            createRelease: outputs.CreateReleaseFunction,
            updateRelease: outputs.UpdateReleaseFunction,
            getRegistryList: outputs.GetRegistryListFunction,
            createRegistry: outputs.CreateRegistryFunction,
            invalidateCache: outputs.InvalidateCacheFunction,
        },
    }

    const outPath = path.join(__dirname, '..', 'delta.config.json')
    fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
    console.log('\n=== Prod Deployment Config ===\n' + JSON.stringify(config, null, 2))
    console.log('==============================\n')
}

main()
