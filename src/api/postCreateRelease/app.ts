import { AppReleaseItem, Table, ReleaseState } from '../../data/model'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import {
    getPatchesObjectFromPatchList,
    getReleaseVersionKey,
    invalidateCheckUpdate,
    invalidateReleaseList,
} from '../../utils/helpers'
import { isAppIdValidNEnabled } from '../getRegistry/app'
import { AwsSdk } from '../../utils/sdkHelpers'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { handlerWrapper } from '../../utils/handlerWrapper'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'

export type PostCreateReleasePatchItem = {
    id: string
    url: string
    [prop: string]: any
}

type PostCreateReleaseApiBody = {
    _appId: string
    _jsVersion: number
    _bundleVersion: number
    _bundle: { url: string; [prop: string]: any }
    _hash: string
    _patchList: Array<PostCreateReleasePatchItem>
    _releaseState?: ReleaseState
    _appVersion?: string
    _nativeRelease: boolean
    _description?: string
}

const postCreateRelease = async (event: APIGatewayProxyEvent) => {
    let body: PostCreateReleaseApiBody

    try {
        //Validate request body
        body = parseBody(event.body)
        //Check if app id present
        await isAppIdValidNEnabled(body._appId)
    } catch (ex) {
        //Catch local validation errors
        return { status: 400, error: ex.message }
    }

    try {
        // Validating the native release for JS version
        await validateNativeReleaseForJS(body)
    } catch (ex) {
        return { status: 400, error: ex.message }
    }

    const patches = getPatchesObjectFromPatchList(body._patchList)

    const releaseItem: AppReleaseItem = {
        AppId: body._appId,
        ReleaseVersion: getReleaseVersionKey(body._jsVersion, body._bundleVersion),
        JsVersion: body._jsVersion,
        BundleVersion: body._bundleVersion,
        Bundle: body._bundle,
        Hash: body._hash,
        Patches: patches,
        Rollout: 0,
        ReleaseState: body._releaseState || ReleaseState.CREATED,
        AppVersion: body._appVersion,
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
        NativeRelease: body._nativeRelease,
        DefaultRelease: false, // By default all releases are create in default as false mode
        Description: body._description || '', // Initialize with empty description
    }

    const putQuery = queryReleaseCreate(releaseItem)
    try {
        await AwsSdk.getDynamoDBClient().send(putQuery)
    } catch (ex) {
        if (ex.__type?.includes(ConditionalCheckFailedException.name)) {
            return {
                status: 409,
                error: `Release with JsVersion = ${body._jsVersion} and BundleVersion = ${body._bundleVersion} is already present`,
            }
        } else {
            throw ex
        }
    }

    const queryParam = `appId=${body._appId}&jsVersion=${body._jsVersion}`
    const releaseListQueryParam = `appId=${body._appId}`
    await invalidateCheckUpdate(queryParam)
    await invalidateReleaseList(releaseListQueryParam)

    return { status: 200, data: { success: true } }
}

const queryReleaseCreate = (item: AppReleaseItem): PutCommand => {
    return new PutCommand({
        TableName: Table.getAppReleases(),
        Item: item,
        ConditionExpression: `attribute_not_exists(ReleaseVersion)`,
    })
}

const getAppForJsVersion = (appId: string, jsVersion: number): QueryCommand => {
    return new QueryCommand({
        TableName: Table.getAppReleases(),
        KeyConditionExpression: 'AppId = :appId AND begins_with(ReleaseVersion, :releaseKey)',
        ExpressionAttributeValues: {
            ':appId': appId,
            ':releaseKey': getReleaseVersionKey(jsVersion),
        },
    })
}

// This function validates that JS Version can not have different app version
const validateNativeReleaseForJS = async (body: PostCreateReleaseApiBody) => {
    const { _jsVersion, _appId } = body
    const getQuery = getAppForJsVersion(_appId, _jsVersion)
    const getResult = await AwsSdk.getDynamoDBClient().send(getQuery)
    const items = getResult.Items as AppReleaseItem[]
    if (items && items.length > 0) {
        const item = items[0]
        if (item && item.AppVersion != body._appVersion) {
            throw new Error('JS Version can not have different app version')
        }
    }
}

const parseBody = (requestBody: string | null): PostCreateReleaseApiBody => {
    if (typeof requestBody !== 'string') {
        throw new Error('Body is required')
    }

    const body = JSON.parse(requestBody)
    const appId = body['appId']
    let _jsVersion = parseInt(body['jsVersion'], 10)
    let _bundleVersion = parseInt(body['bundleVersion'], 10)
    const hash = body['hash']
    const bundle = body['bundle']
    const patchList = body['patchList']
    const releaseStateValue = body['releaseState']
    const releaseState = releaseStateValue ? parseInt(releaseStateValue, 10) : undefined
    const appVersion = body['appVersion']
    const nativeRelease = body['nativeRelease']
    const description = body['description']

    if (!appId?.trim() || typeof appId !== 'string') {
        throw new Error(`appId is required`)
    }

    if (isNaN(_jsVersion) || _jsVersion <= 0) {
        throw new Error(`valid js version is required`)
    }

    if (isNaN(_bundleVersion) || _bundleVersion < 0) {
        throw new Error(`valid bundle version is required`)
    }

    if (!hash?.trim() || typeof hash !== 'string') {
        throw new Error(`hash is required`)
    }

    if (!bundle?.url?.trim()) {
        throw new Error('bundle url is required')
    }

    if (patchList) {
        if (!Array.isArray(patchList)) {
            throw new Error('invalid patchlist format')
        }

        for (const patch of patchList) {
            if (!patch?.id || !patch?.url?.trim()) {
                throw new Error('invalid patchlist data')
            }
        }
    }

    if (
        releaseStateValue &&
        (isNaN(releaseState) || ![ReleaseState.CREATED, ReleaseState.STAGING].includes(releaseState))
    ) {
        throw new Error(`invalid releaseState, only CREATED and STAGING allowed`)
    }

    if (appVersion && typeof appVersion !== 'string') {
        throw new Error('App Version should be a string')
    }

    if (nativeRelease && typeof nativeRelease !== 'boolean') {
        throw new Error('nativeRelease should be a boolean')
    }

    return {
        _appId: appId.trim(),
        _jsVersion,
        _bundleVersion,
        _hash: hash.trim(),
        _bundle: bundle,
        _patchList: patchList || null,
        _releaseState: releaseState,
        _appVersion: appVersion?.trim() || undefined,
        _nativeRelease: nativeRelease ?? false,
        _description: description?.trim() || undefined,
    }
}

export const handler = handlerWrapper(postCreateRelease).bind(this)
