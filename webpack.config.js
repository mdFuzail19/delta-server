/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')

module.exports = {
    entry: {
        checkUpdate: './src/api/checkUpdate/app.ts',
        getRegistry: './src/api/getRegistry/app.ts',
        getReleaseList: './src/api/getReleaseList/app.ts',
        getReleaseLatestBundle: './src/api/getReleaseLatestBundle/app.ts',
        postCreateRelease: './src/api/postCreateRelease/app.ts',
        postUpdateRelease: './src/api/postUpdateRelease/app.ts',
        postCreateRegistry: './src/api/postCreateRegistry/app.ts',
        postUpdateRegistry: './src/api/postUpdateRegistry/app.ts',
        postInvalidateCache: './src/api/postInvalidateCache/app.ts',
    },
    output: {
        filename: '[name].js',
        libraryTarget: 'commonjs2',
        path: path.resolve(__dirname, './build'),
    },
    module: {
        rules: [{ test: /\.ts$/, loader: 'ts-loader' }],
    },
    resolve: {
        extensions: ['.js', '.ts'],
    },
    target: 'node',
    resolve: {
        extensions: ['.ts', '.js'],
    },
    mode: 'development',
}
