import { AppReleaseItem } from '../data/model'
import { PostCreateReleasePatchItem } from '../api/postCreateRelease/app'
import { AwsSdk } from './sdkHelpers'
import { CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { Logger } from './LoggerWrapper'

export const EnvConfig = {
    isDev: () => process.env.ENVIRONMENT === 'development' || !process.env.CLOUDFRONT_ID,
    getTableName: () => process.env.TABLE_NAME,
    getS3Url: () => process.env.S3_URL,
    getCloudFrontIds: () => process.env.CLOUDFRONT_ID.split(','),
    getCloudFrontUrl: () => {
        return process.env.DELTA_CLOUDFRONT_URL
    },
    getS3Bucket: () => process.env.S3_BUCKET,
    isQA: () => process.env.ENVIRONMENT === 'QA',
}

//Version is in this format (Four digit JS Version)-(Two digit patch Number)
//eg: '0099-01', '0101-12' etc
export const getReleaseVersionKey = (jsVersion: number, bundleVersion?: number) => {
    const jsKeyPadded = `${jsVersion}`.padStart(4, '0')
    const jsKey = jsKeyPadded.substring(jsKeyPadded.length - 4) //Get last four characters

    //patchNumber is optional and zero is also valid
    if (typeof bundleVersion === 'number') {
        const patchKeyPadded = `${bundleVersion}`.padStart(2, '0')
        const patchKey = patchKeyPadded.substring(patchKeyPadded.length - 2) //Get last two characters

        return `${jsKey}-${patchKey}`
    }

    //sending it this way helps in begins_with query without any additional manipulation
    return `${jsKey}-`
}

//We are keeping Registry objects as well in Releases Table which will have 0-0 version
export const getRegistryVersionKey = () => getReleaseVersionKey(0, 0)

//From a list of release items find out the item with max patch number
export const getMaxPatchItem = (items: Array<AppReleaseItem>): AppReleaseItem => {
    return items.reduce((acc, curr) => {
        return curr.BundleVersion > acc.BundleVersion ? curr : acc
    }, items[0])
}

//PatchKey is generated as patch-(two digit updated release patch number)-(two digit old app patch number)
//eg 'patch-02-00', 'patch-03-01' etc
export const getPatchKey = (releasePatchVersion: number, currentPatchVersion: number) => {
    const releasePatchPadded = `${releasePatchVersion}`.padStart(2, '0')
    const releasePatch = releasePatchPadded.substring(releasePatchPadded.length - 2) //Get last four characters

    const currentPatchPadded = `${currentPatchVersion}`.padStart(2, '0')
    const currentPatch = currentPatchPadded.substring(currentPatchPadded.length - 2) //Get last two characters

    return `patch-${releasePatch}-${currentPatch}`
}

//From a list of patches, find the relevant patch url
//We need to find whether a patch url exists for the bundle installe on the device,
//we do this by getting the key from getPatchKey function and checking i our
export const getPatchUrl = (item: AppReleaseItem, currentPatchVersion: number): string | null => {
    const patches = item.Patches ?? {}
    const patchKey = getPatchKey(item.BundleVersion, currentPatchVersion)
    return patches?.[patchKey]?.url
}

export const getCdnUrlParts = (url: string) => {
    const s3Url = EnvConfig.getS3Url()
    const cdnUrl = EnvConfig.getCloudFrontUrl()
    let endPoint = ''

    if (s3Url && cdnUrl) {
        if (url?.startsWith(s3Url)) {
            endPoint = url.replace(s3Url, '')
        }
    }

    return {
        baseUrl: cdnUrl,
        endPoint,
    }
}

//Replace our original S3 url with cdnUrl
export const getCDNUrl = (url: string) => {
    const s3Url = EnvConfig.getS3Url()
    const cdnUrl = EnvConfig.getCloudFrontUrl()

    if (s3Url && cdnUrl) {
        if (url?.startsWith(s3Url)) {
            return url.replace(s3Url, cdnUrl)
        }
    }

    return url
}

export const getPatchesObjectFromPatchList = (patchList: Array<PostCreateReleasePatchItem>) => {
    const patches: AppReleaseItem['Patches'] = {}

    patchList?.forEach((patch) => {
        patches[patch.id] = {
            ...patch,
        }
    })

    return patches
}

export const invalidateCheckUpdate = async (queryParam?: string) => {
    if (!!queryParam) {
        Logger.info('Invalidating Check Update with query param ', queryParam, EnvConfig.getCloudFrontIds())
        const items = [`/Prod/api/v1/check_update?${queryParam}*`]
        return await invalidateCloudfrontCache(items)
    }
    const items = ['/Prod/api/v1/check_update*']
    return await invalidateCloudfrontCache(items)
}

export const invalidateGetAppList = async () => {
    Logger.info('Invalidating Check Update with query param ', EnvConfig.getCloudFrontIds())
    const items = ['/Prod/api/v1/registry/*']
    return await invalidateCloudfrontCache(items)
}

export const invalidateReleaseList = async (queryParam?: string) => {
    if (EnvConfig.isQA()) {
        Logger.info('Invalidating Release List with query param ', EnvConfig.getCloudFrontIds())
        if (!!queryParam) {
            const items = [`/Prod/api/v1/release/list?${queryParam}*`]
            return await invalidateCloudfrontCache(items)
        }
        const items = [`/Prod/api/v1/release*`]
        return await invalidateCloudfrontCache(items)
    }
}

//Invalidate CloudFront cache, log errors if any
export const invalidateCloudfrontCache = async (items: Array<string>) => {
    const distributionIds = EnvConfig.getCloudFrontIds()
    return await Promise.all(distributionIds.map((id) => invalidateCloudfrontCacheForId(items, id)))
}

export const invalidateCloudfrontCacheForId = async (items: Array<string>, distributionId: string) => {
    if (EnvConfig.isDev()) {
        return true
    }

    const referenceId = new Date().toISOString()

    const command = new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
            CallerReference: referenceId,
            Paths: {
                Quantity: items.length,
                Items: items,
            },
        },
    })

    try {
        const result = await AwsSdk.getCloudFront().send(command)
        if (![200, 201].includes(result.$metadata?.httpStatusCode)) {
            Logger.error('Cloudfront code mismatch ', result.$metadata?.httpStatusCode, result)
        }
    } catch (ex) {
        Logger.error('Cloudfront Error ', ex)
        Logger.error('Cloudfront Response Error ', ex?.$response)
    }
}

//Check for null or undefined
export const isNullOrUndefined = (value: any) => value === null || value === undefined
