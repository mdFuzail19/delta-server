import { CreateTableInput, KeyType, ScalarAttributeType } from '@aws-sdk/client-dynamodb'
import { Table } from '../data/model'

export const AppReleasesTableSchema: CreateTableInput = {
    TableName: Table.getAppReleases(),
    KeySchema: [
        {
            AttributeName: 'AppId',
            KeyType: KeyType.HASH,
        },
        {
            AttributeName: 'ReleaseVersion',
            KeyType: KeyType.RANGE,
        },
    ],
    AttributeDefinitions: [
        {
            AttributeName: 'AppId',
            AttributeType: ScalarAttributeType.S,
        },
        {
            AttributeName: 'ReleaseVersion',
            AttributeType: ScalarAttributeType.S,
        },
    ],
    BillingMode: 'PAY_PER_REQUEST',
}
