import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters } from 'aws-lambda'
import { AppReleaseItem, Table } from '../../data/model'
import { AwsSdk } from '../../utils/sdkHelpers'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { isAppIdValidNEnabled } from '../getRegistry/app'
import { getReleaseVersionKey } from '../../utils/helpers'
import { handlerWrapper } from '../../utils/handlerWrapper'

type GetReleaseLatestPatchApiQueryParams = {
    _appId: string
    _jsVersion: number
}

const getReleaseLatestBundle = async (event: APIGatewayProxyEvent) => {
    let queryParams: GetReleaseLatestPatchApiQueryParams

    try {
        queryParams = parseParams(event.queryStringParameters)
        await isAppIdValidNEnabled(queryParams._appId)
    } catch (ex) {
        return { status: 400, error: ex.message }
    }

    const query = new QueryCommand({
        TableName: Table.getAppReleases(),
        KeyConditionExpression: 'AppId = :appId AND begins_with(ReleaseVersion, :releaseKey)',
        ExpressionAttributeValues: {
            ':appId': queryParams._appId,
            ':releaseKey': getReleaseVersionKey(queryParams._jsVersion),
        },
        ScanIndexForward: false,
    })

    const result = await AwsSdk.getDynamoDBClient().send(query)
    const items = result.Items as Array<AppReleaseItem>

    if (!items?.length) {
        return { status: 404, error: 'No Release Found' }
    }

    return { status: 200, data: { bundleVersion: items[0].BundleVersion } }
}

const parseParams = (qp: APIGatewayProxyEventQueryStringParameters): GetReleaseLatestPatchApiQueryParams => {
    const queryParams = qp || {}
    const appId = queryParams['appId']
    let _jsVersion = parseInt(queryParams['jsVersion'], 10)

    if (!appId || typeof appId !== 'string') {
        throw new Error(`valid appId is required`)
    }

    if (isNaN(_jsVersion) || _jsVersion <= 0) {
        throw new Error(`valid js version is required`)
    }

    return {
        _appId: appId.trim(),
        _jsVersion,
    }
}

export const handler = handlerWrapper(getReleaseLatestBundle).bind(this)
