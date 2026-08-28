'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
    console.log(`[publishRelease] ${msg}`)
}

function error(msg) {
    console.error(`[publishRelease] ERROR: ${msg}`)
}

function die(msg) {
    error(msg)
    process.exit(1)
}

// ─── CLI Flags Parser ─────────────────────────────────────────────────────────
// Supports:
//   --mandatory           → isMandatory: true
//   --no-mandatory        → isMandatory: false
//   --appId <val>
//   --jsVersion <val>
//   --bundleVersion <val>
//   --hash <val>
//   --bundleUrl <val>
//   --rollout <val>
//   --releaseState <val>
//   --description <val>
//   --env staging|prod    → which environment to target (default: staging)
//   --skip-staging        → skip moving to STAGING state (stays in CREATED)
//   --skip-live           → skip moving to LIVE state (stays in STAGING)
//   --skip-rollout        → skip setting rollout (stays at 0)

function parseArgs(argv) {
    const flags = {}
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--mandatory') { flags.isMandatory = true; continue }
        if (arg === '--no-mandatory') { flags.isMandatory = false; continue }
        if (arg === '--skip-staging') { flags.skipStaging = true; continue }
        if (arg === '--skip-live') { flags.skipLive = true; continue }
        if (arg === '--skip-rollout') { flags.skipRollout = true; continue }

        const next = argv[i + 1]
        if (arg === '--env') { flags.env = next; i++; continue }
        if (arg === '--appId') { flags.appId = next; i++; continue }
        if (arg === '--jsVersion') { flags.jsVersion = parseInt(next, 10); i++; continue }
        if (arg === '--bundleVersion') { flags.bundleVersion = parseInt(next, 10); i++; continue }
        if (arg === '--hash') { flags.hash = next; i++; continue }
        if (arg === '--bundleUrl') { flags.bundleUrl = next; i++; continue }
        if (arg === '--rollout') { flags.rollout = parseInt(next, 10); i++; continue }
        if (arg === '--releaseState') { flags.releaseState = parseInt(next, 10); i++; continue }
        if (arg === '--description') { flags.description = next; i++; continue }
    }
    return flags
}

// ─── Config Loader ────────────────────────────────────────────────────────────

function loadReleaseConfig() {
    const cfgPath = path.join(__dirname, '..', 'release.config.json')
    if (!fs.existsSync(cfgPath)) {
        die('release.config.json not found in project root. Create it first.')
    }
    try {
        return JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    } catch (e) {
        die(`Failed to parse release.config.json: ${e.message}`)
    }
}

// ─── Samconfig Reader (for region + function name prefix) ────────────────────

function readSamConfig(env) {
    const cfgPath = path.join(__dirname, '..', 'samconfig.toml')
    const txt = fs.readFileSync(cfgPath, 'utf8')

    // Find the correct section: [default.deploy.parameters] for prod, [staging.deploy.parameters] for staging
    const section = env === 'prod' ? 'default' : env
    const sectionRegex = new RegExp(`\\[${section}\\.deploy\\.parameters\\]([\\s\\S]*?)(?=\\n\\[|$)`)
    const sectionMatch = txt.match(sectionRegex)
    if (!sectionMatch) {
        die(`Could not find [${section}.deploy.parameters] in samconfig.toml`)
    }

    const sectionTxt = sectionMatch[1]

    const regionMatch = sectionTxt.match(/region\s*=\s*"([^"]+)"/)
    const region = regionMatch ? regionMatch[1] : null

    // Extract ServicePrefix from parameter_overrides
    // samconfig stores it as: ServicePrefix=\"delta-staging\"
    const overridesMatch = sectionTxt.match(/^[^#]*parameter_overrides\s*=\s*"((?:[^"\\]|\\.)*)"/m)
    let servicePrefix = null
    if (overridesMatch) {
        // Unescape the value so we can match cleanly
        const overridesUnescaped = overridesMatch[1].replace(/\\"/g, '"')
        const prefixMatch = overridesUnescaped.match(/ServicePrefix="([^"]+)"/)
        if (prefixMatch) servicePrefix = prefixMatch[1]
    }

    return { region, servicePrefix }
}

// ─── Lambda Invoker ───────────────────────────────────────────────────────────

function invokeLambda(functionName, region, payload) {
    const payloadStr = JSON.stringify(payload)
    const tmpFile = path.join('/tmp', `delta_payload_${Date.now()}.json`)
    fs.writeFileSync(tmpFile, payloadStr, 'utf8')

    const responseFile = path.join('/tmp', `delta_response_${Date.now()}.json`)

    log(`Invoking ${functionName} ...`)

    try {
        execFileSync('aws', [
            'lambda', 'invoke',
            '--function-name', functionName,
            '--region', region,
            '--cli-binary-format', 'raw-in-base64-out',
            '--payload', `file://${tmpFile}`,
            responseFile,
        ], { encoding: 'utf8' })
    } catch (e) {
        die(`Lambda invoke failed for ${functionName}: ${e.message}`)
    }

    const raw = fs.readFileSync(responseFile, 'utf8')
    let parsed
    try {
        parsed = JSON.parse(raw)
    } catch (e) {
        die(`Could not parse Lambda response: ${raw}`)
    }

    // Lambda response body is a JSON string inside parsed.body
    let body = {}
    if (parsed.body) {
        try {
            body = JSON.parse(parsed.body)
        } catch (_) {
            body = parsed.body
        }
    }

    const statusCode = parsed.statusCode
    if (statusCode && statusCode >= 400) {
        die(`Lambda ${functionName} returned ${statusCode}: ${JSON.stringify(body)}`)
    }

    if (body.error) {
        die(`Lambda ${functionName} error: ${body.error}`)
    }

    // Cleanup temp files
    fs.unlinkSync(tmpFile)
    fs.unlinkSync(responseFile)

    return body.data
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    const args = process.argv.slice(2)
    const flags = parseArgs(args)

    // Load config file as defaults
    const cfg = loadReleaseConfig()

    // Merge: CLI flags override config file values
    const env             = flags.env            ?? 'staging'
    const appId           = flags.appId          ?? cfg.appId
    const jsVersion       = flags.jsVersion      ?? cfg.jsVersion
    const bundleVersion   = flags.bundleVersion  ?? cfg.bundleVersion
    const hash            = flags.hash           ?? cfg.hash
    const bundleUrl       = flags.bundleUrl      ?? cfg.bundle?.url
    const rollout         = flags.rollout        ?? cfg.rollout        ?? 100
    const isMandatory     = flags.isMandatory    ?? cfg.isMandatory    ?? false
    const description     = flags.description    ?? cfg.description    ?? ''
    const nativeRelease   = cfg.nativeRelease    ?? false
    const appVersion      = cfg.appVersion       || undefined
    const skipStaging     = flags.skipStaging    ?? false
    const skipLive        = flags.skipLive       ?? false
    const skipRollout     = flags.skipRollout    ?? false

    // ── Validate required fields ──────────────────────────────────────────────
    if (!appId)         die('appId is required — set it in release.config.json or pass --appId')
    if (!jsVersion)     die('jsVersion is required — set it in release.config.json or pass --jsVersion')
    if (bundleVersion === undefined || bundleVersion === null || isNaN(bundleVersion))
                        die('bundleVersion is required — set it in release.config.json or pass --bundleVersion')
    if (!hash)          die('hash is required — set it in release.config.json or pass --hash')
    if (!bundleUrl)     die('bundle.url is required — set it in release.config.json or pass --bundleUrl')

    // ── Resolve Lambda function names + region from samconfig.toml ────────────
    const { region, servicePrefix } = readSamConfig(env)
    if (!region)        die(`Could not read region from samconfig.toml for env="${env}"`)
    if (!servicePrefix) die(`Could not read ServicePrefix from samconfig.toml for env="${env}"`)

    const createFn = `${servicePrefix}-PostReleaseCreateFunction`
    const updateFn = `${servicePrefix}-PostReleaseUpdateFunction`

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('')
    console.log('════════════════════════════════════════')
    console.log('  Delta Release Publisher')
    console.log('════════════════════════════════════════')
    console.log(`  env           : ${env}`)
    console.log(`  region        : ${region}`)
    console.log(`  servicePrefix : ${servicePrefix}`)
    console.log(`  appId         : ${appId}`)
    console.log(`  jsVersion     : ${jsVersion}`)
    console.log(`  bundleVersion : ${bundleVersion}`)
    console.log(`  hash          : ${hash}`)
    console.log(`  bundleUrl     : ${bundleUrl}`)
    console.log(`  isMandatory   : ${isMandatory}`)
    console.log(`  rollout       : ${rollout}%`)
    console.log(`  description   : ${description || '(none)'}`)
    console.log('════════════════════════════════════════')
    console.log('')

    const baseUpdatePayload = {
        body: JSON.stringify({ appId, jsVersion, bundleVersion }),
    }

    // ── Step 1: Create release ────────────────────────────────────────────────
    log(`Step 1/4 — Creating release (CREATED state, rollout 0%) ...`)
    const createPayload = {
        body: JSON.stringify({
            appId,
            jsVersion,
            bundleVersion,
            hash,
            bundle: { url: bundleUrl },
            isMandatory,
            nativeRelease,
            ...(appVersion ? { appVersion } : {}),
            ...(description ? { description } : {}),
        }),
    }
    invokeLambda(createFn, region, createPayload)
    log(`✔ Release created — isMandatory: ${isMandatory}`)

    // ── Step 2: Move to STAGING ───────────────────────────────────────────────
    if (!skipStaging) {
        log(`Step 2/4 — Moving to STAGING (state 10) ...`)
        invokeLambda(updateFn, region, {
            body: JSON.stringify({ appId, jsVersion, bundleVersion, releaseState: 10 }),
        })
        log(`✔ Release is now STAGING — visible to internal users (iu=true)`)
    } else {
        log(`Step 2/4 — Skipped (--skip-staging). Release stays in CREATED state.`)
    }

    // ── Step 3: Move to LIVE ──────────────────────────────────────────────────
    if (!skipStaging && !skipLive) {
        log(`Step 3/4 — Moving to LIVE (state 20) ...`)
        invokeLambda(updateFn, region, {
            body: JSON.stringify({ appId, jsVersion, bundleVersion, releaseState: 20 }),
        })
        log(`✔ Release is now LIVE — rollout still 0%`)
    } else {
        log(`Step 3/4 — Skipped. Release will not be moved to LIVE.`)
    }

    // ── Step 4: Set rollout ───────────────────────────────────────────────────
    if (!skipStaging && !skipLive && !skipRollout) {
        log(`Step 4/4 — Setting rollout to ${rollout}% ...`)
        invokeLambda(updateFn, region, {
            body: JSON.stringify({ appId, jsVersion, bundleVersion, rollout }),
        })
        log(`✔ Rollout set to ${rollout}%`)
    } else {
        log(`Step 4/4 — Skipped. Rollout stays at 0%.`)
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    console.log('')
    console.log('════════════════════════════════════════')
    console.log('  ✅ Release published successfully!')
    console.log(`  appId         : ${appId}`)
    console.log(`  jsVersion     : ${jsVersion}`)
    console.log(`  bundleVersion : ${bundleVersion}`)
    console.log(`  isMandatory   : ${isMandatory}`)
    console.log(`  rollout       : ${skipRollout || skipLive || skipStaging ? '0' : rollout}%`)
    console.log('════════════════════════════════════════')
    console.log('')
}

main()
