import chalk from 'chalk'

class Logger {
    static preMessage = '' //'------------------------------'
    static postMessage = '' //'------------------------------'

    static success(...args: any[]) {
        console.log(chalk.green(...args))
    }

    static error(...args: any[]) {
        console.log(chalk.red(...args))
    }

    static info(...args: any[]) {
        console.log(chalk.blue(...args))
    }

    static log(...args: any[]) {
        console.log(...args)
    }
}

export { Logger }
