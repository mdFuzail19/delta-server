import { AppRegistryItem, Table } from '../../data/model'
import { AwsSdk } from '../../utils/sdkHelpers'
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { handlerWrapper } from '../../utils/handlerWrapper'
import camelCase from 'lodash.camelcase'
import { getRegistryVersionKey } from '../../utils/helpers'

//Get list of all registered apps.
export const getRegistryApps = async () => {
    let result = await getRegistryData()
    let items = result.Items as Array<AppRegistryItem>

    while (result.LastEvaluatedKey) {
        const nextResult = await getRegistryData(result.LastEvaluatedKey ?? undefined)
        items = [...items, ...(nextResult.Items as Array<AppRegistryItem>)]
        result.LastEvaluatedKey = nextResult.LastEvaluatedKey
    }

    //Format the response
    const formattedList = formatRegistryList(items)

    return { status: 200, data: { apps: formattedList } }
}

const getRegistryData = async (LastEvaluatedKey: Record<string, any> | undefined = undefined) => {
    const query = new ScanCommand({
        TableName: Table.getAppReleases(),
        FilterExpression: `ReleaseVersion = :registryVersion AND IsEnabled = :enabled`,
        ExpressionAttributeValues: {
            ':registryVersion': getRegistryVersionKey(),
            ':enabled': true,
        },
        ProjectionExpression: 'AppId, AppName, Platform',
        ExclusiveStartKey: LastEvaluatedKey,
    })

    const result = await AwsSdk.getDynamoDBClient().send(query)

    return result
}

//This functions helps checking the appId against our registry if it is present
export const getAppWithId = async (appId: string) => {
    const query = new GetCommand({
        TableName: Table.getAppReleases(),
        Key: {
            AppId: appId,
            ReleaseVersion: getRegistryVersionKey(),
        },
    })

    const result = await AwsSdk.getDynamoDBClient().send(query)
    const item = result.Item as AppRegistryItem

    if (!item) {
        throw new Error('App Id not recognised')
    }

    return item
}

//Common helper function used in most of the apis
//This functions helps checking the appId against our registry if it is present and enabled = true
export const isAppIdValidNEnabled = async (appId: string) => {
    const item = await getAppWithId(appId)

    if (!item?.IsEnabled) {
        throw new Error(`App Id: ${appId} is currently disabled`)
    }

    return true
}

//Column names are PascalCase in DynamoDB; convert to camelCase for the API response
const formatRegistryList = (items: Array<AppRegistryItem>) => {
    return items.map((item) => {
        return Object.keys(item).reduce((formattedObject, pascalCaseKey: keyof AppRegistryItem) => {
            return {
                ...formattedObject,
                [camelCase(pascalCaseKey)]: item[pascalCaseKey],
            }
        }, {})
    })
}

export const handler = handlerWrapper(getRegistryApps).bind(this)
