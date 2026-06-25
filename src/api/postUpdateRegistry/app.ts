import { Table } from '../../data/model'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getRegistryVersionKey, invalidateGetAppList } from '../../utils/helpers'
import { getAppWithId } from '../getRegistry/app'
import { AwsSdk } from '../../utils/sdkHelpers'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { handlerWrapper } from '../../utils/handlerWrapper'

type PostUpdateRegistryApiBody = {
    _appId: string
    _isEnabled: boolean
}

const postUpdateRegistry = async (event: APIGatewayProxyEvent) => {
    let body: PostUpdateRegistryApiBody

    try {
        //Validate request body
        body = parseBody(event.body)

        //Check if app id present
        await getAppWithId(body._appId)
    } catch (ex) {
        //Catch local validation errors
        return { status: 400, error: ex.message }
    }

    const updateQuery = queryUpdateRegistry(body)
    await AwsSdk.getDynamoDBClient().send(updateQuery)

    await invalidateGetAppList()

    return { status: 200, data: { success: true } }
}

const queryUpdateRegistry = (params: PostUpdateRegistryApiBody): UpdateCommand => {
    let updateExpression = 'SET #UA = :timestamp, #IE = :isEnabled'
    let attributeNames: Record<string, string> = {
        '#UA': 'UpdatedAt',
        '#IE': 'IsEnabled',
    }
    let attributeValues: Record<string, boolean | string> = {
        ':timestamp': new Date().toISOString(),
        ':isEnabled': !!params._isEnabled,
    }

    return new UpdateCommand({
        TableName: Table.getAppReleases(),
        Key: {
            ['AppId']: params._appId,
            ['ReleaseVersion']: getRegistryVersionKey(),
        },
        ExpressionAttributeNames: attributeNames,
        ExpressionAttributeValues: attributeValues,
        UpdateExpression: updateExpression,
        ReturnValues: 'ALL_NEW',
    })
}

const parseBody = (requestBody: string | null): PostUpdateRegistryApiBody => {
    if (typeof requestBody !== 'string') {
        throw new Error('Body is required')
    }

    const body = JSON.parse(requestBody)
    const appId = body['appId']
    const _isEnabled = body['isEnabled']

    if (typeof _isEnabled !== 'boolean') {
        throw new Error('isEnabled field is required')
    }

    return {
        _appId: appId.trim(),
        _isEnabled,
    }
}

export const handler = handlerWrapper(postUpdateRegistry).bind(this)
