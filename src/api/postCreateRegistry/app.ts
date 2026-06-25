import { Table, AppRegistryItem } from '../../data/model'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { AwsSdk } from '../../utils/sdkHelpers'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { handlerWrapper } from '../../utils/handlerWrapper'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { getRegistryVersionKey } from '../../utils/helpers'

type PostCreateRegistryApiBody = {
    _appId: string
    _appName: string
    _platform: string
}

const postCreateRegistry = async (event: APIGatewayProxyEvent) => {
    let body: PostCreateRegistryApiBody

    try {
        //Validate request body
        body = parseBody(event.body)
    } catch (ex) {
        //Catch local validation errors
        return { status: 400, error: ex.message }
    }

    const registryItem: AppRegistryItem = {
        AppId: body._appId,
        ReleaseVersion: getRegistryVersionKey(),
        AppName: body._appName,
        Platform: body._platform as AppRegistryItem['Platform'],
        IsEnabled: true,
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
    }

    const putQuery = queryReleaseCreate(registryItem)
    try {
        await AwsSdk.getDynamoDBClient().send(putQuery)
    } catch (ex) {
        if (ex.__type?.includes(ConditionalCheckFailedException.name)) {
            return {
                status: 409,
                error: `App with id ${body._appId} is already present`,
            }
        } else {
            throw ex
        }
    }

    return { status: 200, data: { success: true } }
}

const queryReleaseCreate = (item: AppRegistryItem): PutCommand => {
    return new PutCommand({
        TableName: Table.getAppReleases(),
        Item: item,
        ConditionExpression: `attribute_not_exists(ReleaseVersion)`,
    })
}

const parseBody = (requestBody: string | null): PostCreateRegistryApiBody => {
    if (typeof requestBody !== 'string') {
        throw new Error('Body is required')
    }

    const body = JSON.parse(requestBody)
    const appId = body['appId']
    const appName = body['appName']
    const platform = body['platform']

    if (!appId?.trim() || typeof appId !== 'string') {
        throw new Error(`appId is required`)
    }

    if (!appName?.trim() || typeof appName !== 'string') {
        throw new Error(`appName is required`)
    }

    if (!platform?.trim() || typeof platform !== 'string') {
        throw new Error(`platform is required`)
    }

    return {
        _appId: appId.trim(),
        _appName: appName.trim(),
        _platform: platform.trim(),
    }
}

export const handler = handlerWrapper(postCreateRegistry).bind(this)
