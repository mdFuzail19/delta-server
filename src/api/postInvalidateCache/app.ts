import { CacheInvalidationType } from '../../data/model'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { handlerWrapper } from '../../utils/handlerWrapper'
import { invalidateCheckUpdate, invalidateGetAppList, invalidateReleaseList } from '../../utils/helpers'

type PostInvalidateCacheApiBody = {
    _type: CacheInvalidationType
}

const postInvalidateCache = async (event: APIGatewayProxyEvent) => {
    let body: PostInvalidateCacheApiBody

    try {
        //Validate request body
        body = parseBody(event.body)
    } catch (ex) {
        //Catch local validation errors
        return { status: 400, error: ex.message }
    }

    switch (body._type) {
        case CacheInvalidationType.GET_REGISTRY: {
            await invalidateGetAppList()
            return { status: 200, data: { success: true } }
        }
        case CacheInvalidationType.CHECK_UPDATE: {
            await invalidateCheckUpdate()
            return { status: 200, data: { success: true } }
        }
        case CacheInvalidationType.RELEASE_LIST: {
            await invalidateReleaseList()
            return { status: 200, data: { success: true } }
        }
        case CacheInvalidationType.ALL: {
            await Promise.all([invalidateCheckUpdate(), invalidateGetAppList(), invalidateReleaseList()])
            return { status: 200, data: { success: true } }
        }

        default: {
            return { status: 400, error: 'Invalid Type' }
        }
    }
}

const parseBody = (requestBody: string | null): PostInvalidateCacheApiBody => {
    if (typeof requestBody !== 'string') {
        throw new Error('Body is required')
    }

    const body = JSON.parse(requestBody)
    let type = body['type']

    if (!type?.trim() || !Object.values(CacheInvalidationType).includes(type)) {
        throw new Error('Valid type is required')
    }

    return {
        _type: type,
    }
}

export const handler = handlerWrapper(postInvalidateCache).bind(this)
