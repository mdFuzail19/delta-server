//Wrapper function to be used for all apis
//Catch any errors not caught by respective api fucntions

import { Logger } from './LoggerWrapper'

//Send response in proper format
export function handlerWrapper(apiFunction: Function) {
    const context = this

    return async function () {
        let responseBody
        let statusCode = 200
        const headers = {
            'Content-Type': 'application/json',
        }

        try {
            const { status, data, error } = await apiFunction.apply(context, arguments)
            statusCode = status
            responseBody = { data, error }
        } catch (err: any) {
            Logger.error('Error ', err)
            statusCode = 500
            responseBody = { error: 'Something Went wrong' }
        }

        return {
            statusCode,
            headers,
            body: JSON.stringify(responseBody),
        }
    }
}
