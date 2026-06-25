import { APIGatewayProxyEvent, APIGatewayProxyEventQueryStringParameters } from 'aws-lambda'
import { AppReleaseItem, Table, ReleaseState } from '../../data/model'
import { AwsSdk } from '../../utils/sdkHelpers'
import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { isAppIdValidNEnabled } from '../getRegistry/app'
import { getCDNUrl, getRegistryVersionKey, getReleaseVersionKey } from '../../utils/helpers'
import { handlerWrapper } from '../../utils/handlerWrapper'
import camelCase from 'lodash.camelcase'

type GetReleaseListApiQueryParams = {
    _appId: string
    _jsVersion?: number
    _bundleVersion?: number
    _releaseState?: Array<ReleaseState>
    _rollout?: number
    _limit?: number
    _appVersion?: string
    _nextKey?: Record<string, string>
}

const DEFAULT_GET_LIST_LIMIT = 100

const getReleaseList = async (event: APIGatewayProxyEvent) => {
    let queryParams: GetReleaseListApiQueryParams

    try {
        queryParams = parseParams(event.queryStringParameters)
        await isAppIdValidNEnabled(queryParams._appId)
    } catch (ex) {
        //Catch local parsing and validation related errors
        return { status: 400, error: ex.message }
    }

    const query = queryReleaseItems(queryParams)
    const result = await AwsSdk.getDynamoDBClient().send(query)
    const items = result.Items as Array<AppReleaseItem>

    //Format Response
    const releaseList = formatReleaseList(items ?? [])

    return {
        status: 200,
        data: { releases: releaseList, count: result.Count ?? 0, nextKey: JSON.stringify(result.LastEvaluatedKey) },
    }
}

//Create our get Query
//appId is mandatory param
//All other params are optional, so we will generate the query based on their availability
const queryReleaseItems = (params: GetReleaseListApiQueryParams): QueryCommand => {
    let keyConditionExpression = 'AppId = :appId'
    let filterExpression = ''
    const attributeValues: Record<string, string | number> = { ':appId': params._appId }

    if (params._jsVersion) {
        if (typeof params._bundleVersion === 'number') {
            //Create our Sorting Key and Get
            keyConditionExpression += ' AND ReleaseVersion = :releaseVersion'
            attributeValues[':releaseVersion'] = getReleaseVersionKey(params._jsVersion, params._bundleVersion)
        } else {
            //Get with begins_with condition
            keyConditionExpression += ' AND begins_with(ReleaseVersion, :releaseKey)'
            attributeValues[':releaseKey'] = getReleaseVersionKey(params._jsVersion)
        }
    } else {
        //Check for all releases greater than 0 (Non Registry Items)
        keyConditionExpression += ' AND ReleaseVersion > :registryVersion'
        attributeValues[':registryVersion'] = getRegistryVersionKey()

        if (typeof params._bundleVersion === 'number') {
            filterExpression += 'BundleVersion = :patch'
            attributeValues[':patch'] = params._bundleVersion
        }
    }

    if (Array.isArray(params._releaseState) && params._releaseState?.length) {
        filterExpression += filterExpression ? ` AND ` : ''
        filterExpression += `ReleaseState in (${params._releaseState.map((_, i) => `:rs${i}`).join()})`
        params._releaseState.forEach((rs, i) => {
            attributeValues[`:rs${i}`] = rs
        })
    }

    if (typeof params._rollout === 'number') {
        filterExpression += filterExpression ? ` AND ` : ''
        filterExpression += `Rollout = :rollout`
        attributeValues[':rollout'] = params._rollout
    }

    if (typeof params._appVersion === 'string') {
        filterExpression += filterExpression ? ` AND ` : ''
        filterExpression += `AppVersion = :appVersion`
        attributeValues[':appVersion'] = params._appVersion
    }

    return new QueryCommand({
        TableName: Table.getAppReleases(),
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: filterExpression.trim() || undefined,
        ExpressionAttributeValues: attributeValues,
        Limit: params._limit,
        ScanIndexForward: false,
        ExclusiveStartKey: params._nextKey,
    })
}

//Parse Query Params
//Apart from appID, all fields are optional
const parseParams = (qp: APIGatewayProxyEventQueryStringParameters): GetReleaseListApiQueryParams => {
    const queryParams = qp || {}
    const appId = queryParams['appId']
    let _jsVersion = parseInt(queryParams['jsVersion'], 10)
    let _bundleVersion = parseInt(queryParams['bundleVersion'], 10)
    let _releaseStateStr = queryParams['releaseState']
    let _releaseState: Array<ReleaseState> | undefined = undefined
    let _rollout = parseInt(queryParams['rollout'], 10)
    let _limit = parseInt(queryParams['limit'], 10)
    let appVersion = queryParams['appVersion']
    let nextKeyString = queryParams['nextKey']
    let _nextKey: Record<string, string> | undefined = undefined

    if (!appId || typeof appId !== 'string') {
        throw new Error(`valid appId is required`)
    }

    if (isNaN(_jsVersion) || _jsVersion <= 0) {
        _jsVersion = undefined
    }

    if (isNaN(_bundleVersion) || _bundleVersion < 0) {
        _bundleVersion = undefined
    }

    if (_releaseStateStr?.trim()) {
        _releaseState = _releaseStateStr
            ?.trim()
            ?.split(',')
            .map((rs) => parseInt(rs, 10))
            .filter((rs) => !isNaN(rs) && Object.values(ReleaseState).some((state) => state === rs))
    }

    if (isNaN(_rollout) || _rollout < 0 || _rollout > 100) {
        _rollout = undefined
    }

    if (isNaN(_limit) || _limit < 0) {
        _limit = DEFAULT_GET_LIST_LIMIT
    }

    if (nextKeyString && typeof nextKeyString !== 'string') {
        throw new Error('Next Key should be a string')
    } else if (nextKeyString && typeof nextKeyString == 'string') {
        try {
            _nextKey = JSON.parse(nextKeyString) as Record<string, string>
        } catch (e) {
            throw new Error(`Error paring key nextKey: ${e.toString()}`)
        }
    }

    if (appVersion && typeof appVersion !== 'string') {
        throw new Error('App Version should be a string')
    }

    return {
        _appId: appId.trim(),
        _jsVersion,
        _bundleVersion,
        _releaseState,
        _rollout,
        _limit,
        _appVersion: appVersion?.trim() || undefined,
        _nextKey: _nextKey,
    }
}

//Column names are PascalCase in DynamoDB; convert to camelCase for the API response
//Patches column is an object for faster retrieval and updation, but the client will consume it as a list so converting it here itself
const formatReleaseList = (items: Array<AppReleaseItem>) => {
    return items.map((item) => {
        return Object.keys(item).reduce((formattedObject, pascalCaseKey: keyof AppReleaseItem) => {
            if (pascalCaseKey === 'Patches') {
                const patchList = !item[pascalCaseKey]
                    ? []
                    : Object.keys(item[pascalCaseKey]).map((key) => {
                          return {
                              id: key,
                              ...item[pascalCaseKey][key],
                          }
                      })

                const cdnPatchList = patchList.map((patch) => ({ ...patch, url: getCDNUrl(patch.url) }))

                return {
                    ...formattedObject,
                    ['patchList']: cdnPatchList,
                }
            }

            if (pascalCaseKey === 'Bundle') {
                return {
                    ...formattedObject,
                    [camelCase(pascalCaseKey)]: {
                        ...item[pascalCaseKey],
                        url: getCDNUrl(item[pascalCaseKey].url),
                    },
                }
            }

            return {
                ...formattedObject,
                [camelCase(pascalCaseKey)]: item[pascalCaseKey],
            }
        }, {})
    })
}

export const handler = handlerWrapper(getReleaseList).bind(this)
