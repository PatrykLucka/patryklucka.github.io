'use strict'
import 'babel-polyfill'

require('buffer')

import TransportU2F from '@ledgerhq/hw-transport-u2f'
import WebSocketTransport from "@ledgerhq/hw-transport-http/lib/WebSocketTransport"
import LedgerEth from '@ledgerhq/hw-app-eth'
import { byContractAddress } from '@ledgerhq/hw-app-eth/erc20'

const BRIDGE_URL = "ws://localhost:8435"

export default class LedgerBridge {
    constructor() {
        this.addEventListeners()
    }

    addEventListeners() {
        window.addEventListener('message', async e => {
            if (e && e.data && e.data.target === 'LEDGER-IFRAME') {
                const { action, params } = e.data
                const replyAction = `${action}-reply`
                switch (action) {
                    case 'ledger-unlock':
                        this.unlock(replyAction, params.hdPath)
                        break
                    case 'ledger-sign-transaction':
                        this.signTransaction(replyAction, params.hdPath, params.tx, params.to)
                        break
                    case 'ledger-sign-personal-message':
                        this.signPersonalMessage(replyAction, params.hdPath, params.message)
                        break
                }
            }
        }, false)
    }

    sendMessageToExtension(msg) {
        window.parent.postMessage(msg, '*')
    }

    delay(ms) {
        return new Promise((success) => setTimeout(success, ms));
    }

    checkTransportLoop() {
        return WebSocketTransport.check(BRIDGE_URL).catch(async () => {
            await this.delay(500);
            return this.checkTransportLoop();
        });
    }

    async makeApp() {
        try {
            // if (window.navigator.platform.indexOf('Win') > -1 && window.chrome) {
            window.open('ledgerlive://bridge?appName=Ethereum')
            this.checkTransportLoop()
                .then(async () => {
                    this.transport = await WebSocketTransport.open(BRIDGE_URL)
                    this.app = new LedgerEth(this.transport)
                });
            // } else {
            //     this.transport = await TransportU2F.create()
            // }
        } catch (e) {
            console.log('LEDGER:::CREATE APP ERROR', e)
        }
    }

    cleanUp() {
        this.app = null
        this.transport.close()
    }

    async unlock(replyAction, hdPath) {
        try {
            console.log('ulock - makeApp!: ', replyAction)
            await this.makeApp()
            console.log('getting address...')
            const res = await this.app.getAddress(hdPath, false, true)
            console.log('res: ', res)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })

        } catch (err) {
            console.log('err: ', err);
            const e = this.ledgerErrToMessage(err)

            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            console.log('cleanUp');
            this.cleanUp()
        }
    }

    async signTransaction(replyAction, hdPath, tx, to) {
        try {
            await this.makeApp()
            if (to) {
                const isKnownERC20Token = byContractAddress(to)
                if (isKnownERC20Token) await this.app.provideERC20TokenInformation(isKnownERC20Token)
            }
            const res = await this.app.signTransaction(hdPath, tx)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })

        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            this.cleanUp()
        }
    }

    async signPersonalMessage(replyAction, hdPath, message) {
        try {
            await this.makeApp()
            const res = await this.app.signPersonalMessage(hdPath, message)

            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            this.cleanUp()
        }
    }

    ledgerErrToMessage(err) {
        const isU2FError = (err) => !!err && !!(err).metaData
        const isStringError = (err) => typeof err === 'string'
        const isErrorWithId = (err) => err.hasOwnProperty('id') && err.hasOwnProperty('message')

        // https://developers.yubico.com/U2F/Libraries/Client_error_codes.html
        if (isU2FError(err)) {
            // Timeout
            if (err.metaData.code === 5) {
                return 'LEDGER_TIMEOUT'
            }

            return err.metaData.type
        }

        if (isStringError(err)) {
            // Wrong app logged into
            if (err.includes('6804')) {
                return 'LEDGER_WRONG_APP'
            }
            // Ledger locked
            if (err.includes('6801')) {
                return 'LEDGER_LOCKED'
            }

            return err
        }

        if (isErrorWithId(err)) {
            // Browser doesn't support U2F
            if (err.message.includes('U2F not supported')) {
                return 'U2F_NOT_SUPPORTED'
            }
        }

        // Other
        return err.toString()
    }

}

