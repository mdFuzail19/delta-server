import {
    AppReleaseItem,
    Table,
    ReleaseState,
    ReleaseStateUpdateMapper,
    AllowedReleaseStatesForNativeRelease,
} from '../../data/model'
import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { getReleaseVersionKey, invalidateCheckUpdate, isNullOrUndefined } from '../../utils/helpers'
import { isAppIdValidNEnabled } from '../getRegistry/app'
import { AwsSdk } from '../../utils/sdkHelpers'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { handlerWrapper } from '../../utils/handlerWrapper'

type PostUpdateReleaseApiBody = {
    _appId: string
    _jsVersion: number
    _bundleVersion: number
    _releaseState?: ReleaseState
    _rollout?: number
    _defaultRelease?: boolean
    _description?: string
}

//need to do here as well
const postUpdateRelease = async (event: APIGatewayProxyEvent) => {
    let body: PostUpdateReleaseApiBody

    try {
        //Validate request body
        body = parseBody(event.body)

        //Check if app id present
        await isAppIdValidNEnabled(body._appId)
    } catch (ex) {
        //Catch local validation errors
        return { status: 400, error: ex.message }
    }

    //Get the exisiting item for update validations
    const getItemQuery = queryGetReleaseItem(body._appId, body._jsVersion, body._bundleVersion)
    const getResult = await AwsSdk.getDynamoDBClient().send(getItemQuery)

    if (!getResult.Item) {
        return { status: 404, error: 'Release Not found' }
    }

    const item = getResult.Item as AppReleaseItem

    //Validations for default Release parameter
    if (body._defaultRelease) {
        if (!item.NativeRelease) {
            return {
                status: 400,
                error: 'Non Native Releases cannot be marked as default release',
            }
        }

        //Get existing version with default release true
        //If we have any item with default release true. Throw an error
        const getDefaultReleaseItemQuery = queryDefaultReleaseItemQuery(item.AppId, item.AppVersion)
        const result = await AwsSdk.getDynamoDBClient().send(getDefaultReleaseItemQuery)

        if (result.Items && result.Items.length > 0) {
            return {
                status: 400,
                error: 'Default Release already exists. Please remove existing Default Release first',
            }
        }
    }

    //Validate allowed state transition
    if (typeof body._releaseState === 'number' && !isReleaseStateTransitionAllowed(body, item)) {
        return { status: 400, error: 'Moving to this state not allowed' }
    }

    //Validate Rollout update
    if (typeof body._rollout === 'number' && !isRolloutUpdateValid(body._rollout, item.Rollout)) {
        return { status: 400, error: 'Rollout percentage can only be increased' }
    }

    const updateQuery = queryUpdateRelease(body)
    await AwsSdk.getDynamoDBClient().send(updateQuery)

    const queryParam = `appId=${encodeURIComponent(body._appId)}&jsVersion=${body._jsVersion}`

    await invalidateCheckUpdate(queryParam)

    return { status: 200, data: { success: true } }
}

const queryGetReleaseItem = (appId: string, jsVersion: number, bundleVersion: number): GetCommand => {
    return new GetCommand({
        TableName: Table.getAppReleases(),
        Key: {
            AppId: appId,
            ReleaseVersion: getReleaseVersionKey(jsVersion, bundleVersion),
        },
    })
}

const queryDefaultReleaseItemQuery = (appId: string, appVersion: string): QueryCommand => {
    let keyConditionExpression = 'AppId = :appId'
    let filterExpression = 'AppVersion = :appVersion AND DefaultRelease = :defaultValue'
    const attributeValues: Record<string, string | boolean> = {
        ':appId': appId,
        ':appVersion': appVersion,
        ':defaultValue': true,
    }
    return new QueryCommand({
        TableName: Table.getAppReleases(),
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: attributeValues,
        ScanIndexForward: false,
    })
}

const queryUpdateRelease = (params: PostUpdateReleaseApiBody): UpdateCommand => {
    let updateExpression = 'SET #UA = :timestamp '
    let attributeNames: Record<string, string> = {
        '#UA': 'UpdatedAt',
    }
    let attributeValues: Record<string, number | string | boolean> = {
        ':timestamp': new Date().toISOString(),
    }

    if (!isNullOrUndefined(params._releaseState)) {
        updateExpression += ', #RS = :state'

        attributeNames = {
            ...attributeNames,
            '#RS': 'ReleaseState',
        }

        attributeValues = {
            ...attributeValues,
            ':state': params._releaseState,
        }
    }

    if (!isNullOrUndefined(params._rollout)) {
        updateExpression += ', #R = :rollout'

        attributeNames = {
            ...attributeNames,
            '#R': 'Rollout',
        }

        attributeValues = {
            ...attributeValues,
            ':rollout': params._rollout,
        }
    }

    if (!isNullOrUndefined(params._defaultRelease)) {
        updateExpression += ', #DR = :defaultRelease'

        attributeNames = {
            ...attributeNames,
            '#DR': 'DefaultRelease',
        }

        attributeValues = {
            ...attributeValues,
            ':defaultRelease': params._defaultRelease,
        }
    }

    if (!isNullOrUndefined(params._description)) {
        updateExpression += ', #DS = :description'

        attributeNames = {
            ...attributeNames,
            '#DS': 'Description',
        }

        attributeValues = {
            ...attributeValues,
            ':description': params._description,
        }
    }

    return new UpdateCommand({
        TableName: Table.getAppReleases(),
        Key: {
            ['AppId']: params._appId,
            ['ReleaseVersion']: getReleaseVersionKey(params._jsVersion, params._bundleVersion),
        },
        ExpressionAttributeNames: attributeNames,
        ExpressionAttributeValues: attributeValues,
        UpdateExpression: updateExpression,
        ReturnValues: 'ALL_NEW',
    })
}

const parseBody = (requestBody: string | null): PostUpdateReleaseApiBody => {
    if (typeof requestBody !== 'string') {
        throw new Error('Body is required')
    }

    const body = JSON.parse(requestBody)
    const appId = body['appId']
    let _jsVersion = parseInt(body['jsVersion'], 10)
    let _bundleVersion = parseInt(body['bundleVersion'], 10)
    let _releaseState = parseInt(body['releaseState'], 10)
    let _rollout = parseInt(body['rollout'], 10)
    let _defaultRelease = body['defaultRelease']
    let _description = body['description']

    if (!appId || typeof appId !== 'string') {
        throw new Error(`appId is required`)
    }

    if (isNaN(_jsVersion) || _jsVersion <= 0) {
        throw new Error(`valid js version is required`)
    }

    if (isNaN(_bundleVersion) || _bundleVersion < 0) {
        throw new Error(`valid bundle version is required`)
    }

    if (body['releaseState']) {
        if (isNaN(_releaseState) || !Object.values(ReleaseState).some((state) => Number(state) === _releaseState)) {
            throw new Error(`invalid release state`)
        }
    } else {
        _releaseState = undefined
    }

    if (body['rollout']) {
        if (isNaN(_rollout) || _rollout < 0 || _rollout > 100) {
            throw new Error(`invalid rollout percentage`)
        }
    } else {
        _rollout = undefined
    }

    if (
        _releaseState === undefined &&
        _rollout === undefined &&
        _defaultRelease === undefined &&
        _description === undefined
    ) {
        throw new Error(`No param for update provided`)
    }

    if (_defaultRelease && typeof _defaultRelease !== 'boolean') {
        throw new Error(`Invalid defaultRelease type`)
    }

    if (_description && typeof _description !== 'string') {
        throw new Error(`Invalid description type`)
    }

    return {
        _appId: appId.trim(),
        _jsVersion,
        _bundleVersion,
        _releaseState,
        _rollout,
        _defaultRelease,
        _description,
    }
}

//Match new state with our valid state mapper
const isReleaseStateTransitionAllowed = (newState: PostUpdateReleaseApiBody, oldItem: AppReleaseItem) => {
    const isNewStateAllowed = ReleaseStateUpdateMapper[oldItem.ReleaseState]?.includes(newState._releaseState)

    if (oldItem.DefaultRelease) {
        return AllowedReleaseStatesForNativeRelease.includes(newState._releaseState) && isNewStateAllowed
    } else {
        return isNewStateAllowed
    }
}

//Rollout cal only be increased
const isRolloutUpdateValid = (newRollout: number, oldRollout: number) => {
    return newRollout > oldRollout
}

export const handler = handlerWrapper(postUpdateRelease).bind(this)
