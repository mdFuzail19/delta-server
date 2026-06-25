import {
    CreateTableCommand,
    CreateTableInput,
    DescribeTableCommand,
    DynamoDBClient,
    DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb'
import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3'
import { BatchWriteCommand, BatchWriteCommandInput, DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { CloudFront } from '@aws-sdk/client-cloudfront'
import envlocal from '../../envlocal.json' //Run `yarn load-env` if this file is missing.
import { EnvConfig } from './helpers'
import { Logger } from './LoggerWrapper'

export class AwsSdk {
    private static dbClient: DynamoDBDocumentClient | null = null
    private static cloudFront: CloudFront | null = null
    private static s3Client: S3Client | null = null

    static getDynamoDBClient() {
        if (!this.dbClient) {
            const config = EnvConfig.isDev() ? getLocalDbConfig() : undefined
            const dynamoClient = new DynamoDBClient(config)
            this.dbClient = DynamoDBDocumentClient.from(dynamoClient)
        }
        return this.dbClient
    }

    static getCloudFront() {
        if (!this.cloudFront) {
            const config = EnvConfig.isDev() ? getLocalDbConfig() : undefined
            this.cloudFront = new CloudFront(config)
        }
        return this.cloudFront
    }

    static getS3Client(config: S3ClientConfig = {}) {
        if (!this.s3Client) {
            const s3Config = EnvConfig.isDev() ? getLocalS3Config() : {}
            this.s3Client = new S3Client({ ...s3Config, ...config })
        }
        return this.s3Client
    }
}

export const createTableIfNotExist = async (schema: CreateTableInput) => {
    try {
        await AwsSdk.getDynamoDBClient().send(new DescribeTableCommand({ TableName: schema.TableName }))
        return
    } catch (describeErr) {
        Logger.log(`--------- Describe Table Failed for ${schema.TableName} : ${describeErr.message} ----------\n`)
        Logger.log(`--------- Creating Table ${schema.TableName} ---------- \n`)
    }

    try {
        const createResult = await AwsSdk.getDynamoDBClient().send(new CreateTableCommand(schema))
        Logger.success(
            `--------- Table ${schema.TableName} Created [${createResult.TableDescription?.TableStatus}] ---------- \n`,
        )
    } catch (createErr) {
        Logger.error(`--------- Error creating Table ${schema.TableName} ---------- \n`)
        throw new Error(createErr.message)
    }
}

export const insertIntoTable = async (tableName: string, item: Record<string, any>) => {
    try {
        await AwsSdk.getDynamoDBClient().send(new PutCommand({ TableName: tableName, Item: item }))
        Logger.success(`--------- Item inserted in Table ${tableName} ----------\n`)
    } catch (insertErr) {
        Logger.error(`--------- Error Inserting Item into Table ${tableName} ---------- \n`)
        Logger.error(`--------- ${insertErr.message} ---------- \n`)
        Logger.error(`${JSON.stringify(item)}\n\n`)
    }
}

const batchUpdate = async (tableName: string, batchInsertPayload: BatchWriteCommandInput) => {
    try {
        await AwsSdk.getDynamoDBClient().send(new BatchWriteCommand(batchInsertPayload))
        Logger.success(`--------- Batch Items inserted in Table ${tableName} ----------\n`)
    } catch (insertErr) {
        Logger.error(`--------- Error Inserting Item into Table ${tableName} ---------- \n`)
        Logger.error(`--------- ${insertErr.message} ---------- \n`)
    }
}

export const batchUpdateIntoTable = async (
    tableName: string,
    data: { putItems?: Array<Record<string, any>>; deleteItems?: Array<Record<string, any>> },
) => {
    if (data?.putItems?.length || data?.deleteItems?.length) {
        const requests: any = []

        if (data?.putItems?.length) {
            data.putItems.forEach((putItem) => {
                requests.push({
                    PutRequest: {
                        Item: putItem,
                    },
                })
            })
        }

        if (data?.deleteItems?.length) {
            data.deleteItems.forEach((deleteItem) => {
                requests.push({
                    DeleteRequest: {
                        Item: deleteItem,
                    },
                })
            })
        }

        await batchUpdate(tableName, { RequestItems: { [tableName]: requests } })
    }
}

const getLocalDbConfig = (): DynamoDBClientConfig => {
    return {
        endpoint: envlocal.Parameters.LOCAL_DYNAMO_DB_ENDPOINT,
        region: envlocal.Parameters.LOCAL_AWS_REGION,
        credentials: {
            accessKeyId: envlocal.Parameters.LOCAL_AWS_ACCESS_KEY,
            secretAccessKey: envlocal.Parameters.LOCAL_AWS_SECRET_KEY,
        },
    }
}

const getLocalS3Config = (): S3ClientConfig => {
    return {
        region: envlocal.Parameters.LOCAL_AWS_REGION,
        credentials: {
            accessKeyId: envlocal.Parameters.LOCAL_AWS_ACCESS_KEY,
            secretAccessKey: envlocal.Parameters.LOCAL_AWS_SECRET_KEY,
        },
    }
}
