import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters } from 'aws-lambda'
import { AppReleaseItem, Table, ReleaseState } from '../../data/model'
import { AwsSdk } from '../../utils/sdkHelpers'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { getCDNUrl, getMaxPatchItem, getPatchUrl, getReleaseVersionKey } from '../../utils/helpers'
import { handlerWrapper } from '../../utils/handlerWrapper'
import { Logger } from '../../utils/LoggerWrapper'

type GetCheckUpdateApiQueryParams = {
    _appId: string
    _jsVersion: number
    _bundleVersion: number
    _bucket: number
    _iu: boolean //For Staging/Internal user check
}

const checkUpdate = async (event: APIGatewayProxyEvent) => {
    let queryParams: GetCheckUpdateApiQueryParams

    try {
        //Get sanitized query params and catch field validation errors
        queryParams = parseParams(event?.queryStringParameters)
    } catch (ex) {
        return { status: 400, error: ex.message }
    }

    Logger.log(queryParams)

    //We have slighly different query/conditions for internal vs external users
    let query
    if (queryParams._iu) {
        query = queryCheckUpdateInternalUser(queryParams)
    } else {
        query = queryCheckUpdate(queryParams)
    }

    const result = await AwsSdk.getDynamoDBClient().send(query)
    const items = result.Items as Array<AppReleaseItem>

    //No release matched our query (No update available)
    if (!items?.length) {
        return { status: 200, data: { isUpdateAvailable: false } }
    }

    //Check if the items contain any item with bundle version same as in request (Meaning it is in disabled or deleted state)
    if (items.some((it) => it.BundleVersion === queryParams._bundleVersion)) {
        return { status: 200, data: { rollback: true } }
    }

    //We have at least one item that matches our query (Update is available)
    const item = getMaxPatchItem(items)

    // Check if we have a patchUrl avaiable
    const patchUrl = getPatchUrl(item, queryParams._bundleVersion)

    return {
        status: 200,
        data: {
            isUpdateAvailable: true,
            isMandatory: false, //This feature is not being supported currently but sending default false value for now
            hash: item.Hash,
            jsVersion: item.JsVersion,
            bundleVersion: item.BundleVersion,
            releaseState: item.ReleaseState,
            patchUrl: patchUrl ? getCDNUrl(patchUrl) : null,
            bundleUrl: item.Bundle?.url ? getCDNUrl(item.Bundle.url) : null,
        },
    }
}

// DynamoDB Query To check if an update is available for all users
// KeyCondition: First fetch all releases by appId and release number
// Then filter out items according to these four conditions:
// 1) Patch version should be greater than the one sent in request (Update was created)
// 2) Release should be in Live State only (Update is avaiable for use)
// 3) Bucket number should be under rollout percentage (Update is available for this particular device)
// 4) Also check if the current bundle version is deleted or disabled state (Will use this for rollback check)
const queryCheckUpdate = (params: GetCheckUpdateApiQueryParams): QueryCommand => {
    return new QueryCommand({
        TableName: Table.getAppReleases(),
        KeyConditionExpression: 'AppId = :appId AND begins_with(ReleaseVersion, :releaseKey)',
        FilterExpression: `(BundleVersion = :bundle AND ReleaseState IN (:disabled, :deleted)) OR (BundleVersion > :bundle AND ReleaseState = :live AND Rollout >= :bucket)`,
        ExpressionAttributeValues: {
            ':appId': params._appId,
            ':releaseKey': getReleaseVersionKey(params._jsVersion),
            ':bundle': params._bundleVersion,
            ':live': ReleaseState.LIVE,
            ':disabled': ReleaseState.DISABLED,
            ':deleted': ReleaseState.DELETED,
            ':bucket': params._bucket,
        },
    })
}

// DynamoDB Query To check if an update is available for internal users
// Use case: Whenever we release an update, we will first make it available for internal users(both the staging bundles
// and the live bundles) before making it live for everyone else
// KeyCondition: First fetch all releases by appId and release number
// Then filter out items according to these three conditions:
// 1) Patch version should be greater than the one sent in request (Update was created)
// 2) Release should be in STAGING or LIVE State only (Update is avaiable for use)
// 3) Bucket number if sent is ignored
// 4) Also check if the current bundle version is deleted or disabled state (Will use this for rollback check)
const queryCheckUpdateInternalUser = (params: GetCheckUpdateApiQueryParams): QueryCommand => {
    return new QueryCommand({
        TableName: Table.getAppReleases(),
        KeyConditionExpression: 'AppId = :appId AND begins_with(ReleaseVersion, :releaseKey)',
        FilterExpression:
            '(BundleVersion = :bundle AND ReleaseState IN (:disabled, :deleted)) OR (BundleVersion > :bundle AND ReleaseState IN (:live, :staging))',
        ExpressionAttributeValues: {
            ':appId': params._appId,
            ':releaseKey': getReleaseVersionKey(params._jsVersion),
            ':bundle': params._bundleVersion,
            ':live': ReleaseState.LIVE,
            ':disabled': ReleaseState.DISABLED,
            ':deleted': ReleaseState.DELETED,
            ':staging': ReleaseState.STAGING,
        },
    })
}

//Sanitize all the query params and throw proper messages for field validations
const parseParams = (qp: APIGatewayProxyEventQueryStringParameters): GetCheckUpdateApiQueryParams => {
    const queryParams = qp || {}
    const appId = queryParams['appId']
    const _jsVersion = parseInt(queryParams['jsVersion'], 10)
    const _bundleVersion = parseInt(queryParams['bundleVersion'], 10)
    const _bucket = parseInt(queryParams['bucket'], 10)
    const _iu = queryParams['iu'] === 'true'
    const _is = queryParams['is'] === 'true'

    if (!appId || typeof appId !== 'string') {
        throw new Error(`valid appId is required`)
    }

    if (isNaN(_jsVersion) || _jsVersion <= 0) {
        throw new Error(`valid js version is required`)
    }

    if (isNaN(_bundleVersion) || _bundleVersion < 0) {
        throw new Error(`valid bundle version is required`)
    }

    if (isNaN(_bucket) || _bucket < 0 || _bucket > 100) {
        throw new Error(`valid bucket between (0-100) is required`)
    }

    return {
        _appId: appId.trim(),
        _jsVersion,
        _bundleVersion,
        _bucket,
        _iu,
    }
}

export const handler = handlerWrapper(checkUpdate).bind(this)
