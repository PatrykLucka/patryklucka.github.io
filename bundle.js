(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

require('babel-polyfill');

var _hwTransportU2f = require('@ledgerhq/hw-transport-u2f');

var _hwTransportU2f2 = _interopRequireDefault(_hwTransportU2f);

var _WebSocketTransport = require('@ledgerhq/hw-transport-http/lib/WebSocketTransport');

var _WebSocketTransport2 = _interopRequireDefault(_WebSocketTransport);

var _hwAppEth = require('@ledgerhq/hw-app-eth');

var _hwAppEth2 = _interopRequireDefault(_hwAppEth);

var _erc = require('@ledgerhq/hw-app-eth/erc20');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require('buffer');

var BRIDGE_URL = "ws://localhost:8435";
var TRANSPORT_CHECK_LIMIT = 10;
var TRANSPORT_CHECK_DELAY = 1000;

var LedgerBridge = function () {
    function LedgerBridge() {
        _classCallCheck(this, LedgerBridge);

        this.addEventListeners();
    }

    _createClass(LedgerBridge, [{
        key: 'addEventListeners',
        value: function addEventListeners() {
            var _this = this;

            window.addEventListener('message', async function (e) {
                if (e && e.data && e.data.target === 'LEDGER-IFRAME') {
                    var _e$data = e.data,
                        action = _e$data.action,
                        params = _e$data.params;

                    var replyAction = action + '-reply';
                    switch (action) {
                        case 'ledger-unlock':
                            console.log('got message: ', e);
                            _this.unlock(replyAction, params.hdPath);
                            break;
                        case 'ledger-sign-transaction':
                            _this.signTransaction(replyAction, params.hdPath, params.tx, params.to);
                            break;
                        case 'ledger-sign-personal-message':
                            _this.signPersonalMessage(replyAction, params.hdPath, params.message);
                            break;
                        case 'ledger-close-bridge':
                            _this.cleanUp(replyAction);
                            break;
                    }
                }
            }, false);
        }
    }, {
        key: 'sendMessageToExtension',
        value: function sendMessageToExtension(msg) {
            window.parent.postMessage(msg, '*');
        }
    }, {
        key: 'delay',
        value: function delay(ms) {
            return new Promise(function (success) {
                return setTimeout(success, ms);
            });
        }
    }, {
        key: 'checkTransportLoop',
        value: function checkTransportLoop(i) {
            var _this2 = this;

            var iterator = i ? i : 0;
            return _WebSocketTransport2.default.check(BRIDGE_URL).catch(async function () {
                await _this2.delay(TRANSPORT_CHECK_DELAY);
                if (iterator < TRANSPORT_CHECK_LIMIT) {
                    return _this2.checkTransportLoop(iterator + 1);
                } else {
                    throw new Error('Ledger transport check timeout');
                }
            });
        }
    }, {
        key: 'makeApp',
        value: async function makeApp(replyAction) {
            var _this3 = this;

            try {
                // if (window.navigator.platform.indexOf('Win') > -1 && window.chrome) {
                await _WebSocketTransport2.default.check(BRIDGE_URL).catch(async function () {
                    window.open('ledgerlive://bridge?appName=Ethereum');
                    await _this3.checkTransportLoop();
                    _this3.transport = await _WebSocketTransport2.default.open(BRIDGE_URL);
                    console.log('transport: ', _this3.transport);
                    _this3.app = new _hwAppEth2.default(_this3.transport);
                    console.log('app: ', _this3.app);
                    return;
                });
                await this.checkTransportLoop();
                console.log('transport there, opening... ', BRIDGE_URL);
                this.transport = await _WebSocketTransport2.default.open(BRIDGE_URL);
                console.log('transport2: ', this.transport);
                this.app = new _hwAppEth2.default(this.transport);
                console.log('app2: ', this.app);
                // } else {
                //     this.transport = await TransportU2F.create()
                // }
            } catch (e) {
                console.log('LEDGER:::CREATE APP ERROR', e);
                this.cleanUp();
                throw e;
            }
        }
    }, {
        key: 'cleanUp',
        value: function cleanUp(replyAction) {
            this.app = null;
            if (this.transport) {
                this.transport.close();
            }
            if (replyAction) {
                this.sendMessageToExtension({
                    action: replyAction,
                    success: true
                });
            }
        }
    }, {
        key: 'unlock',
        value: async function unlock(replyAction, hdPath) {
            try {
                console.log('ulock - makeApp!: ', replyAction);
                await this.makeApp();
                console.log('getting address...: ', hdPath);
                var res = await this.app.getAddress(hdPath, false, true);
                console.log('res: ', res);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: true,
                    payload: res
                });
            } catch (err) {
                console.log('err: ', err);
                var e = this.ledgerErrToMessage(err);

                console.log('sending reply action: ', replyAction);
                console.log('payload error: ', e.toString());
                this.sendMessageToExtension({
                    action: replyAction,
                    success: false,
                    payload: { error: e.toString() }
                });
            }
        }
    }, {
        key: 'signTransaction',
        value: async function signTransaction(replyAction, hdPath, tx, to) {
            try {
                await this.makeApp();
                if (to) {
                    var isKnownERC20Token = (0, _erc.byContractAddress)(to);
                    if (isKnownERC20Token) await this.app.provideERC20TokenInformation(isKnownERC20Token);
                }
                var res = await this.app.signTransaction(hdPath, tx);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: true,
                    payload: res
                });
            } catch (err) {
                var e = this.ledgerErrToMessage(err);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: false,
                    payload: { error: e.toString() }
                });
            }
        }
    }, {
        key: 'signPersonalMessage',
        value: async function signPersonalMessage(replyAction, hdPath, message) {
            try {
                await this.makeApp();
                var res = await this.app.signPersonalMessage(hdPath, message);

                this.sendMessageToExtension({
                    action: replyAction,
                    success: true,
                    payload: res
                });
            } catch (err) {
                var e = this.ledgerErrToMessage(err);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: false,
                    payload: { error: e.toString() }
                });
            }
        }
    }, {
        key: 'ledgerErrToMessage',
        value: function ledgerErrToMessage(err) {
            var isU2FError = function isU2FError(err) {
                return !!err && !!err.metaData;
            };
            var isStringError = function isStringError(err) {
                return typeof err === 'string';
            };
            var isWrongAppError = function isWrongAppError(err) {
                return err.message && err.message.includes('6804');
            };
            var isLedgerLockedError = function isLedgerLockedError(err) {
                return err.message && err.message.includes('OpenFailed');
            };
            var isErrorWithId = function isErrorWithId(err) {
                return err.hasOwnProperty('id') && err.hasOwnProperty('message');
            };

            // https://developers.yubico.com/U2F/Libraries/Client_error_codes.html
            if (isU2FError(err)) {
                // Timeout
                if (err.metaData.code === 5) {
                    return 'LEDGER_TIMEOUT';
                }

                return err.metaData.type;
            }

            if (isWrongAppError(err)) {
                return 'LEDGER_WRONG_APP';
            }
            if (isLedgerLockedError(err)) {
                return 'LEDGER_LOCKED';
            }

            if (isStringError(err)) {
                // Wrong app logged into
                if (err.includes('6804')) {
                    return 'LEDGER_WRONG_APP';
                }
                // Ledger locked
                if (err.includes('6801')) {
                    return 'LEDGER_LOCKED';
                }

                return err;
            }

            if (isErrorWithId(err)) {
                // Browser doesn't support U2F
                if (err.message.includes('U2F not supported')) {
                    return 'U2F_NOT_SUPPORTED';
                }
            }

            // Other
            return err.toString();
        }
    }]);

    return LedgerBridge;
}();

exports.default = LedgerBridge;

},{"@ledgerhq/hw-app-eth":7,"@ledgerhq/hw-app-eth/erc20":6,"@ledgerhq/hw-transport-http/lib/WebSocketTransport":11,"@ledgerhq/hw-transport-u2f":15,"babel-polyfill":17,"buffer":23}],2:[function(require,module,exports){
'use strict';

require('babel-polyfill');

var _ledgerBridge = require('./ledger-bridge');

var _ledgerBridge2 = _interopRequireDefault(_ledgerBridge);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(async function () {
    var bridge = new _ledgerBridge2.default();
})();
console.log('MetaMask < = > Ledger Bridge initialized!');

},{"./ledger-bridge":1,"babel-polyfill":17}],3:[function(require,module,exports){
module.exports = "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";
},{}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/* eslint-disable no-continue */
/* eslint-disable no-param-reassign */
/* eslint-disable no-prototype-builtins */

var errorClasses = {};

var createCustomErrorClass = exports.createCustomErrorClass = function createCustomErrorClass(name) {
  var C = function CustomError(message, fields) {
    Object.assign(this, fields);
    this.name = name;
    this.message = message || name;
    this.stack = new Error().stack;
  };
  // $FlowFixMe
  C.prototype = new Error();

  errorClasses[name] = C;
  // $FlowFixMe we can't easily type a subset of Error for now...
  return C;
};

// inspired from https://github.com/programble/errio/blob/master/index.js
var deserializeError = exports.deserializeError = function deserializeError(object) {
  if ((typeof object === "undefined" ? "undefined" : _typeof(object)) === "object" && object) {
    try {
      // $FlowFixMe FIXME HACK
      var msg = JSON.parse(object.message);
      if (msg.message && msg.name) {
        object = msg;
      }
    } catch (e) {
      // nothing
    }
    var _constructor = object.name === "Error" ? Error : typeof object.name === "string" ? errorClasses[object.name] || createCustomErrorClass(object.name) : Error;

    var error = Object.create(_constructor.prototype);
    for (var prop in object) {
      if (object.hasOwnProperty(prop)) {
        error[prop] = object[prop];
      }
    }
    if (!error.stack && Error.captureStackTrace) {
      Error.captureStackTrace(error, deserializeError);
    }
    return error;
  }
  return new Error(String(object));
};

// inspired from https://github.com/sindresorhus/serialize-error/blob/master/index.js
var serializeError = exports.serializeError = function serializeError(value) {
  if (!value) return value;
  if ((typeof value === "undefined" ? "undefined" : _typeof(value)) === "object") {
    return destroyCircular(value, []);
  }
  if (typeof value === "function") {
    return "[Function: " + (value.name || "anonymous") + "]";
  }
  return value;
};

// https://www.npmjs.com/package/destroy-circular
function destroyCircular(from, seen) {
  var to = {};
  seen.push(from);
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = Object.keys(from)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var key = _step.value;

      var value = from[key];
      if (typeof value === "function") {
        continue;
      }
      if (!value || (typeof value === "undefined" ? "undefined" : _typeof(value)) !== "object") {
        to[key] = value;
        continue;
      }
      if (seen.indexOf(from[key]) === -1) {
        to[key] = destroyCircular(from[key], seen.slice(0));
        continue;
      }
      to[key] = "[Circular]";
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  if (typeof from.name === "string") {
    to.name = from.name;
  }
  if (typeof from.message === "string") {
    to.message = from.message;
  }
  if (typeof from.stack === "string") {
    to.stack = from.stack;
  }
  return to;
}

},{}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StatusCodes = exports.DBNotReset = exports.DBWrongPassword = exports.NoDBPathGiven = exports.LedgerAPI5xx = exports.LedgerAPI4xx = exports.GenuineCheckFailed = exports.PairingFailed = exports.SyncError = exports.FeeRequired = exports.FeeNotLoaded = exports.CantScanQRCode = exports.ETHAddressNonEIP = exports.WrongDeviceForAccount = exports.WebsocketConnectionFailed = exports.WebsocketConnectionError = exports.DeviceShouldStayInApp = exports.TransportInterfaceNotAvailable = exports.TransportOpenUserCancelled = exports.UserRefusedOnDevice = exports.UserRefusedAllowManager = exports.UserRefusedFirmwareUpdate = exports.UserRefusedAddress = exports.UserRefusedDeviceNameChange = exports.UpdateYourApp = exports.UnexpectedBootloader = exports.TimeoutTagged = exports.PasswordIncorrectError = exports.PasswordsDontMatchError = exports.NotEnoughBalanceBecauseDestinationNotCreated = exports.NotEnoughBalance = exports.NoAddressesFound = exports.NetworkDown = exports.ManagerUninstallBTCDep = exports.ManagerNotEnoughSpaceError = exports.ManagerDeviceLockedError = exports.ManagerAppRelyOnBTCError = exports.ManagerAppAlreadyInstalledError = exports.LedgerAPINotAvailable = exports.LedgerAPIErrorWithMessage = exports.LedgerAPIError = exports.UnknownMCU = exports.LatestMCUInstalledError = exports.InvalidAddressBecauseDestinationIsAlsoSource = exports.InvalidAddress = exports.HardResetFail = exports.FeeEstimationFailed = exports.EnpointConfigError = exports.DisconnectedDeviceDuringOperation = exports.DisconnectedDevice = exports.DeviceSocketNoBulkStatus = exports.DeviceSocketFail = exports.DeviceNameInvalid = exports.DeviceOnDashboardExpected = exports.DeviceNotGenuineError = exports.DeviceGenuineSocketEarlyClose = exports.DeviceAppVerifyNotSupported = exports.CantOpenDevice = exports.BtcUnmatchedApp = exports.BluetoothRequired = exports.AccountNameRequiredError = undefined;
exports.TransportError = TransportError;
exports.getAltStatusMessage = getAltStatusMessage;
exports.TransportStatusError = TransportStatusError;

var _helpers = require("./helpers");

var AccountNameRequiredError = exports.AccountNameRequiredError = (0, _helpers.createCustomErrorClass)("AccountNameRequired");

var BluetoothRequired = exports.BluetoothRequired = (0, _helpers.createCustomErrorClass)("BluetoothRequired");
var BtcUnmatchedApp = exports.BtcUnmatchedApp = (0, _helpers.createCustomErrorClass)("BtcUnmatchedApp");
var CantOpenDevice = exports.CantOpenDevice = (0, _helpers.createCustomErrorClass)("CantOpenDevice");
var DeviceAppVerifyNotSupported = exports.DeviceAppVerifyNotSupported = (0, _helpers.createCustomErrorClass)("DeviceAppVerifyNotSupported");
var DeviceGenuineSocketEarlyClose = exports.DeviceGenuineSocketEarlyClose = (0, _helpers.createCustomErrorClass)("DeviceGenuineSocketEarlyClose");
var DeviceNotGenuineError = exports.DeviceNotGenuineError = (0, _helpers.createCustomErrorClass)("DeviceNotGenuine");
var DeviceOnDashboardExpected = exports.DeviceOnDashboardExpected = (0, _helpers.createCustomErrorClass)("DeviceOnDashboardExpected");
var DeviceNameInvalid = exports.DeviceNameInvalid = (0, _helpers.createCustomErrorClass)("DeviceNameInvalid");
var DeviceSocketFail = exports.DeviceSocketFail = (0, _helpers.createCustomErrorClass)("DeviceSocketFail");
var DeviceSocketNoBulkStatus = exports.DeviceSocketNoBulkStatus = (0, _helpers.createCustomErrorClass)("DeviceSocketNoBulkStatus");
var DisconnectedDevice = exports.DisconnectedDevice = (0, _helpers.createCustomErrorClass)("DisconnectedDevice");
var DisconnectedDeviceDuringOperation = exports.DisconnectedDeviceDuringOperation = (0, _helpers.createCustomErrorClass)("DisconnectedDeviceDuringOperation");
var EnpointConfigError = exports.EnpointConfigError = (0, _helpers.createCustomErrorClass)("EnpointConfig");
var FeeEstimationFailed = exports.FeeEstimationFailed = (0, _helpers.createCustomErrorClass)("FeeEstimationFailed");
var HardResetFail = exports.HardResetFail = (0, _helpers.createCustomErrorClass)("HardResetFail");
var InvalidAddress = exports.InvalidAddress = (0, _helpers.createCustomErrorClass)("InvalidAddress");
var InvalidAddressBecauseDestinationIsAlsoSource = exports.InvalidAddressBecauseDestinationIsAlsoSource = (0, _helpers.createCustomErrorClass)("InvalidAddressBecauseDestinationIsAlsoSource");
var LatestMCUInstalledError = exports.LatestMCUInstalledError = (0, _helpers.createCustomErrorClass)("LatestMCUInstalledError");
var UnknownMCU = exports.UnknownMCU = (0, _helpers.createCustomErrorClass)("UnknownMCU");
var LedgerAPIError = exports.LedgerAPIError = (0, _helpers.createCustomErrorClass)("LedgerAPIError");
var LedgerAPIErrorWithMessage = exports.LedgerAPIErrorWithMessage = (0, _helpers.createCustomErrorClass)("LedgerAPIErrorWithMessage");
var LedgerAPINotAvailable = exports.LedgerAPINotAvailable = (0, _helpers.createCustomErrorClass)("LedgerAPINotAvailable");
var ManagerAppAlreadyInstalledError = exports.ManagerAppAlreadyInstalledError = (0, _helpers.createCustomErrorClass)("ManagerAppAlreadyInstalled");
var ManagerAppRelyOnBTCError = exports.ManagerAppRelyOnBTCError = (0, _helpers.createCustomErrorClass)("ManagerAppRelyOnBTC");
var ManagerDeviceLockedError = exports.ManagerDeviceLockedError = (0, _helpers.createCustomErrorClass)("ManagerDeviceLocked");
var ManagerNotEnoughSpaceError = exports.ManagerNotEnoughSpaceError = (0, _helpers.createCustomErrorClass)("ManagerNotEnoughSpace");
var ManagerUninstallBTCDep = exports.ManagerUninstallBTCDep = (0, _helpers.createCustomErrorClass)("ManagerUninstallBTCDep");
var NetworkDown = exports.NetworkDown = (0, _helpers.createCustomErrorClass)("NetworkDown");
var NoAddressesFound = exports.NoAddressesFound = (0, _helpers.createCustomErrorClass)("NoAddressesFound");
var NotEnoughBalance = exports.NotEnoughBalance = (0, _helpers.createCustomErrorClass)("NotEnoughBalance");
var NotEnoughBalanceBecauseDestinationNotCreated = exports.NotEnoughBalanceBecauseDestinationNotCreated = (0, _helpers.createCustomErrorClass)("NotEnoughBalanceBecauseDestinationNotCreated");
var PasswordsDontMatchError = exports.PasswordsDontMatchError = (0, _helpers.createCustomErrorClass)("PasswordsDontMatch");
var PasswordIncorrectError = exports.PasswordIncorrectError = (0, _helpers.createCustomErrorClass)("PasswordIncorrect");
var TimeoutTagged = exports.TimeoutTagged = (0, _helpers.createCustomErrorClass)("TimeoutTagged");
var UnexpectedBootloader = exports.UnexpectedBootloader = (0, _helpers.createCustomErrorClass)("UnexpectedBootloader");
var UpdateYourApp = exports.UpdateYourApp = (0, _helpers.createCustomErrorClass)("UpdateYourApp");
var UserRefusedDeviceNameChange = exports.UserRefusedDeviceNameChange = (0, _helpers.createCustomErrorClass)("UserRefusedDeviceNameChange");
var UserRefusedAddress = exports.UserRefusedAddress = (0, _helpers.createCustomErrorClass)("UserRefusedAddress");
var UserRefusedFirmwareUpdate = exports.UserRefusedFirmwareUpdate = (0, _helpers.createCustomErrorClass)("UserRefusedFirmwareUpdate");
var UserRefusedAllowManager = exports.UserRefusedAllowManager = (0, _helpers.createCustomErrorClass)("UserRefusedAllowManager");
var UserRefusedOnDevice = exports.UserRefusedOnDevice = (0, _helpers.createCustomErrorClass)("UserRefusedOnDevice"); // TODO rename because it's just for transaction refusal
var TransportOpenUserCancelled = exports.TransportOpenUserCancelled = (0, _helpers.createCustomErrorClass)("TransportOpenUserCancelled");
var TransportInterfaceNotAvailable = exports.TransportInterfaceNotAvailable = (0, _helpers.createCustomErrorClass)("TransportInterfaceNotAvailable");
var DeviceShouldStayInApp = exports.DeviceShouldStayInApp = (0, _helpers.createCustomErrorClass)("DeviceShouldStayInApp");
var WebsocketConnectionError = exports.WebsocketConnectionError = (0, _helpers.createCustomErrorClass)("WebsocketConnectionError");
var WebsocketConnectionFailed = exports.WebsocketConnectionFailed = (0, _helpers.createCustomErrorClass)("WebsocketConnectionFailed");
var WrongDeviceForAccount = exports.WrongDeviceForAccount = (0, _helpers.createCustomErrorClass)("WrongDeviceForAccount");
var ETHAddressNonEIP = exports.ETHAddressNonEIP = (0, _helpers.createCustomErrorClass)("ETHAddressNonEIP");
var CantScanQRCode = exports.CantScanQRCode = (0, _helpers.createCustomErrorClass)("CantScanQRCode");
var FeeNotLoaded = exports.FeeNotLoaded = (0, _helpers.createCustomErrorClass)("FeeNotLoaded");
var FeeRequired = exports.FeeRequired = (0, _helpers.createCustomErrorClass)("FeeRequired");
var SyncError = exports.SyncError = (0, _helpers.createCustomErrorClass)("SyncError");
var PairingFailed = exports.PairingFailed = (0, _helpers.createCustomErrorClass)("PairingFailed");
var GenuineCheckFailed = exports.GenuineCheckFailed = (0, _helpers.createCustomErrorClass)("GenuineCheckFailed");
var LedgerAPI4xx = exports.LedgerAPI4xx = (0, _helpers.createCustomErrorClass)("LedgerAPI4xx");
var LedgerAPI5xx = exports.LedgerAPI5xx = (0, _helpers.createCustomErrorClass)("LedgerAPI5xx");

// db stuff, no need to translate
var NoDBPathGiven = exports.NoDBPathGiven = (0, _helpers.createCustomErrorClass)("NoDBPathGiven");
var DBWrongPassword = exports.DBWrongPassword = (0, _helpers.createCustomErrorClass)("DBWrongPassword");
var DBNotReset = exports.DBNotReset = (0, _helpers.createCustomErrorClass)("DBNotReset");

/**
 * TransportError is used for any generic transport errors.
 * e.g. Error thrown when data received by exchanges are incorrect or if exchanged failed to communicate with the device for various reason.
 */
function TransportError(message, id) {
  this.name = "TransportError";
  this.message = message;
  this.stack = new Error().stack;
  this.id = id;
}
//$FlowFixMe
TransportError.prototype = new Error();

var StatusCodes = exports.StatusCodes = {
  PIN_REMAINING_ATTEMPTS: 0x63c0,
  INCORRECT_LENGTH: 0x6700,
  COMMAND_INCOMPATIBLE_FILE_STRUCTURE: 0x6981,
  SECURITY_STATUS_NOT_SATISFIED: 0x6982,
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  INCORRECT_DATA: 0x6a80,
  NOT_ENOUGH_MEMORY_SPACE: 0x6a84,
  REFERENCED_DATA_NOT_FOUND: 0x6a88,
  FILE_ALREADY_EXISTS: 0x6a89,
  INCORRECT_P1_P2: 0x6b00,
  INS_NOT_SUPPORTED: 0x6d00,
  CLA_NOT_SUPPORTED: 0x6e00,
  TECHNICAL_PROBLEM: 0x6f00,
  OK: 0x9000,
  MEMORY_PROBLEM: 0x9240,
  NO_EF_SELECTED: 0x9400,
  INVALID_OFFSET: 0x9402,
  FILE_NOT_FOUND: 0x9404,
  INCONSISTENT_FILE: 0x9408,
  ALGORITHM_NOT_SUPPORTED: 0x9484,
  INVALID_KCV: 0x9485,
  CODE_NOT_INITIALIZED: 0x9802,
  ACCESS_CONDITION_NOT_FULFILLED: 0x9804,
  CONTRADICTION_SECRET_CODE_STATUS: 0x9808,
  CONTRADICTION_INVALIDATION: 0x9810,
  CODE_BLOCKED: 0x9840,
  MAX_VALUE_REACHED: 0x9850,
  GP_AUTH_FAILED: 0x6300,
  LICENSING: 0x6f42,
  HALTED: 0x6faa
};

function getAltStatusMessage(code) {
  switch (code) {
    // improve text of most common errors
    case 0x6700:
      return "Incorrect length";
    case 0x6982:
      return "Security not satisfied (dongle locked or have invalid access rights)";
    case 0x6985:
      return "Condition of use not satisfied (denied by the user?)";
    case 0x6a80:
      return "Invalid data received";
    case 0x6b00:
      return "Invalid parameter received";
  }
  if (0x6f00 <= code && code <= 0x6fff) {
    return "Internal error, please report";
  }
}

/**
 * Error thrown when a device returned a non success status.
 * the error.statusCode is one of the `StatusCodes` exported by this library.
 */
function TransportStatusError(statusCode) {
  this.name = "TransportStatusError";
  var statusText = Object.keys(StatusCodes).find(function (k) {
    return StatusCodes[k] === statusCode;
  }) || "UNKNOWN_ERROR";
  var smsg = getAltStatusMessage(statusCode) || statusText;
  var statusCodeStr = statusCode.toString(16);
  this.message = "Ledger device: " + smsg + " (0x" + statusCodeStr + ")";
  this.stack = new Error().stack;
  this.statusCode = statusCode;
  this.statusText = statusText;
}
//$FlowFixMe
TransportStatusError.prototype = new Error();

},{"./helpers":4}],6:[function(require,module,exports){
module.exports = require("./lib/erc20");

},{"./lib/erc20":8}],7:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _utils = require("./utils");

var _errors = require("@ledgerhq/errors");

var _bignumber = require("bignumber.js");

var _rlp = require("rlp");

/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
// FIXME drop:
function hexBuffer(str) {
  return Buffer.from(str.startsWith("0x") ? str.slice(2) : str, "hex");
}

function maybeHexBuffer(str) {
  if (!str) return null;
  return hexBuffer(str);
}

const remapTransactionRelatedErrors = e => {
  if (e && e.statusCode === 0x6a80) {
    return new _errors.EthAppPleaseEnableContractData("Please enable Contract data on the Ethereum app Settings");
  }

  return e;
};
/**
 * Ethereum API
 *
 * @example
 * import Eth from "@ledgerhq/hw-app-eth";
 * const eth = new Eth(transport)
 */


class Eth {
  constructor(transport, scrambleKey = "w0w") {
    this.transport = void 0;
    this.transport = transport;
    transport.decorateAppAPIMethods(this, ["getAddress", "provideERC20TokenInformation", "signTransaction", "signPersonalMessage", "getAppConfiguration", "starkGetPublicKey", "starkSignOrder", "starkSignTransfer", "starkProvideQuantum"], scrambleKey);
  }
  /**
   * get Ethereum address for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay optionally enable or not the display
   * @option boolChaincode optionally enable or not the chaincode request
   * @return an object with a publicKey, address and (optionally) chainCode
   * @example
   * eth.getAddress("44'/60'/0'/0/0").then(o => o.address)
   */


  getAddress(path, boolDisplay, boolChaincode) {
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4);
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    return this.transport.send(0xe0, 0x02, boolDisplay ? 0x01 : 0x00, boolChaincode ? 0x01 : 0x00, buffer).then(response => {
      let result = {};
      let publicKeyLength = response[0];
      let addressLength = response[1 + publicKeyLength];
      result.publicKey = response.slice(1, 1 + publicKeyLength).toString("hex");
      result.address = "0x" + response.slice(1 + publicKeyLength + 1, 1 + publicKeyLength + 1 + addressLength).toString("ascii");

      if (boolChaincode) {
        result.chainCode = response.slice(1 + publicKeyLength + 1 + addressLength, 1 + publicKeyLength + 1 + addressLength + 32).toString("hex");
      }

      return result;
    });
  }
  /**
   * This commands provides a trusted description of an ERC 20 token
   * to associate a contract address with a ticker and number of decimals.
   *
   * It shall be run immediately before performing a transaction involving a contract
   * calling this contract address to display the proper token information to the user if necessary.
   *
   * @param {*} info: a blob from "erc20.js" utilities that contains all token information.
   *
   * @example
   * import { byContractAddress } from "@ledgerhq/hw-app-eth/erc20"
   * const zrxInfo = byContractAddress("0xe41d2489571d322189246dafa5ebde1f4699f498")
   * if (zrxInfo) await appEth.provideERC20TokenInformation(zrxInfo)
   * const signed = await appEth.signTransaction(path, rawTxHex)
   */


  provideERC20TokenInformation({
    data
  }) {
    return this.transport.send(0xe0, 0x0a, 0x00, 0x00, data).then(() => true, e => {
      if (e && e.statusCode === 0x6d00) {
        // this case happen for older version of ETH app, since older app version had the ERC20 data hardcoded, it's fine to assume it worked.
        // we return a flag to know if the call was effective or not
        return false;
      }

      throw e;
    });
  }
  /**
   * You can sign a transaction and retrieve v, r, s given the raw transaction and the BIP 32 path of the account to sign
   * @example
   eth.signTransaction("44'/60'/0'/0/0", "e8018504e3b292008252089428ee52a8f3d6e5d15f8b131996950d7f296c7952872bd72a2487400080").then(result => ...)
   */


  signTransaction(path, rawTxHex) {
    let paths = (0, _utils.splitPath)(path);
    let offset = 0;
    let rawTx = Buffer.from(rawTxHex, "hex");
    let toSend = [];
    let response; // Check if the TX is encoded following EIP 155

    let rlpTx = (0, _rlp.decode)(rawTx);
    let rlpOffset = 0;

    if (rlpTx.length > 6) {
      let rlpVrs = (0, _rlp.encode)(rlpTx.slice(-3));
      rlpOffset = rawTx.length - (rlpVrs.length - 1);
    }

    while (offset !== rawTx.length) {
      let maxChunkSize = offset === 0 ? 150 - 1 - paths.length * 4 : 150;
      let chunkSize = offset + maxChunkSize > rawTx.length ? rawTx.length - offset : maxChunkSize;

      if (rlpOffset != 0 && offset + chunkSize == rlpOffset) {
        // Make sure that the chunk doesn't end right on the EIP 155 marker if set
        chunkSize--;
      }

      let buffer = Buffer.alloc(offset === 0 ? 1 + paths.length * 4 + chunkSize : chunkSize);

      if (offset === 0) {
        buffer[0] = paths.length;
        paths.forEach((element, index) => {
          buffer.writeUInt32BE(element, 1 + 4 * index);
        });
        rawTx.copy(buffer, 1 + 4 * paths.length, offset, offset + chunkSize);
      } else {
        rawTx.copy(buffer, 0, offset, offset + chunkSize);
      }

      toSend.push(buffer);
      offset += chunkSize;
    }

    return (0, _utils.foreach)(toSend, (data, i) => this.transport.send(0xe0, 0x04, i === 0 ? 0x00 : 0x80, 0x00, data).then(apduResponse => {
      response = apduResponse;
    })).then(() => {
      const v = response.slice(0, 1).toString("hex");
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        v,
        r,
        s
      };
    }, e => {
      throw remapTransactionRelatedErrors(e);
    });
  }
  /**
   */


  getAppConfiguration() {
    return this.transport.send(0xe0, 0x06, 0x00, 0x00).then(response => {
      let result = {};
      result.arbitraryDataEnabled = response[0] & 0x01;
      result.erc20ProvisioningNecessary = response[0] & 0x02;
      result.starkEnabled = response[0] & 0x04;
      result.version = "" + response[1] + "." + response[2] + "." + response[3];
      return result;
    });
  }
  /**
  * You can sign a message according to eth_sign RPC call and retrieve v, r, s given the message and the BIP 32 path of the account to sign.
  * @example
  eth.signPersonalMessage("44'/60'/0'/0/0", Buffer.from("test").toString("hex")).then(result => {
  var v = result['v'] - 27;
  v = v.toString(16);
  if (v.length < 2) {
    v = "0" + v;
  }
  console.log("Signature 0x" + result['r'] + result['s'] + v);
  })
   */


  signPersonalMessage(path, messageHex) {
    let paths = (0, _utils.splitPath)(path);
    let offset = 0;
    let message = Buffer.from(messageHex, "hex");
    let toSend = [];
    let response;

    while (offset !== message.length) {
      let maxChunkSize = offset === 0 ? 150 - 1 - paths.length * 4 - 4 : 150;
      let chunkSize = offset + maxChunkSize > message.length ? message.length - offset : maxChunkSize;
      let buffer = Buffer.alloc(offset === 0 ? 1 + paths.length * 4 + 4 + chunkSize : chunkSize);

      if (offset === 0) {
        buffer[0] = paths.length;
        paths.forEach((element, index) => {
          buffer.writeUInt32BE(element, 1 + 4 * index);
        });
        buffer.writeUInt32BE(message.length, 1 + 4 * paths.length);
        message.copy(buffer, 1 + 4 * paths.length + 4, offset, offset + chunkSize);
      } else {
        message.copy(buffer, 0, offset, offset + chunkSize);
      }

      toSend.push(buffer);
      offset += chunkSize;
    }

    return (0, _utils.foreach)(toSend, (data, i) => this.transport.send(0xe0, 0x08, i === 0 ? 0x00 : 0x80, 0x00, data).then(apduResponse => {
      response = apduResponse;
    })).then(() => {
      const v = response[0];
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        v,
        r,
        s
      };
    });
  }
  /**
  * Sign a prepared message following web3.eth.signTypedData specification. The host computes the domain separator and hashStruct(message)
  * @example
  eth.signEIP712HashedMessage("44'/60'/0'/0/0", Buffer.from("0101010101010101010101010101010101010101010101010101010101010101").toString("hex"), Buffer.from("0202020202020202020202020202020202020202020202020202020202020202").toString("hex")).then(result => {
  var v = result['v'] - 27;
  v = v.toString(16);
  if (v.length < 2) {
    v = "0" + v;
  }
  console.log("Signature 0x" + result['r'] + result['s'] + v);
  })
   */


  signEIP712HashedMessage(path, domainSeparatorHex, hashStructMessageHex) {
    const domainSeparator = hexBuffer(domainSeparatorHex);
    const hashStruct = hexBuffer(hashStructMessageHex);
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 32 + 32, 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;
    domainSeparator.copy(buffer, offset);
    offset += 32;
    hashStruct.copy(buffer, offset);
    return this.transport.send(0xe0, 0x0c, 0x00, 0x00, buffer).then(response => {
      const v = response[0];
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        v,
        r,
        s
      };
    });
  }
  /**
   * get Stark public key for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay optionally enable or not the display
   * @return the Stark public key
   */


  starkGetPublicKey(path, boolDisplay) {
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4);
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    return this.transport.send(0xf0, 0x02, boolDisplay ? 0x01 : 0x00, 0x00, buffer).then(response => {
      return response.slice(0, response.length - 2);
    });
  }
  /**
   * sign a Stark order
   * @param path a path in BIP 32 format
   * @option sourceTokenAddress contract address of the source token (not present for ETH)
   * @param sourceQuantization quantization used for the source token
   * @option destinationTokenAddress contract address of the destination token (not present for ETH)
   * @param destinationQuantization quantization used for the destination token
   * @param sourceVault ID of the source vault
   * @param destinationVault ID of the destination vault
   * @param amountSell amount to sell
   * @param amountBuy amount to buy
   * @param nonce transaction nonce
   * @param timestamp transaction validity timestamp
   * @return the signature
   */


  starkSignOrder(path, sourceTokenAddress, sourceQuantization, destinationTokenAddress, destinationQuantization, sourceVault, destinationVault, amountSell, amountBuy, nonce, timestamp) {
    const sourceTokenAddressHex = maybeHexBuffer(sourceTokenAddress);
    const destinationTokenAddressHex = maybeHexBuffer(destinationTokenAddress);
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 20 + 32 + 20 + 32 + 4 + 4 + 8 + 8 + 4 + 4, 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;

    if (sourceTokenAddressHex) {
      sourceTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;
    Buffer.from(sourceQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    offset += 32;

    if (destinationTokenAddressHex) {
      destinationTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;
    Buffer.from(destinationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    offset += 32;
    buffer.writeUInt32BE(sourceVault, offset);
    offset += 4;
    buffer.writeUInt32BE(destinationVault, offset);
    offset += 4;
    Buffer.from(amountSell.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    Buffer.from(amountBuy.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    buffer.writeUInt32BE(nonce, offset);
    offset += 4;
    buffer.writeUInt32BE(timestamp, offset);
    return this.transport.send(0xf0, 0x04, 0x01, 0x00, buffer).then(response => {
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        r,
        s
      };
    });
  }
  /**
   * sign a Stark transfer
   * @param path a path in BIP 32 format
   * @option transferTokenAddress contract address of the token to be transferred (not present for ETH)
   * @param transferQuantization quantization used for the token to be transferred
   * @param targetPublicKey target Stark public key
   * @param sourceVault ID of the source vault
   * @param destinationVault ID of the destination vault
   * @param amountTransfer amount to transfer
   * @param nonce transaction nonce
   * @param timestamp transaction validity timestamp
   * @return the signature
   */


  starkSignTransfer(path, transferTokenAddress, transferQuantization, targetPublicKey, sourceVault, destinationVault, amountTransfer, nonce, timestamp) {
    const transferTokenAddressHex = maybeHexBuffer(transferTokenAddress);
    const targetPublicKeyHex = hexBuffer(targetPublicKey);
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 20 + 32 + 32 + 4 + 4 + 8 + 4 + 4, 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;

    if (transferTokenAddressHex) {
      transferTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;
    Buffer.from(transferQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    offset += 32;
    targetPublicKeyHex.copy(buffer, offset);
    offset += 32;
    buffer.writeUInt32BE(sourceVault, offset);
    offset += 4;
    buffer.writeUInt32BE(destinationVault, offset);
    offset += 4;
    Buffer.from(amountTransfer.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    buffer.writeUInt32BE(nonce, offset);
    offset += 4;
    buffer.writeUInt32BE(timestamp, offset);
    return this.transport.send(0xf0, 0x04, 0x02, 0x00, buffer).then(response => {
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        r,
        s
      };
    });
  }
  /**
   * provide quantization information before singing a deposit or withdrawal Stark powered contract call
   *
   * It shall be run following a provideERC20TokenInformation call for the given contract
   *
   * @param operationContract contract address of the token to be transferred (not present for ETH)
   * @param operationQuantization quantization used for the token to be transferred
   */


  starkProvideQuantum(operationContract, operationQuantization) {
    const operationContractHex = maybeHexBuffer(operationContract);
    let buffer = Buffer.alloc(20 + 32, 0);

    if (operationContractHex) {
      operationContractHex.copy(buffer, 0);
    }

    Buffer.from(operationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, 20);
    return this.transport.send(0xf0, 0x08, 0x00, 0x00, buffer).then(() => true, e => {
      if (e && e.statusCode === 0x6d00) {
        // this case happen for ETH application versions not supporting Stark extensions
        return false;
      }

      throw e;
    });
  }

}

exports.default = Eth;

}).call(this,require("buffer").Buffer)
},{"./utils":9,"@ledgerhq/errors":10,"bignumber.js":20,"buffer":23,"rlp":355}],8:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.list = exports.byContractAddress = void 0;

var _erc20Signatures = _interopRequireDefault(require("@ledgerhq/cryptoassets/data/erc20-signatures"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Retrieve the token information by a given contract address if any
 */
const byContractAddress = contract => get().byContract(asContractAddress(contract));
/**
 * list all the ERC20 tokens informations
 */


exports.byContractAddress = byContractAddress;

const list = () => get().list();

exports.list = list;

const asContractAddress = addr => {
  const a = addr.toLowerCase();
  return a.startsWith("0x") ? a : "0x" + a;
}; // this internal get() will lazy load and cache the data from the erc20 data blob


const get = (() => {
  let cache;
  return () => {
    if (cache) return cache;
    const buf = Buffer.from(_erc20Signatures.default, "base64");
    const byContract = {};
    const entries = [];
    let i = 0;

    while (i < buf.length) {
      const length = buf.readUInt32BE(i);
      i += 4;
      const item = buf.slice(i, i + length);
      let j = 0;
      const tickerLength = item.readUInt8(j);
      j += 1;
      const ticker = item.slice(j, j + tickerLength).toString("ascii");
      j += tickerLength;
      const contractAddress = asContractAddress(item.slice(j, j + 20).toString("hex"));
      j += 20;
      const decimals = item.readUInt32BE(j);
      j += 4;
      const chainId = item.readUInt32BE(j);
      j += 4;
      const signature = item.slice(j);
      const entry = {
        ticker,
        contractAddress,
        decimals,
        chainId,
        signature,
        data: item
      };
      entries.push(entry);
      byContract[contractAddress] = entry;
      i += length;
    }

    const api = {
      list: () => entries,
      byContract: contractAddress => byContract[contractAddress]
    };
    cache = api;
    return api;
  };
})();

}).call(this,require("buffer").Buffer)
},{"@ledgerhq/cryptoassets/data/erc20-signatures":3,"buffer":23}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.defer = defer;
exports.splitPath = splitPath;
exports.eachSeries = eachSeries;
exports.foreach = foreach;
exports.doIf = doIf;
exports.asyncWhile = asyncWhile;

/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
function defer() {
  let resolve, reject;
  let promise = new Promise(function (success, failure) {
    resolve = success;
    reject = failure;
  });
  if (!resolve || !reject) throw "defer() error"; // this never happens and is just to make flow happy

  return {
    promise,
    resolve,
    reject
  };
} // TODO use bip32-path library


function splitPath(path) {
  let result = [];
  let components = path.split("/");
  components.forEach(element => {
    let number = parseInt(element, 10);

    if (isNaN(number)) {
      return; // FIXME shouldn't it throws instead?
    }

    if (element.length > 1 && element[element.length - 1] === "'") {
      number += 0x80000000;
    }

    result.push(number);
  });
  return result;
} // TODO use async await


function eachSeries(arr, fun) {
  return arr.reduce((p, e) => p.then(() => fun(e)), Promise.resolve());
}

function foreach(arr, callback) {
  function iterate(index, array, result) {
    if (index >= array.length) {
      return result;
    } else return callback(array[index], index).then(function (res) {
      result.push(res);
      return iterate(index + 1, array, result);
    });
  }

  return Promise.resolve().then(() => iterate(0, arr, []));
}

function doIf(condition, callback) {
  return Promise.resolve().then(() => {
    if (condition) {
      return callback();
    }
  });
}

function asyncWhile(predicate, callback) {
  function iterate(result) {
    if (!predicate()) {
      return result;
    } else {
      return callback().then(res => {
        result.push(res);
        return iterate(result);
      });
    }
  }

  return Promise.resolve([]).then(iterate);
}

},{}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/* eslint-disable no-continue */
/* eslint-disable no-param-reassign */
/* eslint-disable no-prototype-builtins */
var errorClasses = {};
var deserializers = {};
var addCustomErrorDeserializer = function (name, deserializer) {
    deserializers[name] = deserializer;
};
var createCustomErrorClass = function (name) {
    var C = function CustomError(message, fields) {
        Object.assign(this, fields);
        this.name = name;
        this.message = message || name;
        this.stack = new Error().stack;
    };
    C.prototype = new Error();
    errorClasses[name] = C;
    return C;
};
// inspired from https://github.com/programble/errio/blob/master/index.js
var deserializeError = function (object) {
    if (typeof object === "object" && object) {
        try {
            // $FlowFixMe FIXME HACK
            var msg = JSON.parse(object.message);
            if (msg.message && msg.name) {
                object = msg;
            }
        }
        catch (e) {
            // nothing
        }
        var error = void 0;
        if (typeof object.name === "string") {
            var name_1 = object.name;
            var des = deserializers[name_1];
            if (des) {
                error = des(object);
            }
            else {
                var constructor = name_1 === "Error" ? Error : errorClasses[name_1];
                if (!constructor) {
                    console.warn("deserializing an unknown class '" + name_1 + "'");
                    constructor = createCustomErrorClass(name_1);
                }
                error = Object.create(constructor.prototype);
                try {
                    for (var prop in object) {
                        if (object.hasOwnProperty(prop)) {
                            error[prop] = object[prop];
                        }
                    }
                }
                catch (e) {
                    // sometimes setting a property can fail (e.g. .name)
                }
            }
        }
        else {
            error = new Error(object.message);
        }
        if (!error.stack && Error.captureStackTrace) {
            Error.captureStackTrace(error, deserializeError);
        }
        return error;
    }
    return new Error(String(object));
};
// inspired from https://github.com/sindresorhus/serialize-error/blob/master/index.js
var serializeError = function (value) {
    if (!value)
        return value;
    if (typeof value === "object") {
        return destroyCircular(value, []);
    }
    if (typeof value === "function") {
        return "[Function: " + (value.name || "anonymous") + "]";
    }
    return value;
};
// https://www.npmjs.com/package/destroy-circular
function destroyCircular(from, seen) {
    var to = {};
    seen.push(from);
    for (var _i = 0, _a = Object.keys(from); _i < _a.length; _i++) {
        var key = _a[_i];
        var value = from[key];
        if (typeof value === "function") {
            continue;
        }
        if (!value || typeof value !== "object") {
            to[key] = value;
            continue;
        }
        if (seen.indexOf(from[key]) === -1) {
            to[key] = destroyCircular(from[key], seen.slice(0));
            continue;
        }
        to[key] = "[Circular]";
    }
    if (typeof from.name === "string") {
        to.name = from.name;
    }
    if (typeof from.message === "string") {
        to.message = from.message;
    }
    if (typeof from.stack === "string") {
        to.stack = from.stack;
    }
    return to;
}

var AccountNameRequiredError = createCustomErrorClass("AccountNameRequired");
var AccountNotSupported = createCustomErrorClass("AccountNotSupported");
var AmountRequired = createCustomErrorClass("AmountRequired");
var BluetoothRequired = createCustomErrorClass("BluetoothRequired");
var BtcUnmatchedApp = createCustomErrorClass("BtcUnmatchedApp");
var CantOpenDevice = createCustomErrorClass("CantOpenDevice");
var CashAddrNotSupported = createCustomErrorClass("CashAddrNotSupported");
var CurrencyNotSupported = createCustomErrorClass("CurrencyNotSupported");
var DeviceAppVerifyNotSupported = createCustomErrorClass("DeviceAppVerifyNotSupported");
var DeviceGenuineSocketEarlyClose = createCustomErrorClass("DeviceGenuineSocketEarlyClose");
var DeviceNotGenuineError = createCustomErrorClass("DeviceNotGenuine");
var DeviceOnDashboardExpected = createCustomErrorClass("DeviceOnDashboardExpected");
var DeviceOnDashboardUnexpected = createCustomErrorClass("DeviceOnDashboardUnexpected");
var DeviceInOSUExpected = createCustomErrorClass("DeviceInOSUExpected");
var DeviceHalted = createCustomErrorClass("DeviceHalted");
var DeviceNameInvalid = createCustomErrorClass("DeviceNameInvalid");
var DeviceSocketFail = createCustomErrorClass("DeviceSocketFail");
var DeviceSocketNoBulkStatus = createCustomErrorClass("DeviceSocketNoBulkStatus");
var DisconnectedDevice = createCustomErrorClass("DisconnectedDevice");
var DisconnectedDeviceDuringOperation = createCustomErrorClass("DisconnectedDeviceDuringOperation");
var EnpointConfigError = createCustomErrorClass("EnpointConfig");
var EthAppPleaseEnableContractData = createCustomErrorClass("EthAppPleaseEnableContractData");
var FeeEstimationFailed = createCustomErrorClass("FeeEstimationFailed");
var FirmwareNotRecognized = createCustomErrorClass("FirmwareNotRecognized");
var HardResetFail = createCustomErrorClass("HardResetFail");
var InvalidXRPTag = createCustomErrorClass("InvalidXRPTag");
var InvalidAddress = createCustomErrorClass("InvalidAddress");
var InvalidAddressBecauseDestinationIsAlsoSource = createCustomErrorClass("InvalidAddressBecauseDestinationIsAlsoSource");
var LatestMCUInstalledError = createCustomErrorClass("LatestMCUInstalledError");
var UnknownMCU = createCustomErrorClass("UnknownMCU");
var LedgerAPIError = createCustomErrorClass("LedgerAPIError");
var LedgerAPIErrorWithMessage = createCustomErrorClass("LedgerAPIErrorWithMessage");
var LedgerAPINotAvailable = createCustomErrorClass("LedgerAPINotAvailable");
var ManagerAppAlreadyInstalledError = createCustomErrorClass("ManagerAppAlreadyInstalled");
var ManagerAppRelyOnBTCError = createCustomErrorClass("ManagerAppRelyOnBTC");
var ManagerAppDepInstallRequired = createCustomErrorClass("ManagerAppDepInstallRequired");
var ManagerAppDepUninstallRequired = createCustomErrorClass("ManagerAppDepUninstallRequired");
var ManagerDeviceLockedError = createCustomErrorClass("ManagerDeviceLocked");
var ManagerFirmwareNotEnoughSpaceError = createCustomErrorClass("ManagerFirmwareNotEnoughSpace");
var ManagerNotEnoughSpaceError = createCustomErrorClass("ManagerNotEnoughSpace");
var ManagerUninstallBTCDep = createCustomErrorClass("ManagerUninstallBTCDep");
var NetworkDown = createCustomErrorClass("NetworkDown");
var NoAddressesFound = createCustomErrorClass("NoAddressesFound");
var NotEnoughBalance = createCustomErrorClass("NotEnoughBalance");
var NotEnoughBalanceToDelegate = createCustomErrorClass("NotEnoughBalanceToDelegate");
var NotEnoughBalanceInParentAccount = createCustomErrorClass("NotEnoughBalanceInParentAccount");
var NotEnoughSpendableBalance = createCustomErrorClass("NotEnoughSpendableBalance");
var NotEnoughBalanceBecauseDestinationNotCreated = createCustomErrorClass("NotEnoughBalanceBecauseDestinationNotCreated");
var NoAccessToCamera = createCustomErrorClass("NoAccessToCamera");
var NotEnoughGas = createCustomErrorClass("NotEnoughGas");
var NotSupportedLegacyAddress = createCustomErrorClass("NotSupportedLegacyAddress");
var GasLessThanEstimate = createCustomErrorClass("GasLessThanEstimate");
var PasswordsDontMatchError = createCustomErrorClass("PasswordsDontMatch");
var PasswordIncorrectError = createCustomErrorClass("PasswordIncorrect");
var RecommendSubAccountsToEmpty = createCustomErrorClass("RecommendSubAccountsToEmpty");
var RecommendUndelegation = createCustomErrorClass("RecommendUndelegation");
var TimeoutTagged = createCustomErrorClass("TimeoutTagged");
var UnexpectedBootloader = createCustomErrorClass("UnexpectedBootloader");
var MCUNotGenuineToDashboard = createCustomErrorClass("MCUNotGenuineToDashboard");
var RecipientRequired = createCustomErrorClass("RecipientRequired");
var UnavailableTezosOriginatedAccountReceive = createCustomErrorClass("UnavailableTezosOriginatedAccountReceive");
var UnavailableTezosOriginatedAccountSend = createCustomErrorClass("UnavailableTezosOriginatedAccountSend");
var UpdateFetchFileFail = createCustomErrorClass("UpdateFetchFileFail");
var UpdateIncorrectHash = createCustomErrorClass("UpdateIncorrectHash");
var UpdateIncorrectSig = createCustomErrorClass("UpdateIncorrectSig");
var UpdateYourApp = createCustomErrorClass("UpdateYourApp");
var UserRefusedDeviceNameChange = createCustomErrorClass("UserRefusedDeviceNameChange");
var UserRefusedAddress = createCustomErrorClass("UserRefusedAddress");
var UserRefusedFirmwareUpdate = createCustomErrorClass("UserRefusedFirmwareUpdate");
var UserRefusedAllowManager = createCustomErrorClass("UserRefusedAllowManager");
var UserRefusedOnDevice = createCustomErrorClass("UserRefusedOnDevice"); // TODO rename because it's just for transaction refusal
var TransportOpenUserCancelled = createCustomErrorClass("TransportOpenUserCancelled");
var TransportInterfaceNotAvailable = createCustomErrorClass("TransportInterfaceNotAvailable");
var TransportRaceCondition = createCustomErrorClass("TransportRaceCondition");
var TransportWebUSBGestureRequired = createCustomErrorClass("TransportWebUSBGestureRequired");
var DeviceShouldStayInApp = createCustomErrorClass("DeviceShouldStayInApp");
var WebsocketConnectionError = createCustomErrorClass("WebsocketConnectionError");
var WebsocketConnectionFailed = createCustomErrorClass("WebsocketConnectionFailed");
var WrongDeviceForAccount = createCustomErrorClass("WrongDeviceForAccount");
var WrongAppForCurrency = createCustomErrorClass("WrongAppForCurrency");
var ETHAddressNonEIP = createCustomErrorClass("ETHAddressNonEIP");
var CantScanQRCode = createCustomErrorClass("CantScanQRCode");
var FeeNotLoaded = createCustomErrorClass("FeeNotLoaded");
var FeeRequired = createCustomErrorClass("FeeRequired");
var FeeTooHigh = createCustomErrorClass("FeeTooHigh");
var SyncError = createCustomErrorClass("SyncError");
var PairingFailed = createCustomErrorClass("PairingFailed");
var GenuineCheckFailed = createCustomErrorClass("GenuineCheckFailed");
var LedgerAPI4xx = createCustomErrorClass("LedgerAPI4xx");
var LedgerAPI5xx = createCustomErrorClass("LedgerAPI5xx");
var FirmwareOrAppUpdateRequired = createCustomErrorClass("FirmwareOrAppUpdateRequired");
// db stuff, no need to translate
var NoDBPathGiven = createCustomErrorClass("NoDBPathGiven");
var DBWrongPassword = createCustomErrorClass("DBWrongPassword");
var DBNotReset = createCustomErrorClass("DBNotReset");
/**
 * TransportError is used for any generic transport errors.
 * e.g. Error thrown when data received by exchanges are incorrect or if exchanged failed to communicate with the device for various reason.
 */
function TransportError(message, id) {
    this.name = "TransportError";
    this.message = message;
    this.stack = new Error().stack;
    this.id = id;
}
TransportError.prototype = new Error();
addCustomErrorDeserializer("TransportError", function (e) { return new TransportError(e.message, e.id); });
var StatusCodes = {
    PIN_REMAINING_ATTEMPTS: 0x63c0,
    INCORRECT_LENGTH: 0x6700,
    MISSING_CRITICAL_PARAMETER: 0x6800,
    COMMAND_INCOMPATIBLE_FILE_STRUCTURE: 0x6981,
    SECURITY_STATUS_NOT_SATISFIED: 0x6982,
    CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
    INCORRECT_DATA: 0x6a80,
    NOT_ENOUGH_MEMORY_SPACE: 0x6a84,
    REFERENCED_DATA_NOT_FOUND: 0x6a88,
    FILE_ALREADY_EXISTS: 0x6a89,
    INCORRECT_P1_P2: 0x6b00,
    INS_NOT_SUPPORTED: 0x6d00,
    CLA_NOT_SUPPORTED: 0x6e00,
    TECHNICAL_PROBLEM: 0x6f00,
    OK: 0x9000,
    MEMORY_PROBLEM: 0x9240,
    NO_EF_SELECTED: 0x9400,
    INVALID_OFFSET: 0x9402,
    FILE_NOT_FOUND: 0x9404,
    INCONSISTENT_FILE: 0x9408,
    ALGORITHM_NOT_SUPPORTED: 0x9484,
    INVALID_KCV: 0x9485,
    CODE_NOT_INITIALIZED: 0x9802,
    ACCESS_CONDITION_NOT_FULFILLED: 0x9804,
    CONTRADICTION_SECRET_CODE_STATUS: 0x9808,
    CONTRADICTION_INVALIDATION: 0x9810,
    CODE_BLOCKED: 0x9840,
    MAX_VALUE_REACHED: 0x9850,
    GP_AUTH_FAILED: 0x6300,
    LICENSING: 0x6f42,
    HALTED: 0x6faa,
};
function getAltStatusMessage(code) {
    switch (code) {
        // improve text of most common errors
        case 0x6700:
            return "Incorrect length";
        case 0x6800:
            return "Missing critical parameter";
        case 0x6982:
            return "Security not satisfied (dongle locked or have invalid access rights)";
        case 0x6985:
            return "Condition of use not satisfied (denied by the user?)";
        case 0x6a80:
            return "Invalid data received";
        case 0x6b00:
            return "Invalid parameter received";
    }
    if (0x6f00 <= code && code <= 0x6fff) {
        return "Internal error, please report";
    }
}
/**
 * Error thrown when a device returned a non success status.
 * the error.statusCode is one of the `StatusCodes` exported by this library.
 */
function TransportStatusError(statusCode) {
    this.name = "TransportStatusError";
    var statusText = Object.keys(StatusCodes).find(function (k) { return StatusCodes[k] === statusCode; }) ||
        "UNKNOWN_ERROR";
    var smsg = getAltStatusMessage(statusCode) || statusText;
    var statusCodeStr = statusCode.toString(16);
    this.message = "Ledger device: " + smsg + " (0x" + statusCodeStr + ")";
    this.stack = new Error().stack;
    this.statusCode = statusCode;
    this.statusText = statusText;
}
TransportStatusError.prototype = new Error();
addCustomErrorDeserializer("TransportStatusError", function (e) { return new TransportStatusError(e.statusCode); });

exports.AccountNameRequiredError = AccountNameRequiredError;
exports.AccountNotSupported = AccountNotSupported;
exports.AmountRequired = AmountRequired;
exports.BluetoothRequired = BluetoothRequired;
exports.BtcUnmatchedApp = BtcUnmatchedApp;
exports.CantOpenDevice = CantOpenDevice;
exports.CantScanQRCode = CantScanQRCode;
exports.CashAddrNotSupported = CashAddrNotSupported;
exports.CurrencyNotSupported = CurrencyNotSupported;
exports.DBNotReset = DBNotReset;
exports.DBWrongPassword = DBWrongPassword;
exports.DeviceAppVerifyNotSupported = DeviceAppVerifyNotSupported;
exports.DeviceGenuineSocketEarlyClose = DeviceGenuineSocketEarlyClose;
exports.DeviceHalted = DeviceHalted;
exports.DeviceInOSUExpected = DeviceInOSUExpected;
exports.DeviceNameInvalid = DeviceNameInvalid;
exports.DeviceNotGenuineError = DeviceNotGenuineError;
exports.DeviceOnDashboardExpected = DeviceOnDashboardExpected;
exports.DeviceOnDashboardUnexpected = DeviceOnDashboardUnexpected;
exports.DeviceShouldStayInApp = DeviceShouldStayInApp;
exports.DeviceSocketFail = DeviceSocketFail;
exports.DeviceSocketNoBulkStatus = DeviceSocketNoBulkStatus;
exports.DisconnectedDevice = DisconnectedDevice;
exports.DisconnectedDeviceDuringOperation = DisconnectedDeviceDuringOperation;
exports.ETHAddressNonEIP = ETHAddressNonEIP;
exports.EnpointConfigError = EnpointConfigError;
exports.EthAppPleaseEnableContractData = EthAppPleaseEnableContractData;
exports.FeeEstimationFailed = FeeEstimationFailed;
exports.FeeNotLoaded = FeeNotLoaded;
exports.FeeRequired = FeeRequired;
exports.FeeTooHigh = FeeTooHigh;
exports.FirmwareNotRecognized = FirmwareNotRecognized;
exports.FirmwareOrAppUpdateRequired = FirmwareOrAppUpdateRequired;
exports.GasLessThanEstimate = GasLessThanEstimate;
exports.GenuineCheckFailed = GenuineCheckFailed;
exports.HardResetFail = HardResetFail;
exports.InvalidAddress = InvalidAddress;
exports.InvalidAddressBecauseDestinationIsAlsoSource = InvalidAddressBecauseDestinationIsAlsoSource;
exports.InvalidXRPTag = InvalidXRPTag;
exports.LatestMCUInstalledError = LatestMCUInstalledError;
exports.LedgerAPI4xx = LedgerAPI4xx;
exports.LedgerAPI5xx = LedgerAPI5xx;
exports.LedgerAPIError = LedgerAPIError;
exports.LedgerAPIErrorWithMessage = LedgerAPIErrorWithMessage;
exports.LedgerAPINotAvailable = LedgerAPINotAvailable;
exports.MCUNotGenuineToDashboard = MCUNotGenuineToDashboard;
exports.ManagerAppAlreadyInstalledError = ManagerAppAlreadyInstalledError;
exports.ManagerAppDepInstallRequired = ManagerAppDepInstallRequired;
exports.ManagerAppDepUninstallRequired = ManagerAppDepUninstallRequired;
exports.ManagerAppRelyOnBTCError = ManagerAppRelyOnBTCError;
exports.ManagerDeviceLockedError = ManagerDeviceLockedError;
exports.ManagerFirmwareNotEnoughSpaceError = ManagerFirmwareNotEnoughSpaceError;
exports.ManagerNotEnoughSpaceError = ManagerNotEnoughSpaceError;
exports.ManagerUninstallBTCDep = ManagerUninstallBTCDep;
exports.NetworkDown = NetworkDown;
exports.NoAccessToCamera = NoAccessToCamera;
exports.NoAddressesFound = NoAddressesFound;
exports.NoDBPathGiven = NoDBPathGiven;
exports.NotEnoughBalance = NotEnoughBalance;
exports.NotEnoughBalanceBecauseDestinationNotCreated = NotEnoughBalanceBecauseDestinationNotCreated;
exports.NotEnoughBalanceInParentAccount = NotEnoughBalanceInParentAccount;
exports.NotEnoughBalanceToDelegate = NotEnoughBalanceToDelegate;
exports.NotEnoughGas = NotEnoughGas;
exports.NotEnoughSpendableBalance = NotEnoughSpendableBalance;
exports.NotSupportedLegacyAddress = NotSupportedLegacyAddress;
exports.PairingFailed = PairingFailed;
exports.PasswordIncorrectError = PasswordIncorrectError;
exports.PasswordsDontMatchError = PasswordsDontMatchError;
exports.RecipientRequired = RecipientRequired;
exports.RecommendSubAccountsToEmpty = RecommendSubAccountsToEmpty;
exports.RecommendUndelegation = RecommendUndelegation;
exports.StatusCodes = StatusCodes;
exports.SyncError = SyncError;
exports.TimeoutTagged = TimeoutTagged;
exports.TransportError = TransportError;
exports.TransportInterfaceNotAvailable = TransportInterfaceNotAvailable;
exports.TransportOpenUserCancelled = TransportOpenUserCancelled;
exports.TransportRaceCondition = TransportRaceCondition;
exports.TransportStatusError = TransportStatusError;
exports.TransportWebUSBGestureRequired = TransportWebUSBGestureRequired;
exports.UnavailableTezosOriginatedAccountReceive = UnavailableTezosOriginatedAccountReceive;
exports.UnavailableTezosOriginatedAccountSend = UnavailableTezosOriginatedAccountSend;
exports.UnexpectedBootloader = UnexpectedBootloader;
exports.UnknownMCU = UnknownMCU;
exports.UpdateFetchFileFail = UpdateFetchFileFail;
exports.UpdateIncorrectHash = UpdateIncorrectHash;
exports.UpdateIncorrectSig = UpdateIncorrectSig;
exports.UpdateYourApp = UpdateYourApp;
exports.UserRefusedAddress = UserRefusedAddress;
exports.UserRefusedAllowManager = UserRefusedAllowManager;
exports.UserRefusedDeviceNameChange = UserRefusedDeviceNameChange;
exports.UserRefusedFirmwareUpdate = UserRefusedFirmwareUpdate;
exports.UserRefusedOnDevice = UserRefusedOnDevice;
exports.WebsocketConnectionError = WebsocketConnectionError;
exports.WebsocketConnectionFailed = WebsocketConnectionFailed;
exports.WrongAppForCurrency = WrongAppForCurrency;
exports.WrongDeviceForAccount = WrongDeviceForAccount;
exports.addCustomErrorDeserializer = addCustomErrorDeserializer;
exports.createCustomErrorClass = createCustomErrorClass;
exports.deserializeError = deserializeError;
exports.getAltStatusMessage = getAltStatusMessage;
exports.serializeError = serializeError;

},{}],11:[function(require,module,exports){
(function (global,Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _hwTransport = _interopRequireDefault(require("@ledgerhq/hw-transport"));

var _errors = require("@ledgerhq/errors");

var _logs = require("@ledgerhq/logs");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const WebSocket = global.WebSocket || require("ws");
/**
 * WebSocket transport implementation
 */


class WebSocketTransport extends _hwTransport.default {
  // this transport is not discoverable
  static async open(url) {
    const exchangeMethods = await new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(url);
        const exchangeMethods = {
          resolveExchange: _b => {},
          rejectExchange: _e => {},
          onDisconnect: () => {},
          close: () => socket.close(),
          send: msg => socket.send(msg)
        };

        socket.onopen = () => {
          socket.send("open");
        };

        socket.onerror = e => {
          exchangeMethods.onDisconnect();
          reject(e);
        };

        socket.onclose = () => {
          exchangeMethods.onDisconnect();
          reject(new _errors.TransportError("OpenFailed", "OpenFailed"));
        };

        socket.onmessage = e => {
          if (typeof e.data !== "string") return;
          const data = JSON.parse(e.data);

          switch (data.type) {
            case "opened":
              return resolve(exchangeMethods);

            case "error":
              reject(new Error(data.error));
              return exchangeMethods.rejectExchange(new _errors.TransportError(data.error, "WSError"));

            case "response":
              return exchangeMethods.resolveExchange(Buffer.from(data.data, "hex"));
          }
        };
      } catch (e) {
        reject(e);
      }
    });
    return new WebSocketTransport(exchangeMethods);
  }

  constructor(hook) {
    super();
    this.hook = void 0;
    this.hook = hook;

    hook.onDisconnect = () => {
      this.emit("disconnect");
      this.hook.rejectExchange(new _errors.TransportError("WebSocket disconnected", "WSDisconnect"));
    };
  }

  async exchange(apdu) {
    const hex = apdu.toString("hex");
    (0, _logs.log)("apdu", "=> " + hex);
    const res = await new Promise((resolve, reject) => {
      this.hook.rejectExchange = e => reject(e);

      this.hook.resolveExchange = b => resolve(b);

      this.hook.send(hex);
    });
    (0, _logs.log)("apdu", "<= " + res.toString("hex"));
    return res;
  }

  setScrambleKey() {}

  async close() {
    this.hook.close();
    return new Promise(success => {
      setTimeout(success, 200);
    });
  }

}

exports.default = WebSocketTransport;

WebSocketTransport.isSupported = () => Promise.resolve(typeof WebSocket === "function");

WebSocketTransport.list = () => Promise.resolve([]);

WebSocketTransport.listen = _observer => ({
  unsubscribe: () => {}
});

WebSocketTransport.check = async (url, timeout = 5000) => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  let success = false;
  setTimeout(() => {
    socket.close();
  }, timeout);

  socket.onopen = () => {
    success = true;
    socket.close();
  };

  socket.onclose = () => {
    if (success) resolve();else {
      reject(new _errors.TransportError("failed to access WebSocketTransport(" + url + ")", "WebSocketTransportNotAccessible"));
    }
  };

  socket.onerror = () => {
    reject(new _errors.TransportError("failed to access WebSocketTransport(" + url + "): error", "WebSocketTransportNotAccessible"));
  };
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"@ledgerhq/errors":12,"@ledgerhq/hw-transport":13,"@ledgerhq/logs":14,"buffer":23,"ws":359}],12:[function(require,module,exports){
arguments[4][10][0].apply(exports,arguments)
},{"dup":10}],13:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "TransportError", {
  enumerable: true,
  get: function () {
    return _errors.TransportError;
  }
});
Object.defineProperty(exports, "StatusCodes", {
  enumerable: true,
  get: function () {
    return _errors.StatusCodes;
  }
});
Object.defineProperty(exports, "getAltStatusMessage", {
  enumerable: true,
  get: function () {
    return _errors.getAltStatusMessage;
  }
});
Object.defineProperty(exports, "TransportStatusError", {
  enumerable: true,
  get: function () {
    return _errors.TransportStatusError;
  }
});
exports.default = void 0;

var _events = _interopRequireDefault(require("events"));

var _errors = require("@ledgerhq/errors");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Transport defines the generic interface to share between node/u2f impl
 * A **Descriptor** is a parametric type that is up to be determined for the implementation.
 * it can be for instance an ID, an file path, a URL,...
 */
class Transport {
  constructor() {
    this.exchangeTimeout = 30000;
    this.unresponsiveTimeout = 15000;
    this.deviceModel = null;
    this._events = new _events.default();

    this.send = async (cla, ins, p1, p2, data = Buffer.alloc(0), statusList = [_errors.StatusCodes.OK]) => {
      if (data.length >= 256) {
        throw new _errors.TransportError("data.length exceed 256 bytes limit. Got: " + data.length, "DataLengthTooBig");
      }

      const response = await this.exchange(Buffer.concat([Buffer.from([cla, ins, p1, p2]), Buffer.from([data.length]), data]));
      const sw = response.readUInt16BE(response.length - 2);

      if (!statusList.some(s => s === sw)) {
        throw new _errors.TransportStatusError(sw);
      }

      return response;
    };

    this.exchangeBusyPromise = void 0;

    this.exchangeAtomicImpl = async f => {
      if (this.exchangeBusyPromise) {
        throw new _errors.TransportRaceCondition("An action was already pending on the Ledger device. Please deny or reconnect.");
      }

      let resolveBusy;
      const busyPromise = new Promise(r => {
        resolveBusy = r;
      });
      this.exchangeBusyPromise = busyPromise;
      let unresponsiveReached = false;
      const timeout = setTimeout(() => {
        unresponsiveReached = true;
        this.emit("unresponsive");
      }, this.unresponsiveTimeout);

      try {
        const res = await f();

        if (unresponsiveReached) {
          this.emit("responsive");
        }

        return res;
      } finally {
        clearTimeout(timeout);
        if (resolveBusy) resolveBusy();
        this.exchangeBusyPromise = null;
      }
    };

    this._appAPIlock = null;
  }

  /**
   * low level api to communicate with the device
   * This method is for implementations to implement but should not be directly called.
   * Instead, the recommanded way is to use send() method
   * @param apdu the data to send
   * @return a Promise of response data
   */
  exchange(_apdu) {
    throw new Error("exchange not implemented");
  }
  /**
   * set the "scramble key" for the next exchanges with the device.
   * Each App can have a different scramble key and they internally will set it at instanciation.
   * @param key the scramble key
   */


  setScrambleKey(_key) {}
  /**
   * close the exchange with the device.
   * @return a Promise that ends when the transport is closed.
   */


  close() {
    return Promise.resolve();
  }

  /**
   * Listen to an event on an instance of transport.
   * Transport implementation can have specific events. Here is the common events:
   * * `"disconnect"` : triggered if Transport is disconnected
   */
  on(eventName, cb) {
    this._events.on(eventName, cb);
  }
  /**
   * Stop listening to an event on an instance of transport.
   */


  off(eventName, cb) {
    this._events.removeListener(eventName, cb);
  }

  emit(event, ...args) {
    this._events.emit(event, ...args);
  }
  /**
   * Enable or not logs of the binary exchange
   */


  setDebugMode() {
    console.warn("setDebugMode is deprecated. use @ledgerhq/logs instead. No logs are emitted in this anymore.");
  }
  /**
   * Set a timeout (in milliseconds) for the exchange call. Only some transport might implement it. (e.g. U2F)
   */


  setExchangeTimeout(exchangeTimeout) {
    this.exchangeTimeout = exchangeTimeout;
  }
  /**
   * Define the delay before emitting "unresponsive" on an exchange that does not respond
   */


  setExchangeUnresponsiveTimeout(unresponsiveTimeout) {
    this.unresponsiveTimeout = unresponsiveTimeout;
  }
  /**
   * wrapper on top of exchange to simplify work of the implementation.
   * @param cla
   * @param ins
   * @param p1
   * @param p2
   * @param data
   * @param statusList is a list of accepted status code (shorts). [0x9000] by default
   * @return a Promise of response buffer
   */


  /**
   * create() allows to open the first descriptor available or
   * throw if there is none or if timeout is reached.
   * This is a light helper, alternative to using listen() and open() (that you may need for any more advanced usecase)
   * @example
  TransportFoo.create().then(transport => ...)
   */
  static create(openTimeout = 3000, listenTimeout) {
    return new Promise((resolve, reject) => {
      let found = false;
      const sub = this.listen({
        next: e => {
          found = true;
          if (sub) sub.unsubscribe();
          if (listenTimeoutId) clearTimeout(listenTimeoutId);
          this.open(e.descriptor, openTimeout).then(resolve, reject);
        },
        error: e => {
          if (listenTimeoutId) clearTimeout(listenTimeoutId);
          reject(e);
        },
        complete: () => {
          if (listenTimeoutId) clearTimeout(listenTimeoutId);

          if (!found) {
            reject(new _errors.TransportError(this.ErrorMessage_NoDeviceFound, "NoDeviceFound"));
          }
        }
      });
      const listenTimeoutId = listenTimeout ? setTimeout(() => {
        sub.unsubscribe();
        reject(new _errors.TransportError(this.ErrorMessage_ListenTimeout, "ListenTimeout"));
      }, listenTimeout) : null;
    });
  }

  decorateAppAPIMethods(self, methods, scrambleKey) {
    for (let methodName of methods) {
      self[methodName] = this.decorateAppAPIMethod(methodName, self[methodName], self, scrambleKey);
    }
  }

  decorateAppAPIMethod(methodName, f, ctx, scrambleKey) {
    return async (...args) => {
      const {
        _appAPIlock
      } = this;

      if (_appAPIlock) {
        return Promise.reject(new _errors.TransportError("Ledger Device is busy (lock " + _appAPIlock + ")", "TransportLocked"));
      }

      try {
        this._appAPIlock = methodName;
        this.setScrambleKey(scrambleKey);
        return await f.apply(ctx, args);
      } finally {
        this._appAPIlock = null;
      }
    };
  }

}

exports.default = Transport;
Transport.isSupported = void 0;
Transport.list = void 0;
Transport.listen = void 0;
Transport.open = void 0;
Transport.ErrorMessage_ListenTimeout = "No Ledger device found (timeout)";
Transport.ErrorMessage_NoDeviceFound = "No Ledger device found";

}).call(this,require("buffer").Buffer)
},{"@ledgerhq/errors":12,"buffer":23,"events":353}],14:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.listen = exports.log = void 0;

/**
 * A Log object
 */
let id = 0;
const subscribers = [];
/**
 * log something
 * @param type a namespaced identifier of the log (it is not a level like "debug", "error" but more like "apdu-in", "apdu-out", etc...)
 * @param message a clear message of the log associated to the type
 */

const log = (type, message, data) => {
  const obj = {
    type,
    id: String(++id),
    date: new Date()
  };
  if (message) obj.message = message;
  if (data) obj.data = data;
  dispatch(obj);
};
/**
 * listen to logs.
 * @param cb that is called for each future log() with the Log object
 * @return a function that can be called to unsubscribe the listener
 */


exports.log = log;

const listen = cb => {
  subscribers.push(cb);
  return () => {
    const i = subscribers.indexOf(cb);

    if (i !== -1) {
      // equivalent of subscribers.splice(i, 1) // https://twitter.com/Rich_Harris/status/1125850391155965952
      subscribers[i] = subscribers[subscribers.length - 1];
      subscribers.pop();
    }
  };
};

exports.listen = listen;

function dispatch(log) {
  for (let i = 0; i < subscribers.length; i++) {
    try {
      subscribers[i](log);
    } catch (e) {
      console.error(e);
    }
  }
} // for debug purpose


if (typeof window !== "undefined") {
  window.__ledgerLogsListen = listen;
}

},{}],15:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _u2fApi = require("u2f-api");

var _hwTransport = require("@ledgerhq/hw-transport");

var _hwTransport2 = _interopRequireDefault(_hwTransport);

var _errors = require("@ledgerhq/errors");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function wrapU2FTransportError(originalError, message, id) {
  var err = new _errors.TransportError(message, id);
  // $FlowFixMe
  err.originalError = originalError;
  return err;
}

function wrapApdu(apdu, key) {
  var result = Buffer.alloc(apdu.length);
  for (var i = 0; i < apdu.length; i++) {
    result[i] = apdu[i] ^ key[i % key.length];
  }
  return result;
}

// Convert from normal to web-safe, strip trailing "="s
var webSafe64 = function webSafe64(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Convert from web-safe to normal, add trailing "="s
var normal64 = function normal64(base64) {
  return base64.replace(/-/g, "+").replace(/_/g, "/") + "==".substring(0, 3 * base64.length % 4);
};

function attemptExchange(apdu, timeoutMillis, debug, scrambleKey, unwrap) {
  var keyHandle = wrapApdu(apdu, scrambleKey);
  var challenge = Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex");
  var signRequest = {
    version: "U2F_V2",
    keyHandle: webSafe64(keyHandle.toString("base64")),
    challenge: webSafe64(challenge.toString("base64")),
    appId: location.origin
  };
  if (debug) {
    debug("=> " + apdu.toString("hex"));
  }
  return (0, _u2fApi.sign)(signRequest, timeoutMillis / 1000).then(function (response) {
    var signatureData = response.signatureData;

    if (typeof signatureData === "string") {
      var data = Buffer.from(normal64(signatureData), "base64");
      var result = void 0;
      if (!unwrap) {
        result = data;
      } else {
        result = data.slice(5);
      }
      if (debug) {
        debug("<= " + result.toString("hex"));
      }
      return result;
    } else {
      throw response;
    }
  });
}

var transportInstances = [];

function emitDisconnect() {
  transportInstances.forEach(function (t) {
    return t.emit("disconnect");
  });
  transportInstances = [];
}

function isTimeoutU2FError(u2fError) {
  return u2fError.metaData.code === 5;
}

/**
 * U2F web Transport implementation
 * @example
 * import TransportU2F from "@ledgerhq/hw-transport-u2f";
 * ...
 * TransportU2F.create().then(transport => ...)
 */

var TransportU2F = function (_Transport) {
  _inherits(TransportU2F, _Transport);

  _createClass(TransportU2F, null, [{
    key: "open",


    /**
     * static function to create a new Transport from a connected Ledger device discoverable via U2F (browser support)
     */


    /*
     */
    value: function () {
      var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(_) {
        var _openTimeout = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 5000;

        return regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                return _context.abrupt("return", new TransportU2F());

              case 1:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function open(_x) {
        return _ref.apply(this, arguments);
      }

      return open;
    }()

    /*
     */

  }]);

  function TransportU2F() {
    _classCallCheck(this, TransportU2F);

    var _this = _possibleConstructorReturn(this, (TransportU2F.__proto__ || Object.getPrototypeOf(TransportU2F)).call(this));

    _this.unwrap = true;

    transportInstances.push(_this);
    return _this;
  }

  /**
   * Exchange with the device using APDU protocol.
   * @param apdu
   * @returns a promise of apdu response
   */


  _createClass(TransportU2F, [{
    key: "exchange",
    value: function () {
      var _ref2 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(apdu) {
        var isU2FError;
        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.prev = 0;
                _context2.next = 3;
                return attemptExchange(apdu, this.exchangeTimeout, this.debug, this.scrambleKey, this.unwrap);

              case 3:
                return _context2.abrupt("return", _context2.sent);

              case 6:
                _context2.prev = 6;
                _context2.t0 = _context2["catch"](0);
                isU2FError = _typeof(_context2.t0.metaData) === "object";

                if (!isU2FError) {
                  _context2.next = 14;
                  break;
                }

                if (isTimeoutU2FError(_context2.t0)) {
                  emitDisconnect();
                }
                // the wrapping make error more usable and "printable" to the end user.
                throw wrapU2FTransportError(_context2.t0, "Failed to sign with Ledger device: U2F " + _context2.t0.metaData.type, "U2F_" + _context2.t0.metaData.code);

              case 14:
                throw _context2.t0;

              case 15:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this, [[0, 6]]);
      }));

      function exchange(_x3) {
        return _ref2.apply(this, arguments);
      }

      return exchange;
    }()

    /**
     */

  }, {
    key: "setScrambleKey",
    value: function setScrambleKey(scrambleKey) {
      this.scrambleKey = Buffer.from(scrambleKey, "ascii");
    }

    /**
     */

  }, {
    key: "setUnwrap",
    value: function setUnwrap(unwrap) {
      this.unwrap = unwrap;
    }
  }, {
    key: "close",
    value: function close() {
      // u2f have no way to clean things up
      return Promise.resolve();
    }
  }]);

  return TransportU2F;
}(_hwTransport2.default);

TransportU2F.isSupported = _u2fApi.isSupported;

TransportU2F.list = function () {
  return (
    // this transport is not discoverable but we are going to guess if it is here with isSupported()
    (0, _u2fApi.isSupported)().then(function (supported) {
      return supported ? [null] : [];
    })
  );
};

TransportU2F.listen = function (observer) {
  var unsubscribed = false;
  (0, _u2fApi.isSupported)().then(function (supported) {
    if (unsubscribed) return;
    if (supported) {
      observer.next({ type: "add", descriptor: null });
      observer.complete();
    } else {
      observer.error(new _errors.TransportError("U2F browser support is needed for Ledger. " + "Please use Chrome, Opera or Firefox with a U2F extension. " + "Also make sure you're on an HTTPS connection", "U2FNotSupported"));
    }
  });
  return {
    unsubscribe: function unsubscribe() {
      unsubscribed = true;
    }
  };
};

exports.default = TransportU2F;

}).call(this,require("buffer").Buffer)
},{"@ledgerhq/errors":5,"@ledgerhq/hw-transport":16,"buffer":23,"u2f-api":356}],16:[function(require,module,exports){
(function (global,Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getAltStatusMessage = exports.StatusCodes = exports.TransportStatusError = exports.TransportError = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events2 = require("events");

var _events3 = _interopRequireDefault(_events2);

var _errors = require("@ledgerhq/errors");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

exports.TransportError = _errors.TransportError;
exports.TransportStatusError = _errors.TransportStatusError;
exports.StatusCodes = _errors.StatusCodes;
exports.getAltStatusMessage = _errors.getAltStatusMessage;

/**
 */


/**
 */


/**
 * type: add or remove event
 * descriptor: a parameter that can be passed to open(descriptor)
 * deviceModel: device info on the model (is it a nano s, nano x, ...)
 * device: transport specific device info
 */

/**
 */

/**
 * Transport defines the generic interface to share between node/u2f impl
 * A **Descriptor** is a parametric type that is up to be determined for the implementation.
 * it can be for instance an ID, an file path, a URL,...
 */
var Transport = function () {
  function Transport() {
    var _this = this;

    _classCallCheck(this, Transport);

    this.debug = global.__ledgerDebug || null;
    this.exchangeTimeout = 30000;
    this._events = new _events3.default();

    this.send = function () {
      var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(cla, ins, p1, p2) {
        var data = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : Buffer.alloc(0);
        var statusList = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : [_errors.StatusCodes.OK];
        var response, sw;
        return regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                if (!(data.length >= 256)) {
                  _context.next = 2;
                  break;
                }

                throw new _errors.TransportError("data.length exceed 256 bytes limit. Got: " + data.length, "DataLengthTooBig");

              case 2:
                _context.next = 4;
                return _this.exchange(Buffer.concat([Buffer.from([cla, ins, p1, p2]), Buffer.from([data.length]), data]));

              case 4:
                response = _context.sent;
                sw = response.readUInt16BE(response.length - 2);

                if (statusList.some(function (s) {
                  return s === sw;
                })) {
                  _context.next = 8;
                  break;
                }

                throw new _errors.TransportStatusError(sw);

              case 8:
                return _context.abrupt("return", response);

              case 9:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, _this);
      }));

      return function (_x, _x2, _x3, _x4) {
        return _ref.apply(this, arguments);
      };
    }();

    this.exchangeAtomicImpl = function () {
      var _ref2 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(f) {
        var resolveBusy, busyPromise, res;
        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                if (!_this.exchangeBusyPromise) {
                  _context2.next = 2;
                  break;
                }

                throw new _errors.TransportError("Transport race condition", "RaceCondition");

              case 2:
                resolveBusy = void 0;
                busyPromise = new Promise(function (r) {
                  resolveBusy = r;
                });

                _this.exchangeBusyPromise = busyPromise;
                _context2.prev = 5;
                _context2.next = 8;
                return f();

              case 8:
                res = _context2.sent;
                return _context2.abrupt("return", res);

              case 10:
                _context2.prev = 10;

                if (resolveBusy) resolveBusy();
                _this.exchangeBusyPromise = null;
                return _context2.finish(10);

              case 14:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, _this, [[5,, 10, 14]]);
      }));

      return function (_x7) {
        return _ref2.apply(this, arguments);
      };
    }();

    this._appAPIlock = null;
  }

  /**
   * Statically check if a transport is supported on the user's platform/browser.
   */


  /**
   * List once all available descriptors. For a better granularity, checkout `listen()`.
   * @return a promise of descriptors
   * @example
   * TransportFoo.list().then(descriptors => ...)
   */


  /**
   * Listen all device events for a given Transport. The method takes an Obverver of DescriptorEvent and returns a Subscription (according to Observable paradigm https://github.com/tc39/proposal-observable )
   * a DescriptorEvent is a `{ descriptor, type }` object. type can be `"add"` or `"remove"` and descriptor is a value you can pass to `open(descriptor)`.
   * each listen() call will first emit all potential device already connected and then will emit events can come over times,
   * for instance if you plug a USB device after listen() or a bluetooth device become discoverable.
   * @param observer is an object with a next, error and complete function (compatible with observer pattern)
   * @return a Subscription object on which you can `.unsubscribe()` to stop listening descriptors.
   * @example
  const sub = TransportFoo.listen({
  next: e => {
    if (e.type==="add") {
      sub.unsubscribe();
      const transport = await TransportFoo.open(e.descriptor);
      ...
    }
  },
  error: error => {},
  complete: () => {}
  })
   */


  /**
   * attempt to create a Transport instance with potentially a descriptor.
   * @param descriptor: the descriptor to open the transport with.
   * @param timeout: an optional timeout
   * @return a Promise of Transport instance
   * @example
  TransportFoo.open(descriptor).then(transport => ...)
   */


  /**
   * low level api to communicate with the device
   * This method is for implementations to implement but should not be directly called.
   * Instead, the recommanded way is to use send() method
   * @param apdu the data to send
   * @return a Promise of response data
   */


  /**
   * set the "scramble key" for the next exchanges with the device.
   * Each App can have a different scramble key and they internally will set it at instanciation.
   * @param key the scramble key
   */


  /**
   * close the exchange with the device.
   * @return a Promise that ends when the transport is closed.
   */


  _createClass(Transport, [{
    key: "on",


    /**
     * Listen to an event on an instance of transport.
     * Transport implementation can have specific events. Here is the common events:
     * * `"disconnect"` : triggered if Transport is disconnected
     */
    value: function on(eventName, cb) {
      this._events.on(eventName, cb);
    }

    /**
     * Stop listening to an event on an instance of transport.
     */

  }, {
    key: "off",
    value: function off(eventName, cb) {
      this._events.removeListener(eventName, cb);
    }
  }, {
    key: "emit",
    value: function emit(event) {
      var _events;

      for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }

      (_events = this._events).emit.apply(_events, [event].concat(_toConsumableArray(args)));
    }

    /**
     * Enable or not logs of the binary exchange
     */

  }, {
    key: "setDebugMode",
    value: function setDebugMode(debug) {
      this.debug = typeof debug === "function" ? debug : debug ? function (log) {
        return console.log(log);
      } : null;
    }

    /**
     * Set a timeout (in milliseconds) for the exchange call. Only some transport might implement it. (e.g. U2F)
     */

  }, {
    key: "setExchangeTimeout",
    value: function setExchangeTimeout(exchangeTimeout) {
      this.exchangeTimeout = exchangeTimeout;
    }

    /**
     * wrapper on top of exchange to simplify work of the implementation.
     * @param cla
     * @param ins
     * @param p1
     * @param p2
     * @param data
     * @param statusList is a list of accepted status code (shorts). [0x9000] by default
     * @return a Promise of response buffer
     */

  }, {
    key: "decorateAppAPIMethods",
    value: function decorateAppAPIMethods(self, methods, scrambleKey) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = methods[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var methodName = _step.value;

          self[methodName] = this.decorateAppAPIMethod(methodName, self[methodName], self, scrambleKey);
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
  }, {
    key: "decorateAppAPIMethod",
    value: function decorateAppAPIMethod(methodName, f, ctx, scrambleKey) {
      var _this2 = this;

      return function () {
        var _ref3 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee3() {
          for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
            args[_key2] = arguments[_key2];
          }

          var _appAPIlock;

          return regeneratorRuntime.wrap(function _callee3$(_context3) {
            while (1) {
              switch (_context3.prev = _context3.next) {
                case 0:
                  _appAPIlock = _this2._appAPIlock;

                  if (!_appAPIlock) {
                    _context3.next = 3;
                    break;
                  }

                  return _context3.abrupt("return", Promise.reject(new _errors.TransportError("Ledger Device is busy (lock " + _appAPIlock + ")", "TransportLocked")));

                case 3:
                  _context3.prev = 3;

                  _this2._appAPIlock = methodName;
                  _this2.setScrambleKey(scrambleKey);
                  _context3.next = 8;
                  return f.apply(ctx, args);

                case 8:
                  return _context3.abrupt("return", _context3.sent);

                case 9:
                  _context3.prev = 9;

                  _this2._appAPIlock = null;
                  return _context3.finish(9);

                case 12:
                case "end":
                  return _context3.stop();
              }
            }
          }, _callee3, _this2, [[3,, 9, 12]]);
        }));

        return function () {
          return _ref3.apply(this, arguments);
        };
      }();
    }
  }], [{
    key: "create",


    /**
     * create() allows to open the first descriptor available or
     * throw if there is none or if timeout is reached.
     * This is a light helper, alternative to using listen() and open() (that you may need for any more advanced usecase)
     * @example
    TransportFoo.create().then(transport => ...)
     */
    value: function create() {
      var _this3 = this;

      var openTimeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 3000;
      var listenTimeout = arguments[1];

      return new Promise(function (resolve, reject) {
        var found = false;
        var sub = _this3.listen({
          next: function next(e) {
            found = true;
            if (sub) sub.unsubscribe();
            if (listenTimeoutId) clearTimeout(listenTimeoutId);
            _this3.open(e.descriptor, openTimeout).then(resolve, reject);
          },
          error: function error(e) {
            if (listenTimeoutId) clearTimeout(listenTimeoutId);
            reject(e);
          },
          complete: function complete() {
            if (listenTimeoutId) clearTimeout(listenTimeoutId);
            if (!found) {
              reject(new _errors.TransportError(_this3.ErrorMessage_NoDeviceFound, "NoDeviceFound"));
            }
          }
        });
        var listenTimeoutId = listenTimeout ? setTimeout(function () {
          sub.unsubscribe();
          reject(new _errors.TransportError(_this3.ErrorMessage_ListenTimeout, "ListenTimeout"));
        }, listenTimeout) : null;
      });
    }

    // $FlowFixMe

  }]);

  return Transport;
}();

Transport.ErrorMessage_ListenTimeout = "No Ledger device found (timeout)";
Transport.ErrorMessage_NoDeviceFound = "No Ledger device found";
exports.default = Transport;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"@ledgerhq/errors":5,"buffer":23,"events":353}],17:[function(require,module,exports){
(function (global){
"use strict";

require("core-js/shim");

require("regenerator-runtime/runtime");

require("core-js/fn/regexp/escape");

if (global._babelPolyfill) {
  throw new Error("only one instance of babel-polyfill is allowed");
}
global._babelPolyfill = true;

var DEFINE_PROPERTY = "defineProperty";
function define(O, key, value) {
  O[key] || Object[DEFINE_PROPERTY](O, key, {
    writable: true,
    configurable: true,
    value: value
  });
}

define(String.prototype, "padLeft", "".padStart);
define(String.prototype, "padRight", "".padEnd);

"pop,reverse,shift,keys,values,entries,indexOf,every,some,forEach,map,filter,find,findIndex,includes,join,slice,concat,push,splice,unshift,sort,lastIndexOf,reduce,reduceRight,copyWithin,fill".split(",").forEach(function (key) {
  [][key] && define(Array, key, Function.call.bind([][key]));
});
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"core-js/fn/regexp/escape":24,"core-js/shim":352,"regenerator-runtime/runtime":18}],18:[function(require,module,exports){
(function (global){
/**
 * Copyright (c) 2014, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
 * additional grant of patent rights can be found in the PATENTS file in
 * the same directory.
 */

!(function(global) {
  "use strict";

  var Op = Object.prototype;
  var hasOwn = Op.hasOwnProperty;
  var undefined; // More compressible than void 0.
  var $Symbol = typeof Symbol === "function" ? Symbol : {};
  var iteratorSymbol = $Symbol.iterator || "@@iterator";
  var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
  var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  var inModule = typeof module === "object";
  var runtime = global.regeneratorRuntime;
  if (runtime) {
    if (inModule) {
      // If regeneratorRuntime is defined globally and we're in a module,
      // make the exports object identical to regeneratorRuntime.
      module.exports = runtime;
    }
    // Don't bother evaluating the rest of this file if the runtime was
    // already defined globally.
    return;
  }

  // Define the runtime globally (as expected by generated code) as either
  // module.exports (if we're in a module) or a new, empty object.
  runtime = global.regeneratorRuntime = inModule ? module.exports : {};

  function wrap(innerFn, outerFn, self, tryLocsList) {
    // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
    var generator = Object.create(protoGenerator.prototype);
    var context = new Context(tryLocsList || []);

    // The ._invoke method unifies the implementations of the .next,
    // .throw, and .return methods.
    generator._invoke = makeInvokeMethod(innerFn, self, context);

    return generator;
  }
  runtime.wrap = wrap;

  // Try/catch helper to minimize deoptimizations. Returns a completion
  // record like context.tryEntries[i].completion. This interface could
  // have been (and was previously) designed to take a closure to be
  // invoked without arguments, but in all the cases we care about we
  // already have an existing method we want to call, so there's no need
  // to create a new function object. We can even get away with assuming
  // the method takes exactly one argument, since that happens to be true
  // in every case, so we don't have to touch the arguments object. The
  // only additional allocation required is the completion record, which
  // has a stable shape and so hopefully should be cheap to allocate.
  function tryCatch(fn, obj, arg) {
    try {
      return { type: "normal", arg: fn.call(obj, arg) };
    } catch (err) {
      return { type: "throw", arg: err };
    }
  }

  var GenStateSuspendedStart = "suspendedStart";
  var GenStateSuspendedYield = "suspendedYield";
  var GenStateExecuting = "executing";
  var GenStateCompleted = "completed";

  // Returning this object from the innerFn has the same effect as
  // breaking out of the dispatch switch statement.
  var ContinueSentinel = {};

  // Dummy constructor functions that we use as the .constructor and
  // .constructor.prototype properties for functions that return Generator
  // objects. For full spec compliance, you may wish to configure your
  // minifier not to mangle the names of these two functions.
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}

  // This is a polyfill for %IteratorPrototype% for environments that
  // don't natively support it.
  var IteratorPrototype = {};
  IteratorPrototype[iteratorSymbol] = function () {
    return this;
  };

  var getProto = Object.getPrototypeOf;
  var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
  if (NativeIteratorPrototype &&
      NativeIteratorPrototype !== Op &&
      hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
    // This environment has a native %IteratorPrototype%; use it instead
    // of the polyfill.
    IteratorPrototype = NativeIteratorPrototype;
  }

  var Gp = GeneratorFunctionPrototype.prototype =
    Generator.prototype = Object.create(IteratorPrototype);
  GeneratorFunction.prototype = Gp.constructor = GeneratorFunctionPrototype;
  GeneratorFunctionPrototype.constructor = GeneratorFunction;
  GeneratorFunctionPrototype[toStringTagSymbol] =
    GeneratorFunction.displayName = "GeneratorFunction";

  // Helper for defining the .next, .throw, and .return methods of the
  // Iterator interface in terms of a single ._invoke method.
  function defineIteratorMethods(prototype) {
    ["next", "throw", "return"].forEach(function(method) {
      prototype[method] = function(arg) {
        return this._invoke(method, arg);
      };
    });
  }

  runtime.isGeneratorFunction = function(genFun) {
    var ctor = typeof genFun === "function" && genFun.constructor;
    return ctor
      ? ctor === GeneratorFunction ||
        // For the native GeneratorFunction constructor, the best we can
        // do is to check its .name property.
        (ctor.displayName || ctor.name) === "GeneratorFunction"
      : false;
  };

  runtime.mark = function(genFun) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
    } else {
      genFun.__proto__ = GeneratorFunctionPrototype;
      if (!(toStringTagSymbol in genFun)) {
        genFun[toStringTagSymbol] = "GeneratorFunction";
      }
    }
    genFun.prototype = Object.create(Gp);
    return genFun;
  };

  // Within the body of any async function, `await x` is transformed to
  // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
  // `hasOwn.call(value, "__await")` to determine if the yielded value is
  // meant to be awaited.
  runtime.awrap = function(arg) {
    return { __await: arg };
  };

  function AsyncIterator(generator) {
    function invoke(method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);
      if (record.type === "throw") {
        reject(record.arg);
      } else {
        var result = record.arg;
        var value = result.value;
        if (value &&
            typeof value === "object" &&
            hasOwn.call(value, "__await")) {
          return Promise.resolve(value.__await).then(function(value) {
            invoke("next", value, resolve, reject);
          }, function(err) {
            invoke("throw", err, resolve, reject);
          });
        }

        return Promise.resolve(value).then(function(unwrapped) {
          // When a yielded Promise is resolved, its final value becomes
          // the .value of the Promise<{value,done}> result for the
          // current iteration. If the Promise is rejected, however, the
          // result for this iteration will be rejected with the same
          // reason. Note that rejections of yielded Promises are not
          // thrown back into the generator function, as is the case
          // when an awaited Promise is rejected. This difference in
          // behavior between yield and await is important, because it
          // allows the consumer to decide what to do with the yielded
          // rejection (swallow it and continue, manually .throw it back
          // into the generator, abandon iteration, whatever). With
          // await, by contrast, there is no opportunity to examine the
          // rejection reason outside the generator function, so the
          // only option is to throw it from the await expression, and
          // let the generator function handle the exception.
          result.value = unwrapped;
          resolve(result);
        }, reject);
      }
    }

    if (typeof global.process === "object" && global.process.domain) {
      invoke = global.process.domain.bind(invoke);
    }

    var previousPromise;

    function enqueue(method, arg) {
      function callInvokeWithMethodAndArg() {
        return new Promise(function(resolve, reject) {
          invoke(method, arg, resolve, reject);
        });
      }

      return previousPromise =
        // If enqueue has been called before, then we want to wait until
        // all previous Promises have been resolved before calling invoke,
        // so that results are always delivered in the correct order. If
        // enqueue has not been called before, then it is important to
        // call invoke immediately, without waiting on a callback to fire,
        // so that the async generator function has the opportunity to do
        // any necessary setup in a predictable way. This predictability
        // is why the Promise constructor synchronously invokes its
        // executor callback, and why async functions synchronously
        // execute code before the first await. Since we implement simple
        // async functions in terms of async generators, it is especially
        // important to get this right, even though it requires care.
        previousPromise ? previousPromise.then(
          callInvokeWithMethodAndArg,
          // Avoid propagating failures to Promises returned by later
          // invocations of the iterator.
          callInvokeWithMethodAndArg
        ) : callInvokeWithMethodAndArg();
    }

    // Define the unified helper method that is used to implement .next,
    // .throw, and .return (see defineIteratorMethods).
    this._invoke = enqueue;
  }

  defineIteratorMethods(AsyncIterator.prototype);
  AsyncIterator.prototype[asyncIteratorSymbol] = function () {
    return this;
  };
  runtime.AsyncIterator = AsyncIterator;

  // Note that simple async functions are implemented on top of
  // AsyncIterator objects; they just return a Promise for the value of
  // the final result produced by the iterator.
  runtime.async = function(innerFn, outerFn, self, tryLocsList) {
    var iter = new AsyncIterator(
      wrap(innerFn, outerFn, self, tryLocsList)
    );

    return runtime.isGeneratorFunction(outerFn)
      ? iter // If outerFn is a generator, return the full iterator.
      : iter.next().then(function(result) {
          return result.done ? result.value : iter.next();
        });
  };

  function makeInvokeMethod(innerFn, self, context) {
    var state = GenStateSuspendedStart;

    return function invoke(method, arg) {
      if (state === GenStateExecuting) {
        throw new Error("Generator is already running");
      }

      if (state === GenStateCompleted) {
        if (method === "throw") {
          throw arg;
        }

        // Be forgiving, per 25.3.3.3.3 of the spec:
        // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorresume
        return doneResult();
      }

      context.method = method;
      context.arg = arg;

      while (true) {
        var delegate = context.delegate;
        if (delegate) {
          var delegateResult = maybeInvokeDelegate(delegate, context);
          if (delegateResult) {
            if (delegateResult === ContinueSentinel) continue;
            return delegateResult;
          }
        }

        if (context.method === "next") {
          // Setting context._sent for legacy support of Babel's
          // function.sent implementation.
          context.sent = context._sent = context.arg;

        } else if (context.method === "throw") {
          if (state === GenStateSuspendedStart) {
            state = GenStateCompleted;
            throw context.arg;
          }

          context.dispatchException(context.arg);

        } else if (context.method === "return") {
          context.abrupt("return", context.arg);
        }

        state = GenStateExecuting;

        var record = tryCatch(innerFn, self, context);
        if (record.type === "normal") {
          // If an exception is thrown from innerFn, we leave state ===
          // GenStateExecuting and loop back for another invocation.
          state = context.done
            ? GenStateCompleted
            : GenStateSuspendedYield;

          if (record.arg === ContinueSentinel) {
            continue;
          }

          return {
            value: record.arg,
            done: context.done
          };

        } else if (record.type === "throw") {
          state = GenStateCompleted;
          // Dispatch the exception by looping back around to the
          // context.dispatchException(context.arg) call above.
          context.method = "throw";
          context.arg = record.arg;
        }
      }
    };
  }

  // Call delegate.iterator[context.method](context.arg) and handle the
  // result, either by returning a { value, done } result from the
  // delegate iterator, or by modifying context.method and context.arg,
  // setting context.delegate to null, and returning the ContinueSentinel.
  function maybeInvokeDelegate(delegate, context) {
    var method = delegate.iterator[context.method];
    if (method === undefined) {
      // A .throw or .return when the delegate iterator has no .throw
      // method always terminates the yield* loop.
      context.delegate = null;

      if (context.method === "throw") {
        if (delegate.iterator.return) {
          // If the delegate iterator has a return method, give it a
          // chance to clean up.
          context.method = "return";
          context.arg = undefined;
          maybeInvokeDelegate(delegate, context);

          if (context.method === "throw") {
            // If maybeInvokeDelegate(context) changed context.method from
            // "return" to "throw", let that override the TypeError below.
            return ContinueSentinel;
          }
        }

        context.method = "throw";
        context.arg = new TypeError(
          "The iterator does not provide a 'throw' method");
      }

      return ContinueSentinel;
    }

    var record = tryCatch(method, delegate.iterator, context.arg);

    if (record.type === "throw") {
      context.method = "throw";
      context.arg = record.arg;
      context.delegate = null;
      return ContinueSentinel;
    }

    var info = record.arg;

    if (! info) {
      context.method = "throw";
      context.arg = new TypeError("iterator result is not an object");
      context.delegate = null;
      return ContinueSentinel;
    }

    if (info.done) {
      // Assign the result of the finished delegate to the temporary
      // variable specified by delegate.resultName (see delegateYield).
      context[delegate.resultName] = info.value;

      // Resume execution at the desired location (see delegateYield).
      context.next = delegate.nextLoc;

      // If context.method was "throw" but the delegate handled the
      // exception, let the outer generator proceed normally. If
      // context.method was "next", forget context.arg since it has been
      // "consumed" by the delegate iterator. If context.method was
      // "return", allow the original .return call to continue in the
      // outer generator.
      if (context.method !== "return") {
        context.method = "next";
        context.arg = undefined;
      }

    } else {
      // Re-yield the result returned by the delegate method.
      return info;
    }

    // The delegate iterator is finished, so forget it and continue with
    // the outer generator.
    context.delegate = null;
    return ContinueSentinel;
  }

  // Define Generator.prototype.{next,throw,return} in terms of the
  // unified ._invoke helper method.
  defineIteratorMethods(Gp);

  Gp[toStringTagSymbol] = "Generator";

  // A Generator should always return itself as the iterator object when the
  // @@iterator function is called on it. Some browsers' implementations of the
  // iterator prototype chain incorrectly implement this, causing the Generator
  // object to not be returned from this call. This ensures that doesn't happen.
  // See https://github.com/facebook/regenerator/issues/274 for more details.
  Gp[iteratorSymbol] = function() {
    return this;
  };

  Gp.toString = function() {
    return "[object Generator]";
  };

  function pushTryEntry(locs) {
    var entry = { tryLoc: locs[0] };

    if (1 in locs) {
      entry.catchLoc = locs[1];
    }

    if (2 in locs) {
      entry.finallyLoc = locs[2];
      entry.afterLoc = locs[3];
    }

    this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal";
    delete record.arg;
    entry.completion = record;
  }

  function Context(tryLocsList) {
    // The root entry object (effectively a try statement without a catch
    // or a finally block) gives us a place to store values thrown from
    // locations where there is no enclosing try statement.
    this.tryEntries = [{ tryLoc: "root" }];
    tryLocsList.forEach(pushTryEntry, this);
    this.reset(true);
  }

  runtime.keys = function(object) {
    var keys = [];
    for (var key in object) {
      keys.push(key);
    }
    keys.reverse();

    // Rather than returning an object with a next method, we keep
    // things simple and return the next function itself.
    return function next() {
      while (keys.length) {
        var key = keys.pop();
        if (key in object) {
          next.value = key;
          next.done = false;
          return next;
        }
      }

      // To avoid creating an additional object, we just hang the .value
      // and .done properties off the next function object itself. This
      // also ensures that the minifier will not anonymize the function.
      next.done = true;
      return next;
    };
  };

  function values(iterable) {
    if (iterable) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) {
        return iteratorMethod.call(iterable);
      }

      if (typeof iterable.next === "function") {
        return iterable;
      }

      if (!isNaN(iterable.length)) {
        var i = -1, next = function next() {
          while (++i < iterable.length) {
            if (hasOwn.call(iterable, i)) {
              next.value = iterable[i];
              next.done = false;
              return next;
            }
          }

          next.value = undefined;
          next.done = true;

          return next;
        };

        return next.next = next;
      }
    }

    // Return an iterator with no values.
    return { next: doneResult };
  }
  runtime.values = values;

  function doneResult() {
    return { value: undefined, done: true };
  }

  Context.prototype = {
    constructor: Context,

    reset: function(skipTempReset) {
      this.prev = 0;
      this.next = 0;
      // Resetting context._sent for legacy support of Babel's
      // function.sent implementation.
      this.sent = this._sent = undefined;
      this.done = false;
      this.delegate = null;

      this.method = "next";
      this.arg = undefined;

      this.tryEntries.forEach(resetTryEntry);

      if (!skipTempReset) {
        for (var name in this) {
          // Not sure about the optimal order of these conditions:
          if (name.charAt(0) === "t" &&
              hasOwn.call(this, name) &&
              !isNaN(+name.slice(1))) {
            this[name] = undefined;
          }
        }
      }
    },

    stop: function() {
      this.done = true;

      var rootEntry = this.tryEntries[0];
      var rootRecord = rootEntry.completion;
      if (rootRecord.type === "throw") {
        throw rootRecord.arg;
      }

      return this.rval;
    },

    dispatchException: function(exception) {
      if (this.done) {
        throw exception;
      }

      var context = this;
      function handle(loc, caught) {
        record.type = "throw";
        record.arg = exception;
        context.next = loc;

        if (caught) {
          // If the dispatched exception was caught by a catch block,
          // then let that catch block handle the exception normally.
          context.method = "next";
          context.arg = undefined;
        }

        return !! caught;
      }

      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        var record = entry.completion;

        if (entry.tryLoc === "root") {
          // Exception thrown outside of any try block that could handle
          // it, so set the completion value of the entire function to
          // throw the exception.
          return handle("end");
        }

        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc");
          var hasFinally = hasOwn.call(entry, "finallyLoc");

          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            } else if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            }

          } else if (hasFinally) {
            if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else {
            throw new Error("try statement without catch or finally");
          }
        }
      }
    },

    abrupt: function(type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc <= this.prev &&
            hasOwn.call(entry, "finallyLoc") &&
            this.prev < entry.finallyLoc) {
          var finallyEntry = entry;
          break;
        }
      }

      if (finallyEntry &&
          (type === "break" ||
           type === "continue") &&
          finallyEntry.tryLoc <= arg &&
          arg <= finallyEntry.finallyLoc) {
        // Ignore the finally entry if control is not jumping to a
        // location outside the try/catch block.
        finallyEntry = null;
      }

      var record = finallyEntry ? finallyEntry.completion : {};
      record.type = type;
      record.arg = arg;

      if (finallyEntry) {
        this.method = "next";
        this.next = finallyEntry.finallyLoc;
        return ContinueSentinel;
      }

      return this.complete(record);
    },

    complete: function(record, afterLoc) {
      if (record.type === "throw") {
        throw record.arg;
      }

      if (record.type === "break" ||
          record.type === "continue") {
        this.next = record.arg;
      } else if (record.type === "return") {
        this.rval = this.arg = record.arg;
        this.method = "return";
        this.next = "end";
      } else if (record.type === "normal" && afterLoc) {
        this.next = afterLoc;
      }

      return ContinueSentinel;
    },

    finish: function(finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) {
          this.complete(entry.completion, entry.afterLoc);
          resetTryEntry(entry);
          return ContinueSentinel;
        }
      }
    },

    "catch": function(tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;
          if (record.type === "throw") {
            var thrown = record.arg;
            resetTryEntry(entry);
          }
          return thrown;
        }
      }

      // The context.catch method must only be called with a location
      // argument that corresponds to a known catch block.
      throw new Error("illegal catch attempt");
    },

    delegateYield: function(iterable, resultName, nextLoc) {
      this.delegate = {
        iterator: values(iterable),
        resultName: resultName,
        nextLoc: nextLoc
      };

      if (this.method === "next") {
        // Deliberately forget the last sent value so that we don't
        // accidentally pass it on to the delegate.
        this.arg = undefined;
      }

      return ContinueSentinel;
    }
  };
})(
  // Among the various tricks for obtaining a reference to the global
  // object, this seems to be the most reliable technique that does not
  // use indirect eval (which violates Content Security Policy).
  typeof global === "object" ? global :
  typeof window === "object" ? window :
  typeof self === "object" ? self : this
);

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],19:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  for (var i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(
      uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)
    ))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],20:[function(require,module,exports){
;(function (globalObject) {
  'use strict';

/*
 *      bignumber.js v9.0.1
 *      A JavaScript library for arbitrary-precision arithmetic.
 *      https://github.com/MikeMcl/bignumber.js
 *      Copyright (c) 2020 Michael Mclaughlin <M8ch88l@gmail.com>
 *      MIT Licensed.
 *
 *      BigNumber.prototype methods     |  BigNumber methods
 *                                      |
 *      absoluteValue            abs    |  clone
 *      comparedTo                      |  config               set
 *      decimalPlaces            dp     |      DECIMAL_PLACES
 *      dividedBy                div    |      ROUNDING_MODE
 *      dividedToIntegerBy       idiv   |      EXPONENTIAL_AT
 *      exponentiatedBy          pow    |      RANGE
 *      integerValue                    |      CRYPTO
 *      isEqualTo                eq     |      MODULO_MODE
 *      isFinite                        |      POW_PRECISION
 *      isGreaterThan            gt     |      FORMAT
 *      isGreaterThanOrEqualTo   gte    |      ALPHABET
 *      isInteger                       |  isBigNumber
 *      isLessThan               lt     |  maximum              max
 *      isLessThanOrEqualTo      lte    |  minimum              min
 *      isNaN                           |  random
 *      isNegative                      |  sum
 *      isPositive                      |
 *      isZero                          |
 *      minus                           |
 *      modulo                   mod    |
 *      multipliedBy             times  |
 *      negated                         |
 *      plus                            |
 *      precision                sd     |
 *      shiftedBy                       |
 *      squareRoot               sqrt   |
 *      toExponential                   |
 *      toFixed                         |
 *      toFormat                        |
 *      toFraction                      |
 *      toJSON                          |
 *      toNumber                        |
 *      toPrecision                     |
 *      toString                        |
 *      valueOf                         |
 *
 */


  var BigNumber,
    isNumeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i,
    mathceil = Math.ceil,
    mathfloor = Math.floor,

    bignumberError = '[BigNumber Error] ',
    tooManyDigits = bignumberError + 'Number primitive has more than 15 significant digits: ',

    BASE = 1e14,
    LOG_BASE = 14,
    MAX_SAFE_INTEGER = 0x1fffffffffffff,         // 2^53 - 1
    // MAX_INT32 = 0x7fffffff,                   // 2^31 - 1
    POWS_TEN = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13],
    SQRT_BASE = 1e7,

    // EDITABLE
    // The limit on the value of DECIMAL_PLACES, TO_EXP_NEG, TO_EXP_POS, MIN_EXP, MAX_EXP, and
    // the arguments to toExponential, toFixed, toFormat, and toPrecision.
    MAX = 1E9;                                   // 0 to MAX_INT32


  /*
   * Create and return a BigNumber constructor.
   */
  function clone(configObject) {
    var div, convertBase, parseNumeric,
      P = BigNumber.prototype = { constructor: BigNumber, toString: null, valueOf: null },
      ONE = new BigNumber(1),


      //----------------------------- EDITABLE CONFIG DEFAULTS -------------------------------


      // The default values below must be integers within the inclusive ranges stated.
      // The values can also be changed at run-time using BigNumber.set.

      // The maximum number of decimal places for operations involving division.
      DECIMAL_PLACES = 20,                     // 0 to MAX

      // The rounding mode used when rounding to the above decimal places, and when using
      // toExponential, toFixed, toFormat and toPrecision, and round (default value).
      // UP         0 Away from zero.
      // DOWN       1 Towards zero.
      // CEIL       2 Towards +Infinity.
      // FLOOR      3 Towards -Infinity.
      // HALF_UP    4 Towards nearest neighbour. If equidistant, up.
      // HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
      // HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
      // HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
      // HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
      ROUNDING_MODE = 4,                       // 0 to 8

      // EXPONENTIAL_AT : [TO_EXP_NEG , TO_EXP_POS]

      // The exponent value at and beneath which toString returns exponential notation.
      // Number type: -7
      TO_EXP_NEG = -7,                         // 0 to -MAX

      // The exponent value at and above which toString returns exponential notation.
      // Number type: 21
      TO_EXP_POS = 21,                         // 0 to MAX

      // RANGE : [MIN_EXP, MAX_EXP]

      // The minimum exponent value, beneath which underflow to zero occurs.
      // Number type: -324  (5e-324)
      MIN_EXP = -1e7,                          // -1 to -MAX

      // The maximum exponent value, above which overflow to Infinity occurs.
      // Number type:  308  (1.7976931348623157e+308)
      // For MAX_EXP > 1e7, e.g. new BigNumber('1e100000000').plus(1) may be slow.
      MAX_EXP = 1e7,                           // 1 to MAX

      // Whether to use cryptographically-secure random number generation, if available.
      CRYPTO = false,                          // true or false

      // The modulo mode used when calculating the modulus: a mod n.
      // The quotient (q = a / n) is calculated according to the corresponding rounding mode.
      // The remainder (r) is calculated as: r = a - n * q.
      //
      // UP        0 The remainder is positive if the dividend is negative, else is negative.
      // DOWN      1 The remainder has the same sign as the dividend.
      //             This modulo mode is commonly known as 'truncated division' and is
      //             equivalent to (a % n) in JavaScript.
      // FLOOR     3 The remainder has the same sign as the divisor (Python %).
      // HALF_EVEN 6 This modulo mode implements the IEEE 754 remainder function.
      // EUCLID    9 Euclidian division. q = sign(n) * floor(a / abs(n)).
      //             The remainder is always positive.
      //
      // The truncated division, floored division, Euclidian division and IEEE 754 remainder
      // modes are commonly used for the modulus operation.
      // Although the other rounding modes can also be used, they may not give useful results.
      MODULO_MODE = 1,                         // 0 to 9

      // The maximum number of significant digits of the result of the exponentiatedBy operation.
      // If POW_PRECISION is 0, there will be unlimited significant digits.
      POW_PRECISION = 0,                    // 0 to MAX

      // The format specification used by the BigNumber.prototype.toFormat method.
      FORMAT = {
        prefix: '',
        groupSize: 3,
        secondaryGroupSize: 0,
        groupSeparator: ',',
        decimalSeparator: '.',
        fractionGroupSize: 0,
        fractionGroupSeparator: '\xA0',      // non-breaking space
        suffix: ''
      },

      // The alphabet used for base conversion. It must be at least 2 characters long, with no '+',
      // '-', '.', whitespace, or repeated character.
      // '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_'
      ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';


    //------------------------------------------------------------------------------------------


    // CONSTRUCTOR


    /*
     * The BigNumber constructor and exported function.
     * Create and return a new instance of a BigNumber object.
     *
     * v {number|string|BigNumber} A numeric value.
     * [b] {number} The base of v. Integer, 2 to ALPHABET.length inclusive.
     */
    function BigNumber(v, b) {
      var alphabet, c, caseChanged, e, i, isNum, len, str,
        x = this;

      // Enable constructor call without `new`.
      if (!(x instanceof BigNumber)) return new BigNumber(v, b);

      if (b == null) {

        if (v && v._isBigNumber === true) {
          x.s = v.s;

          if (!v.c || v.e > MAX_EXP) {
            x.c = x.e = null;
          } else if (v.e < MIN_EXP) {
            x.c = [x.e = 0];
          } else {
            x.e = v.e;
            x.c = v.c.slice();
          }

          return;
        }

        if ((isNum = typeof v == 'number') && v * 0 == 0) {

          // Use `1 / n` to handle minus zero also.
          x.s = 1 / v < 0 ? (v = -v, -1) : 1;

          // Fast path for integers, where n < 2147483648 (2**31).
          if (v === ~~v) {
            for (e = 0, i = v; i >= 10; i /= 10, e++);

            if (e > MAX_EXP) {
              x.c = x.e = null;
            } else {
              x.e = e;
              x.c = [v];
            }

            return;
          }

          str = String(v);
        } else {

          if (!isNumeric.test(str = String(v))) return parseNumeric(x, str, isNum);

          x.s = str.charCodeAt(0) == 45 ? (str = str.slice(1), -1) : 1;
        }

        // Decimal point?
        if ((e = str.indexOf('.')) > -1) str = str.replace('.', '');

        // Exponential form?
        if ((i = str.search(/e/i)) > 0) {

          // Determine exponent.
          if (e < 0) e = i;
          e += +str.slice(i + 1);
          str = str.substring(0, i);
        } else if (e < 0) {

          // Integer.
          e = str.length;
        }

      } else {

        // '[BigNumber Error] Base {not a primitive number|not an integer|out of range}: {b}'
        intCheck(b, 2, ALPHABET.length, 'Base');

        // Allow exponential notation to be used with base 10 argument, while
        // also rounding to DECIMAL_PLACES as with other bases.
        if (b == 10) {
          x = new BigNumber(v);
          return round(x, DECIMAL_PLACES + x.e + 1, ROUNDING_MODE);
        }

        str = String(v);

        if (isNum = typeof v == 'number') {

          // Avoid potential interpretation of Infinity and NaN as base 44+ values.
          if (v * 0 != 0) return parseNumeric(x, str, isNum, b);

          x.s = 1 / v < 0 ? (str = str.slice(1), -1) : 1;

          // '[BigNumber Error] Number primitive has more than 15 significant digits: {n}'
          if (BigNumber.DEBUG && str.replace(/^0\.0*|\./, '').length > 15) {
            throw Error
             (tooManyDigits + v);
          }
        } else {
          x.s = str.charCodeAt(0) === 45 ? (str = str.slice(1), -1) : 1;
        }

        alphabet = ALPHABET.slice(0, b);
        e = i = 0;

        // Check that str is a valid base b number.
        // Don't use RegExp, so alphabet can contain special characters.
        for (len = str.length; i < len; i++) {
          if (alphabet.indexOf(c = str.charAt(i)) < 0) {
            if (c == '.') {

              // If '.' is not the first character and it has not be found before.
              if (i > e) {
                e = len;
                continue;
              }
            } else if (!caseChanged) {

              // Allow e.g. hexadecimal 'FF' as well as 'ff'.
              if (str == str.toUpperCase() && (str = str.toLowerCase()) ||
                  str == str.toLowerCase() && (str = str.toUpperCase())) {
                caseChanged = true;
                i = -1;
                e = 0;
                continue;
              }
            }

            return parseNumeric(x, String(v), isNum, b);
          }
        }

        // Prevent later check for length on converted number.
        isNum = false;
        str = convertBase(str, b, 10, x.s);

        // Decimal point?
        if ((e = str.indexOf('.')) > -1) str = str.replace('.', '');
        else e = str.length;
      }

      // Determine leading zeros.
      for (i = 0; str.charCodeAt(i) === 48; i++);

      // Determine trailing zeros.
      for (len = str.length; str.charCodeAt(--len) === 48;);

      if (str = str.slice(i, ++len)) {
        len -= i;

        // '[BigNumber Error] Number primitive has more than 15 significant digits: {n}'
        if (isNum && BigNumber.DEBUG &&
          len > 15 && (v > MAX_SAFE_INTEGER || v !== mathfloor(v))) {
            throw Error
             (tooManyDigits + (x.s * v));
        }

         // Overflow?
        if ((e = e - i - 1) > MAX_EXP) {

          // Infinity.
          x.c = x.e = null;

        // Underflow?
        } else if (e < MIN_EXP) {

          // Zero.
          x.c = [x.e = 0];
        } else {
          x.e = e;
          x.c = [];

          // Transform base

          // e is the base 10 exponent.
          // i is where to slice str to get the first element of the coefficient array.
          i = (e + 1) % LOG_BASE;
          if (e < 0) i += LOG_BASE;  // i < 1

          if (i < len) {
            if (i) x.c.push(+str.slice(0, i));

            for (len -= LOG_BASE; i < len;) {
              x.c.push(+str.slice(i, i += LOG_BASE));
            }

            i = LOG_BASE - (str = str.slice(i)).length;
          } else {
            i -= len;
          }

          for (; i--; str += '0');
          x.c.push(+str);
        }
      } else {

        // Zero.
        x.c = [x.e = 0];
      }
    }


    // CONSTRUCTOR PROPERTIES


    BigNumber.clone = clone;

    BigNumber.ROUND_UP = 0;
    BigNumber.ROUND_DOWN = 1;
    BigNumber.ROUND_CEIL = 2;
    BigNumber.ROUND_FLOOR = 3;
    BigNumber.ROUND_HALF_UP = 4;
    BigNumber.ROUND_HALF_DOWN = 5;
    BigNumber.ROUND_HALF_EVEN = 6;
    BigNumber.ROUND_HALF_CEIL = 7;
    BigNumber.ROUND_HALF_FLOOR = 8;
    BigNumber.EUCLID = 9;


    /*
     * Configure infrequently-changing library-wide settings.
     *
     * Accept an object with the following optional properties (if the value of a property is
     * a number, it must be an integer within the inclusive range stated):
     *
     *   DECIMAL_PLACES   {number}           0 to MAX
     *   ROUNDING_MODE    {number}           0 to 8
     *   EXPONENTIAL_AT   {number|number[]}  -MAX to MAX  or  [-MAX to 0, 0 to MAX]
     *   RANGE            {number|number[]}  -MAX to MAX (not zero)  or  [-MAX to -1, 1 to MAX]
     *   CRYPTO           {boolean}          true or false
     *   MODULO_MODE      {number}           0 to 9
     *   POW_PRECISION       {number}           0 to MAX
     *   ALPHABET         {string}           A string of two or more unique characters which does
     *                                       not contain '.'.
     *   FORMAT           {object}           An object with some of the following properties:
     *     prefix                 {string}
     *     groupSize              {number}
     *     secondaryGroupSize     {number}
     *     groupSeparator         {string}
     *     decimalSeparator       {string}
     *     fractionGroupSize      {number}
     *     fractionGroupSeparator {string}
     *     suffix                 {string}
     *
     * (The values assigned to the above FORMAT object properties are not checked for validity.)
     *
     * E.g.
     * BigNumber.config({ DECIMAL_PLACES : 20, ROUNDING_MODE : 4 })
     *
     * Ignore properties/parameters set to null or undefined, except for ALPHABET.
     *
     * Return an object with the properties current values.
     */
    BigNumber.config = BigNumber.set = function (obj) {
      var p, v;

      if (obj != null) {

        if (typeof obj == 'object') {

          // DECIMAL_PLACES {number} Integer, 0 to MAX inclusive.
          // '[BigNumber Error] DECIMAL_PLACES {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'DECIMAL_PLACES')) {
            v = obj[p];
            intCheck(v, 0, MAX, p);
            DECIMAL_PLACES = v;
          }

          // ROUNDING_MODE {number} Integer, 0 to 8 inclusive.
          // '[BigNumber Error] ROUNDING_MODE {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'ROUNDING_MODE')) {
            v = obj[p];
            intCheck(v, 0, 8, p);
            ROUNDING_MODE = v;
          }

          // EXPONENTIAL_AT {number|number[]}
          // Integer, -MAX to MAX inclusive or
          // [integer -MAX to 0 inclusive, 0 to MAX inclusive].
          // '[BigNumber Error] EXPONENTIAL_AT {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'EXPONENTIAL_AT')) {
            v = obj[p];
            if (v && v.pop) {
              intCheck(v[0], -MAX, 0, p);
              intCheck(v[1], 0, MAX, p);
              TO_EXP_NEG = v[0];
              TO_EXP_POS = v[1];
            } else {
              intCheck(v, -MAX, MAX, p);
              TO_EXP_NEG = -(TO_EXP_POS = v < 0 ? -v : v);
            }
          }

          // RANGE {number|number[]} Non-zero integer, -MAX to MAX inclusive or
          // [integer -MAX to -1 inclusive, integer 1 to MAX inclusive].
          // '[BigNumber Error] RANGE {not a primitive number|not an integer|out of range|cannot be zero}: {v}'
          if (obj.hasOwnProperty(p = 'RANGE')) {
            v = obj[p];
            if (v && v.pop) {
              intCheck(v[0], -MAX, -1, p);
              intCheck(v[1], 1, MAX, p);
              MIN_EXP = v[0];
              MAX_EXP = v[1];
            } else {
              intCheck(v, -MAX, MAX, p);
              if (v) {
                MIN_EXP = -(MAX_EXP = v < 0 ? -v : v);
              } else {
                throw Error
                 (bignumberError + p + ' cannot be zero: ' + v);
              }
            }
          }

          // CRYPTO {boolean} true or false.
          // '[BigNumber Error] CRYPTO not true or false: {v}'
          // '[BigNumber Error] crypto unavailable'
          if (obj.hasOwnProperty(p = 'CRYPTO')) {
            v = obj[p];
            if (v === !!v) {
              if (v) {
                if (typeof crypto != 'undefined' && crypto &&
                 (crypto.getRandomValues || crypto.randomBytes)) {
                  CRYPTO = v;
                } else {
                  CRYPTO = !v;
                  throw Error
                   (bignumberError + 'crypto unavailable');
                }
              } else {
                CRYPTO = v;
              }
            } else {
              throw Error
               (bignumberError + p + ' not true or false: ' + v);
            }
          }

          // MODULO_MODE {number} Integer, 0 to 9 inclusive.
          // '[BigNumber Error] MODULO_MODE {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'MODULO_MODE')) {
            v = obj[p];
            intCheck(v, 0, 9, p);
            MODULO_MODE = v;
          }

          // POW_PRECISION {number} Integer, 0 to MAX inclusive.
          // '[BigNumber Error] POW_PRECISION {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'POW_PRECISION')) {
            v = obj[p];
            intCheck(v, 0, MAX, p);
            POW_PRECISION = v;
          }

          // FORMAT {object}
          // '[BigNumber Error] FORMAT not an object: {v}'
          if (obj.hasOwnProperty(p = 'FORMAT')) {
            v = obj[p];
            if (typeof v == 'object') FORMAT = v;
            else throw Error
             (bignumberError + p + ' not an object: ' + v);
          }

          // ALPHABET {string}
          // '[BigNumber Error] ALPHABET invalid: {v}'
          if (obj.hasOwnProperty(p = 'ALPHABET')) {
            v = obj[p];

            // Disallow if less than two characters,
            // or if it contains '+', '-', '.', whitespace, or a repeated character.
            if (typeof v == 'string' && !/^.?$|[+\-.\s]|(.).*\1/.test(v)) {
              ALPHABET = v;
            } else {
              throw Error
               (bignumberError + p + ' invalid: ' + v);
            }
          }

        } else {

          // '[BigNumber Error] Object expected: {v}'
          throw Error
           (bignumberError + 'Object expected: ' + obj);
        }
      }

      return {
        DECIMAL_PLACES: DECIMAL_PLACES,
        ROUNDING_MODE: ROUNDING_MODE,
        EXPONENTIAL_AT: [TO_EXP_NEG, TO_EXP_POS],
        RANGE: [MIN_EXP, MAX_EXP],
        CRYPTO: CRYPTO,
        MODULO_MODE: MODULO_MODE,
        POW_PRECISION: POW_PRECISION,
        FORMAT: FORMAT,
        ALPHABET: ALPHABET
      };
    };


    /*
     * Return true if v is a BigNumber instance, otherwise return false.
     *
     * If BigNumber.DEBUG is true, throw if a BigNumber instance is not well-formed.
     *
     * v {any}
     *
     * '[BigNumber Error] Invalid BigNumber: {v}'
     */
    BigNumber.isBigNumber = function (v) {
      if (!v || v._isBigNumber !== true) return false;
      if (!BigNumber.DEBUG) return true;

      var i, n,
        c = v.c,
        e = v.e,
        s = v.s;

      out: if ({}.toString.call(c) == '[object Array]') {

        if ((s === 1 || s === -1) && e >= -MAX && e <= MAX && e === mathfloor(e)) {

          // If the first element is zero, the BigNumber value must be zero.
          if (c[0] === 0) {
            if (e === 0 && c.length === 1) return true;
            break out;
          }

          // Calculate number of digits that c[0] should have, based on the exponent.
          i = (e + 1) % LOG_BASE;
          if (i < 1) i += LOG_BASE;

          // Calculate number of digits of c[0].
          //if (Math.ceil(Math.log(c[0] + 1) / Math.LN10) == i) {
          if (String(c[0]).length == i) {

            for (i = 0; i < c.length; i++) {
              n = c[i];
              if (n < 0 || n >= BASE || n !== mathfloor(n)) break out;
            }

            // Last element cannot be zero, unless it is the only element.
            if (n !== 0) return true;
          }
        }

      // Infinity/NaN
      } else if (c === null && e === null && (s === null || s === 1 || s === -1)) {
        return true;
      }

      throw Error
        (bignumberError + 'Invalid BigNumber: ' + v);
    };


    /*
     * Return a new BigNumber whose value is the maximum of the arguments.
     *
     * arguments {number|string|BigNumber}
     */
    BigNumber.maximum = BigNumber.max = function () {
      return maxOrMin(arguments, P.lt);
    };


    /*
     * Return a new BigNumber whose value is the minimum of the arguments.
     *
     * arguments {number|string|BigNumber}
     */
    BigNumber.minimum = BigNumber.min = function () {
      return maxOrMin(arguments, P.gt);
    };


    /*
     * Return a new BigNumber with a random value equal to or greater than 0 and less than 1,
     * and with dp, or DECIMAL_PLACES if dp is omitted, decimal places (or less if trailing
     * zeros are produced).
     *
     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp}'
     * '[BigNumber Error] crypto unavailable'
     */
    BigNumber.random = (function () {
      var pow2_53 = 0x20000000000000;

      // Return a 53 bit integer n, where 0 <= n < 9007199254740992.
      // Check if Math.random() produces more than 32 bits of randomness.
      // If it does, assume at least 53 bits are produced, otherwise assume at least 30 bits.
      // 0x40000000 is 2^30, 0x800000 is 2^23, 0x1fffff is 2^21 - 1.
      var random53bitInt = (Math.random() * pow2_53) & 0x1fffff
       ? function () { return mathfloor(Math.random() * pow2_53); }
       : function () { return ((Math.random() * 0x40000000 | 0) * 0x800000) +
         (Math.random() * 0x800000 | 0); };

      return function (dp) {
        var a, b, e, k, v,
          i = 0,
          c = [],
          rand = new BigNumber(ONE);

        if (dp == null) dp = DECIMAL_PLACES;
        else intCheck(dp, 0, MAX);

        k = mathceil(dp / LOG_BASE);

        if (CRYPTO) {

          // Browsers supporting crypto.getRandomValues.
          if (crypto.getRandomValues) {

            a = crypto.getRandomValues(new Uint32Array(k *= 2));

            for (; i < k;) {

              // 53 bits:
              // ((Math.pow(2, 32) - 1) * Math.pow(2, 21)).toString(2)
              // 11111 11111111 11111111 11111111 11100000 00000000 00000000
              // ((Math.pow(2, 32) - 1) >>> 11).toString(2)
              //                                     11111 11111111 11111111
              // 0x20000 is 2^21.
              v = a[i] * 0x20000 + (a[i + 1] >>> 11);

              // Rejection sampling:
              // 0 <= v < 9007199254740992
              // Probability that v >= 9e15, is
              // 7199254740992 / 9007199254740992 ~= 0.0008, i.e. 1 in 1251
              if (v >= 9e15) {
                b = crypto.getRandomValues(new Uint32Array(2));
                a[i] = b[0];
                a[i + 1] = b[1];
              } else {

                // 0 <= v <= 8999999999999999
                // 0 <= (v % 1e14) <= 99999999999999
                c.push(v % 1e14);
                i += 2;
              }
            }
            i = k / 2;

          // Node.js supporting crypto.randomBytes.
          } else if (crypto.randomBytes) {

            // buffer
            a = crypto.randomBytes(k *= 7);

            for (; i < k;) {

              // 0x1000000000000 is 2^48, 0x10000000000 is 2^40
              // 0x100000000 is 2^32, 0x1000000 is 2^24
              // 11111 11111111 11111111 11111111 11111111 11111111 11111111
              // 0 <= v < 9007199254740992
              v = ((a[i] & 31) * 0x1000000000000) + (a[i + 1] * 0x10000000000) +
                 (a[i + 2] * 0x100000000) + (a[i + 3] * 0x1000000) +
                 (a[i + 4] << 16) + (a[i + 5] << 8) + a[i + 6];

              if (v >= 9e15) {
                crypto.randomBytes(7).copy(a, i);
              } else {

                // 0 <= (v % 1e14) <= 99999999999999
                c.push(v % 1e14);
                i += 7;
              }
            }
            i = k / 7;
          } else {
            CRYPTO = false;
            throw Error
             (bignumberError + 'crypto unavailable');
          }
        }

        // Use Math.random.
        if (!CRYPTO) {

          for (; i < k;) {
            v = random53bitInt();
            if (v < 9e15) c[i++] = v % 1e14;
          }
        }

        k = c[--i];
        dp %= LOG_BASE;

        // Convert trailing digits to zeros according to dp.
        if (k && dp) {
          v = POWS_TEN[LOG_BASE - dp];
          c[i] = mathfloor(k / v) * v;
        }

        // Remove trailing elements which are zero.
        for (; c[i] === 0; c.pop(), i--);

        // Zero?
        if (i < 0) {
          c = [e = 0];
        } else {

          // Remove leading elements which are zero and adjust exponent accordingly.
          for (e = -1 ; c[0] === 0; c.splice(0, 1), e -= LOG_BASE);

          // Count the digits of the first element of c to determine leading zeros, and...
          for (i = 1, v = c[0]; v >= 10; v /= 10, i++);

          // adjust the exponent accordingly.
          if (i < LOG_BASE) e -= LOG_BASE - i;
        }

        rand.e = e;
        rand.c = c;
        return rand;
      };
    })();


    /*
     * Return a BigNumber whose value is the sum of the arguments.
     *
     * arguments {number|string|BigNumber}
     */
    BigNumber.sum = function () {
      var i = 1,
        args = arguments,
        sum = new BigNumber(args[0]);
      for (; i < args.length;) sum = sum.plus(args[i++]);
      return sum;
    };


    // PRIVATE FUNCTIONS


    // Called by BigNumber and BigNumber.prototype.toString.
    convertBase = (function () {
      var decimal = '0123456789';

      /*
       * Convert string of baseIn to an array of numbers of baseOut.
       * Eg. toBaseOut('255', 10, 16) returns [15, 15].
       * Eg. toBaseOut('ff', 16, 10) returns [2, 5, 5].
       */
      function toBaseOut(str, baseIn, baseOut, alphabet) {
        var j,
          arr = [0],
          arrL,
          i = 0,
          len = str.length;

        for (; i < len;) {
          for (arrL = arr.length; arrL--; arr[arrL] *= baseIn);

          arr[0] += alphabet.indexOf(str.charAt(i++));

          for (j = 0; j < arr.length; j++) {

            if (arr[j] > baseOut - 1) {
              if (arr[j + 1] == null) arr[j + 1] = 0;
              arr[j + 1] += arr[j] / baseOut | 0;
              arr[j] %= baseOut;
            }
          }
        }

        return arr.reverse();
      }

      // Convert a numeric string of baseIn to a numeric string of baseOut.
      // If the caller is toString, we are converting from base 10 to baseOut.
      // If the caller is BigNumber, we are converting from baseIn to base 10.
      return function (str, baseIn, baseOut, sign, callerIsToString) {
        var alphabet, d, e, k, r, x, xc, y,
          i = str.indexOf('.'),
          dp = DECIMAL_PLACES,
          rm = ROUNDING_MODE;

        // Non-integer.
        if (i >= 0) {
          k = POW_PRECISION;

          // Unlimited precision.
          POW_PRECISION = 0;
          str = str.replace('.', '');
          y = new BigNumber(baseIn);
          x = y.pow(str.length - i);
          POW_PRECISION = k;

          // Convert str as if an integer, then restore the fraction part by dividing the
          // result by its base raised to a power.

          y.c = toBaseOut(toFixedPoint(coeffToString(x.c), x.e, '0'),
           10, baseOut, decimal);
          y.e = y.c.length;
        }

        // Convert the number as integer.

        xc = toBaseOut(str, baseIn, baseOut, callerIsToString
         ? (alphabet = ALPHABET, decimal)
         : (alphabet = decimal, ALPHABET));

        // xc now represents str as an integer and converted to baseOut. e is the exponent.
        e = k = xc.length;

        // Remove trailing zeros.
        for (; xc[--k] == 0; xc.pop());

        // Zero?
        if (!xc[0]) return alphabet.charAt(0);

        // Does str represent an integer? If so, no need for the division.
        if (i < 0) {
          --e;
        } else {
          x.c = xc;
          x.e = e;

          // The sign is needed for correct rounding.
          x.s = sign;
          x = div(x, y, dp, rm, baseOut);
          xc = x.c;
          r = x.r;
          e = x.e;
        }

        // xc now represents str converted to baseOut.

        // THe index of the rounding digit.
        d = e + dp + 1;

        // The rounding digit: the digit to the right of the digit that may be rounded up.
        i = xc[d];

        // Look at the rounding digits and mode to determine whether to round up.

        k = baseOut / 2;
        r = r || d < 0 || xc[d + 1] != null;

        r = rm < 4 ? (i != null || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2))
              : i > k || i == k &&(rm == 4 || r || rm == 6 && xc[d - 1] & 1 ||
               rm == (x.s < 0 ? 8 : 7));

        // If the index of the rounding digit is not greater than zero, or xc represents
        // zero, then the result of the base conversion is zero or, if rounding up, a value
        // such as 0.00001.
        if (d < 1 || !xc[0]) {

          // 1^-dp or 0
          str = r ? toFixedPoint(alphabet.charAt(1), -dp, alphabet.charAt(0)) : alphabet.charAt(0);
        } else {

          // Truncate xc to the required number of decimal places.
          xc.length = d;

          // Round up?
          if (r) {

            // Rounding up may mean the previous digit has to be rounded up and so on.
            for (--baseOut; ++xc[--d] > baseOut;) {
              xc[d] = 0;

              if (!d) {
                ++e;
                xc = [1].concat(xc);
              }
            }
          }

          // Determine trailing zeros.
          for (k = xc.length; !xc[--k];);

          // E.g. [4, 11, 15] becomes 4bf.
          for (i = 0, str = ''; i <= k; str += alphabet.charAt(xc[i++]));

          // Add leading zeros, decimal point and trailing zeros as required.
          str = toFixedPoint(str, e, alphabet.charAt(0));
        }

        // The caller will add the sign.
        return str;
      };
    })();


    // Perform division in the specified base. Called by div and convertBase.
    div = (function () {

      // Assume non-zero x and k.
      function multiply(x, k, base) {
        var m, temp, xlo, xhi,
          carry = 0,
          i = x.length,
          klo = k % SQRT_BASE,
          khi = k / SQRT_BASE | 0;

        for (x = x.slice(); i--;) {
          xlo = x[i] % SQRT_BASE;
          xhi = x[i] / SQRT_BASE | 0;
          m = khi * xlo + xhi * klo;
          temp = klo * xlo + ((m % SQRT_BASE) * SQRT_BASE) + carry;
          carry = (temp / base | 0) + (m / SQRT_BASE | 0) + khi * xhi;
          x[i] = temp % base;
        }

        if (carry) x = [carry].concat(x);

        return x;
      }

      function compare(a, b, aL, bL) {
        var i, cmp;

        if (aL != bL) {
          cmp = aL > bL ? 1 : -1;
        } else {

          for (i = cmp = 0; i < aL; i++) {

            if (a[i] != b[i]) {
              cmp = a[i] > b[i] ? 1 : -1;
              break;
            }
          }
        }

        return cmp;
      }

      function subtract(a, b, aL, base) {
        var i = 0;

        // Subtract b from a.
        for (; aL--;) {
          a[aL] -= i;
          i = a[aL] < b[aL] ? 1 : 0;
          a[aL] = i * base + a[aL] - b[aL];
        }

        // Remove leading zeros.
        for (; !a[0] && a.length > 1; a.splice(0, 1));
      }

      // x: dividend, y: divisor.
      return function (x, y, dp, rm, base) {
        var cmp, e, i, more, n, prod, prodL, q, qc, rem, remL, rem0, xi, xL, yc0,
          yL, yz,
          s = x.s == y.s ? 1 : -1,
          xc = x.c,
          yc = y.c;

        // Either NaN, Infinity or 0?
        if (!xc || !xc[0] || !yc || !yc[0]) {

          return new BigNumber(

           // Return NaN if either NaN, or both Infinity or 0.
           !x.s || !y.s || (xc ? yc && xc[0] == yc[0] : !yc) ? NaN :

            // Return ±0 if x is ±0 or y is ±Infinity, or return ±Infinity as y is ±0.
            xc && xc[0] == 0 || !yc ? s * 0 : s / 0
         );
        }

        q = new BigNumber(s);
        qc = q.c = [];
        e = x.e - y.e;
        s = dp + e + 1;

        if (!base) {
          base = BASE;
          e = bitFloor(x.e / LOG_BASE) - bitFloor(y.e / LOG_BASE);
          s = s / LOG_BASE | 0;
        }

        // Result exponent may be one less then the current value of e.
        // The coefficients of the BigNumbers from convertBase may have trailing zeros.
        for (i = 0; yc[i] == (xc[i] || 0); i++);

        if (yc[i] > (xc[i] || 0)) e--;

        if (s < 0) {
          qc.push(1);
          more = true;
        } else {
          xL = xc.length;
          yL = yc.length;
          i = 0;
          s += 2;

          // Normalise xc and yc so highest order digit of yc is >= base / 2.

          n = mathfloor(base / (yc[0] + 1));

          // Not necessary, but to handle odd bases where yc[0] == (base / 2) - 1.
          // if (n > 1 || n++ == 1 && yc[0] < base / 2) {
          if (n > 1) {
            yc = multiply(yc, n, base);
            xc = multiply(xc, n, base);
            yL = yc.length;
            xL = xc.length;
          }

          xi = yL;
          rem = xc.slice(0, yL);
          remL = rem.length;

          // Add zeros to make remainder as long as divisor.
          for (; remL < yL; rem[remL++] = 0);
          yz = yc.slice();
          yz = [0].concat(yz);
          yc0 = yc[0];
          if (yc[1] >= base / 2) yc0++;
          // Not necessary, but to prevent trial digit n > base, when using base 3.
          // else if (base == 3 && yc0 == 1) yc0 = 1 + 1e-15;

          do {
            n = 0;

            // Compare divisor and remainder.
            cmp = compare(yc, rem, yL, remL);

            // If divisor < remainder.
            if (cmp < 0) {

              // Calculate trial digit, n.

              rem0 = rem[0];
              if (yL != remL) rem0 = rem0 * base + (rem[1] || 0);

              // n is how many times the divisor goes into the current remainder.
              n = mathfloor(rem0 / yc0);

              //  Algorithm:
              //  product = divisor multiplied by trial digit (n).
              //  Compare product and remainder.
              //  If product is greater than remainder:
              //    Subtract divisor from product, decrement trial digit.
              //  Subtract product from remainder.
              //  If product was less than remainder at the last compare:
              //    Compare new remainder and divisor.
              //    If remainder is greater than divisor:
              //      Subtract divisor from remainder, increment trial digit.

              if (n > 1) {

                // n may be > base only when base is 3.
                if (n >= base) n = base - 1;

                // product = divisor * trial digit.
                prod = multiply(yc, n, base);
                prodL = prod.length;
                remL = rem.length;

                // Compare product and remainder.
                // If product > remainder then trial digit n too high.
                // n is 1 too high about 5% of the time, and is not known to have
                // ever been more than 1 too high.
                while (compare(prod, rem, prodL, remL) == 1) {
                  n--;

                  // Subtract divisor from product.
                  subtract(prod, yL < prodL ? yz : yc, prodL, base);
                  prodL = prod.length;
                  cmp = 1;
                }
              } else {

                // n is 0 or 1, cmp is -1.
                // If n is 0, there is no need to compare yc and rem again below,
                // so change cmp to 1 to avoid it.
                // If n is 1, leave cmp as -1, so yc and rem are compared again.
                if (n == 0) {

                  // divisor < remainder, so n must be at least 1.
                  cmp = n = 1;
                }

                // product = divisor
                prod = yc.slice();
                prodL = prod.length;
              }

              if (prodL < remL) prod = [0].concat(prod);

              // Subtract product from remainder.
              subtract(rem, prod, remL, base);
              remL = rem.length;

               // If product was < remainder.
              if (cmp == -1) {

                // Compare divisor and new remainder.
                // If divisor < new remainder, subtract divisor from remainder.
                // Trial digit n too low.
                // n is 1 too low about 5% of the time, and very rarely 2 too low.
                while (compare(yc, rem, yL, remL) < 1) {
                  n++;

                  // Subtract divisor from remainder.
                  subtract(rem, yL < remL ? yz : yc, remL, base);
                  remL = rem.length;
                }
              }
            } else if (cmp === 0) {
              n++;
              rem = [0];
            } // else cmp === 1 and n will be 0

            // Add the next digit, n, to the result array.
            qc[i++] = n;

            // Update the remainder.
            if (rem[0]) {
              rem[remL++] = xc[xi] || 0;
            } else {
              rem = [xc[xi]];
              remL = 1;
            }
          } while ((xi++ < xL || rem[0] != null) && s--);

          more = rem[0] != null;

          // Leading zero?
          if (!qc[0]) qc.splice(0, 1);
        }

        if (base == BASE) {

          // To calculate q.e, first get the number of digits of qc[0].
          for (i = 1, s = qc[0]; s >= 10; s /= 10, i++);

          round(q, dp + (q.e = i + e * LOG_BASE - 1) + 1, rm, more);

        // Caller is convertBase.
        } else {
          q.e = e;
          q.r = +more;
        }

        return q;
      };
    })();


    /*
     * Return a string representing the value of BigNumber n in fixed-point or exponential
     * notation rounded to the specified decimal places or significant digits.
     *
     * n: a BigNumber.
     * i: the index of the last digit required (i.e. the digit that may be rounded up).
     * rm: the rounding mode.
     * id: 1 (toExponential) or 2 (toPrecision).
     */
    function format(n, i, rm, id) {
      var c0, e, ne, len, str;

      if (rm == null) rm = ROUNDING_MODE;
      else intCheck(rm, 0, 8);

      if (!n.c) return n.toString();

      c0 = n.c[0];
      ne = n.e;

      if (i == null) {
        str = coeffToString(n.c);
        str = id == 1 || id == 2 && (ne <= TO_EXP_NEG || ne >= TO_EXP_POS)
         ? toExponential(str, ne)
         : toFixedPoint(str, ne, '0');
      } else {
        n = round(new BigNumber(n), i, rm);

        // n.e may have changed if the value was rounded up.
        e = n.e;

        str = coeffToString(n.c);
        len = str.length;

        // toPrecision returns exponential notation if the number of significant digits
        // specified is less than the number of digits necessary to represent the integer
        // part of the value in fixed-point notation.

        // Exponential notation.
        if (id == 1 || id == 2 && (i <= e || e <= TO_EXP_NEG)) {

          // Append zeros?
          for (; len < i; str += '0', len++);
          str = toExponential(str, e);

        // Fixed-point notation.
        } else {
          i -= ne;
          str = toFixedPoint(str, e, '0');

          // Append zeros?
          if (e + 1 > len) {
            if (--i > 0) for (str += '.'; i--; str += '0');
          } else {
            i += e - len;
            if (i > 0) {
              if (e + 1 == len) str += '.';
              for (; i--; str += '0');
            }
          }
        }
      }

      return n.s < 0 && c0 ? '-' + str : str;
    }


    // Handle BigNumber.max and BigNumber.min.
    function maxOrMin(args, method) {
      var n,
        i = 1,
        m = new BigNumber(args[0]);

      for (; i < args.length; i++) {
        n = new BigNumber(args[i]);

        // If any number is NaN, return NaN.
        if (!n.s) {
          m = n;
          break;
        } else if (method.call(m, n)) {
          m = n;
        }
      }

      return m;
    }


    /*
     * Strip trailing zeros, calculate base 10 exponent and check against MIN_EXP and MAX_EXP.
     * Called by minus, plus and times.
     */
    function normalise(n, c, e) {
      var i = 1,
        j = c.length;

       // Remove trailing zeros.
      for (; !c[--j]; c.pop());

      // Calculate the base 10 exponent. First get the number of digits of c[0].
      for (j = c[0]; j >= 10; j /= 10, i++);

      // Overflow?
      if ((e = i + e * LOG_BASE - 1) > MAX_EXP) {

        // Infinity.
        n.c = n.e = null;

      // Underflow?
      } else if (e < MIN_EXP) {

        // Zero.
        n.c = [n.e = 0];
      } else {
        n.e = e;
        n.c = c;
      }

      return n;
    }


    // Handle values that fail the validity test in BigNumber.
    parseNumeric = (function () {
      var basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i,
        dotAfter = /^([^.]+)\.$/,
        dotBefore = /^\.([^.]+)$/,
        isInfinityOrNaN = /^-?(Infinity|NaN)$/,
        whitespaceOrPlus = /^\s*\+(?=[\w.])|^\s+|\s+$/g;

      return function (x, str, isNum, b) {
        var base,
          s = isNum ? str : str.replace(whitespaceOrPlus, '');

        // No exception on ±Infinity or NaN.
        if (isInfinityOrNaN.test(s)) {
          x.s = isNaN(s) ? null : s < 0 ? -1 : 1;
        } else {
          if (!isNum) {

            // basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i
            s = s.replace(basePrefix, function (m, p1, p2) {
              base = (p2 = p2.toLowerCase()) == 'x' ? 16 : p2 == 'b' ? 2 : 8;
              return !b || b == base ? p1 : m;
            });

            if (b) {
              base = b;

              // E.g. '1.' to '1', '.1' to '0.1'
              s = s.replace(dotAfter, '$1').replace(dotBefore, '0.$1');
            }

            if (str != s) return new BigNumber(s, base);
          }

          // '[BigNumber Error] Not a number: {n}'
          // '[BigNumber Error] Not a base {b} number: {n}'
          if (BigNumber.DEBUG) {
            throw Error
              (bignumberError + 'Not a' + (b ? ' base ' + b : '') + ' number: ' + str);
          }

          // NaN
          x.s = null;
        }

        x.c = x.e = null;
      }
    })();


    /*
     * Round x to sd significant digits using rounding mode rm. Check for over/under-flow.
     * If r is truthy, it is known that there are more digits after the rounding digit.
     */
    function round(x, sd, rm, r) {
      var d, i, j, k, n, ni, rd,
        xc = x.c,
        pows10 = POWS_TEN;

      // if x is not Infinity or NaN...
      if (xc) {

        // rd is the rounding digit, i.e. the digit after the digit that may be rounded up.
        // n is a base 1e14 number, the value of the element of array x.c containing rd.
        // ni is the index of n within x.c.
        // d is the number of digits of n.
        // i is the index of rd within n including leading zeros.
        // j is the actual index of rd within n (if < 0, rd is a leading zero).
        out: {

          // Get the number of digits of the first element of xc.
          for (d = 1, k = xc[0]; k >= 10; k /= 10, d++);
          i = sd - d;

          // If the rounding digit is in the first element of xc...
          if (i < 0) {
            i += LOG_BASE;
            j = sd;
            n = xc[ni = 0];

            // Get the rounding digit at index j of n.
            rd = n / pows10[d - j - 1] % 10 | 0;
          } else {
            ni = mathceil((i + 1) / LOG_BASE);

            if (ni >= xc.length) {

              if (r) {

                // Needed by sqrt.
                for (; xc.length <= ni; xc.push(0));
                n = rd = 0;
                d = 1;
                i %= LOG_BASE;
                j = i - LOG_BASE + 1;
              } else {
                break out;
              }
            } else {
              n = k = xc[ni];

              // Get the number of digits of n.
              for (d = 1; k >= 10; k /= 10, d++);

              // Get the index of rd within n.
              i %= LOG_BASE;

              // Get the index of rd within n, adjusted for leading zeros.
              // The number of leading zeros of n is given by LOG_BASE - d.
              j = i - LOG_BASE + d;

              // Get the rounding digit at index j of n.
              rd = j < 0 ? 0 : n / pows10[d - j - 1] % 10 | 0;
            }
          }

          r = r || sd < 0 ||

          // Are there any non-zero digits after the rounding digit?
          // The expression  n % pows10[d - j - 1]  returns all digits of n to the right
          // of the digit at j, e.g. if n is 908714 and j is 2, the expression gives 714.
           xc[ni + 1] != null || (j < 0 ? n : n % pows10[d - j - 1]);

          r = rm < 4
           ? (rd || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2))
           : rd > 5 || rd == 5 && (rm == 4 || r || rm == 6 &&

            // Check whether the digit to the left of the rounding digit is odd.
            ((i > 0 ? j > 0 ? n / pows10[d - j] : 0 : xc[ni - 1]) % 10) & 1 ||
             rm == (x.s < 0 ? 8 : 7));

          if (sd < 1 || !xc[0]) {
            xc.length = 0;

            if (r) {

              // Convert sd to decimal places.
              sd -= x.e + 1;

              // 1, 0.1, 0.01, 0.001, 0.0001 etc.
              xc[0] = pows10[(LOG_BASE - sd % LOG_BASE) % LOG_BASE];
              x.e = -sd || 0;
            } else {

              // Zero.
              xc[0] = x.e = 0;
            }

            return x;
          }

          // Remove excess digits.
          if (i == 0) {
            xc.length = ni;
            k = 1;
            ni--;
          } else {
            xc.length = ni + 1;
            k = pows10[LOG_BASE - i];

            // E.g. 56700 becomes 56000 if 7 is the rounding digit.
            // j > 0 means i > number of leading zeros of n.
            xc[ni] = j > 0 ? mathfloor(n / pows10[d - j] % pows10[j]) * k : 0;
          }

          // Round up?
          if (r) {

            for (; ;) {

              // If the digit to be rounded up is in the first element of xc...
              if (ni == 0) {

                // i will be the length of xc[0] before k is added.
                for (i = 1, j = xc[0]; j >= 10; j /= 10, i++);
                j = xc[0] += k;
                for (k = 1; j >= 10; j /= 10, k++);

                // if i != k the length has increased.
                if (i != k) {
                  x.e++;
                  if (xc[0] == BASE) xc[0] = 1;
                }

                break;
              } else {
                xc[ni] += k;
                if (xc[ni] != BASE) break;
                xc[ni--] = 0;
                k = 1;
              }
            }
          }

          // Remove trailing zeros.
          for (i = xc.length; xc[--i] === 0; xc.pop());
        }

        // Overflow? Infinity.
        if (x.e > MAX_EXP) {
          x.c = x.e = null;

        // Underflow? Zero.
        } else if (x.e < MIN_EXP) {
          x.c = [x.e = 0];
        }
      }

      return x;
    }


    function valueOf(n) {
      var str,
        e = n.e;

      if (e === null) return n.toString();

      str = coeffToString(n.c);

      str = e <= TO_EXP_NEG || e >= TO_EXP_POS
        ? toExponential(str, e)
        : toFixedPoint(str, e, '0');

      return n.s < 0 ? '-' + str : str;
    }


    // PROTOTYPE/INSTANCE METHODS


    /*
     * Return a new BigNumber whose value is the absolute value of this BigNumber.
     */
    P.absoluteValue = P.abs = function () {
      var x = new BigNumber(this);
      if (x.s < 0) x.s = 1;
      return x;
    };


    /*
     * Return
     *   1 if the value of this BigNumber is greater than the value of BigNumber(y, b),
     *   -1 if the value of this BigNumber is less than the value of BigNumber(y, b),
     *   0 if they have the same value,
     *   or null if the value of either is NaN.
     */
    P.comparedTo = function (y, b) {
      return compare(this, new BigNumber(y, b));
    };


    /*
     * If dp is undefined or null or true or false, return the number of decimal places of the
     * value of this BigNumber, or null if the value of this BigNumber is ±Infinity or NaN.
     *
     * Otherwise, if dp is a number, return a new BigNumber whose value is the value of this
     * BigNumber rounded to a maximum of dp decimal places using rounding mode rm, or
     * ROUNDING_MODE if rm is omitted.
     *
     * [dp] {number} Decimal places: integer, 0 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
     */
    P.decimalPlaces = P.dp = function (dp, rm) {
      var c, n, v,
        x = this;

      if (dp != null) {
        intCheck(dp, 0, MAX);
        if (rm == null) rm = ROUNDING_MODE;
        else intCheck(rm, 0, 8);

        return round(new BigNumber(x), dp + x.e + 1, rm);
      }

      if (!(c = x.c)) return null;
      n = ((v = c.length - 1) - bitFloor(this.e / LOG_BASE)) * LOG_BASE;

      // Subtract the number of trailing zeros of the last number.
      if (v = c[v]) for (; v % 10 == 0; v /= 10, n--);
      if (n < 0) n = 0;

      return n;
    };


    /*
     *  n / 0 = I
     *  n / N = N
     *  n / I = 0
     *  0 / n = 0
     *  0 / 0 = N
     *  0 / N = N
     *  0 / I = 0
     *  N / n = N
     *  N / 0 = N
     *  N / N = N
     *  N / I = N
     *  I / n = I
     *  I / 0 = I
     *  I / N = N
     *  I / I = N
     *
     * Return a new BigNumber whose value is the value of this BigNumber divided by the value of
     * BigNumber(y, b), rounded according to DECIMAL_PLACES and ROUNDING_MODE.
     */
    P.dividedBy = P.div = function (y, b) {
      return div(this, new BigNumber(y, b), DECIMAL_PLACES, ROUNDING_MODE);
    };


    /*
     * Return a new BigNumber whose value is the integer part of dividing the value of this
     * BigNumber by the value of BigNumber(y, b).
     */
    P.dividedToIntegerBy = P.idiv = function (y, b) {
      return div(this, new BigNumber(y, b), 0, 1);
    };


    /*
     * Return a BigNumber whose value is the value of this BigNumber exponentiated by n.
     *
     * If m is present, return the result modulo m.
     * If n is negative round according to DECIMAL_PLACES and ROUNDING_MODE.
     * If POW_PRECISION is non-zero and m is not present, round to POW_PRECISION using ROUNDING_MODE.
     *
     * The modular power operation works efficiently when x, n, and m are integers, otherwise it
     * is equivalent to calculating x.exponentiatedBy(n).modulo(m) with a POW_PRECISION of 0.
     *
     * n {number|string|BigNumber} The exponent. An integer.
     * [m] {number|string|BigNumber} The modulus.
     *
     * '[BigNumber Error] Exponent not an integer: {n}'
     */
    P.exponentiatedBy = P.pow = function (n, m) {
      var half, isModExp, i, k, more, nIsBig, nIsNeg, nIsOdd, y,
        x = this;

      n = new BigNumber(n);

      // Allow NaN and ±Infinity, but not other non-integers.
      if (n.c && !n.isInteger()) {
        throw Error
          (bignumberError + 'Exponent not an integer: ' + valueOf(n));
      }

      if (m != null) m = new BigNumber(m);

      // Exponent of MAX_SAFE_INTEGER is 15.
      nIsBig = n.e > 14;

      // If x is NaN, ±Infinity, ±0 or ±1, or n is ±Infinity, NaN or ±0.
      if (!x.c || !x.c[0] || x.c[0] == 1 && !x.e && x.c.length == 1 || !n.c || !n.c[0]) {

        // The sign of the result of pow when x is negative depends on the evenness of n.
        // If +n overflows to ±Infinity, the evenness of n would be not be known.
        y = new BigNumber(Math.pow(+valueOf(x), nIsBig ? 2 - isOdd(n) : +valueOf(n)));
        return m ? y.mod(m) : y;
      }

      nIsNeg = n.s < 0;

      if (m) {

        // x % m returns NaN if abs(m) is zero, or m is NaN.
        if (m.c ? !m.c[0] : !m.s) return new BigNumber(NaN);

        isModExp = !nIsNeg && x.isInteger() && m.isInteger();

        if (isModExp) x = x.mod(m);

      // Overflow to ±Infinity: >=2**1e10 or >=1.0000024**1e15.
      // Underflow to ±0: <=0.79**1e10 or <=0.9999975**1e15.
      } else if (n.e > 9 && (x.e > 0 || x.e < -1 || (x.e == 0
        // [1, 240000000]
        ? x.c[0] > 1 || nIsBig && x.c[1] >= 24e7
        // [80000000000000]  [99999750000000]
        : x.c[0] < 8e13 || nIsBig && x.c[0] <= 9999975e7))) {

        // If x is negative and n is odd, k = -0, else k = 0.
        k = x.s < 0 && isOdd(n) ? -0 : 0;

        // If x >= 1, k = ±Infinity.
        if (x.e > -1) k = 1 / k;

        // If n is negative return ±0, else return ±Infinity.
        return new BigNumber(nIsNeg ? 1 / k : k);

      } else if (POW_PRECISION) {

        // Truncating each coefficient array to a length of k after each multiplication
        // equates to truncating significant digits to POW_PRECISION + [28, 41],
        // i.e. there will be a minimum of 28 guard digits retained.
        k = mathceil(POW_PRECISION / LOG_BASE + 2);
      }

      if (nIsBig) {
        half = new BigNumber(0.5);
        if (nIsNeg) n.s = 1;
        nIsOdd = isOdd(n);
      } else {
        i = Math.abs(+valueOf(n));
        nIsOdd = i % 2;
      }

      y = new BigNumber(ONE);

      // Performs 54 loop iterations for n of 9007199254740991.
      for (; ;) {

        if (nIsOdd) {
          y = y.times(x);
          if (!y.c) break;

          if (k) {
            if (y.c.length > k) y.c.length = k;
          } else if (isModExp) {
            y = y.mod(m);    //y = y.minus(div(y, m, 0, MODULO_MODE).times(m));
          }
        }

        if (i) {
          i = mathfloor(i / 2);
          if (i === 0) break;
          nIsOdd = i % 2;
        } else {
          n = n.times(half);
          round(n, n.e + 1, 1);

          if (n.e > 14) {
            nIsOdd = isOdd(n);
          } else {
            i = +valueOf(n);
            if (i === 0) break;
            nIsOdd = i % 2;
          }
        }

        x = x.times(x);

        if (k) {
          if (x.c && x.c.length > k) x.c.length = k;
        } else if (isModExp) {
          x = x.mod(m);    //x = x.minus(div(x, m, 0, MODULO_MODE).times(m));
        }
      }

      if (isModExp) return y;
      if (nIsNeg) y = ONE.div(y);

      return m ? y.mod(m) : k ? round(y, POW_PRECISION, ROUNDING_MODE, more) : y;
    };


    /*
     * Return a new BigNumber whose value is the value of this BigNumber rounded to an integer
     * using rounding mode rm, or ROUNDING_MODE if rm is omitted.
     *
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {rm}'
     */
    P.integerValue = function (rm) {
      var n = new BigNumber(this);
      if (rm == null) rm = ROUNDING_MODE;
      else intCheck(rm, 0, 8);
      return round(n, n.e + 1, rm);
    };


    /*
     * Return true if the value of this BigNumber is equal to the value of BigNumber(y, b),
     * otherwise return false.
     */
    P.isEqualTo = P.eq = function (y, b) {
      return compare(this, new BigNumber(y, b)) === 0;
    };


    /*
     * Return true if the value of this BigNumber is a finite number, otherwise return false.
     */
    P.isFinite = function () {
      return !!this.c;
    };


    /*
     * Return true if the value of this BigNumber is greater than the value of BigNumber(y, b),
     * otherwise return false.
     */
    P.isGreaterThan = P.gt = function (y, b) {
      return compare(this, new BigNumber(y, b)) > 0;
    };


    /*
     * Return true if the value of this BigNumber is greater than or equal to the value of
     * BigNumber(y, b), otherwise return false.
     */
    P.isGreaterThanOrEqualTo = P.gte = function (y, b) {
      return (b = compare(this, new BigNumber(y, b))) === 1 || b === 0;

    };


    /*
     * Return true if the value of this BigNumber is an integer, otherwise return false.
     */
    P.isInteger = function () {
      return !!this.c && bitFloor(this.e / LOG_BASE) > this.c.length - 2;
    };


    /*
     * Return true if the value of this BigNumber is less than the value of BigNumber(y, b),
     * otherwise return false.
     */
    P.isLessThan = P.lt = function (y, b) {
      return compare(this, new BigNumber(y, b)) < 0;
    };


    /*
     * Return true if the value of this BigNumber is less than or equal to the value of
     * BigNumber(y, b), otherwise return false.
     */
    P.isLessThanOrEqualTo = P.lte = function (y, b) {
      return (b = compare(this, new BigNumber(y, b))) === -1 || b === 0;
    };


    /*
     * Return true if the value of this BigNumber is NaN, otherwise return false.
     */
    P.isNaN = function () {
      return !this.s;
    };


    /*
     * Return true if the value of this BigNumber is negative, otherwise return false.
     */
    P.isNegative = function () {
      return this.s < 0;
    };


    /*
     * Return true if the value of this BigNumber is positive, otherwise return false.
     */
    P.isPositive = function () {
      return this.s > 0;
    };


    /*
     * Return true if the value of this BigNumber is 0 or -0, otherwise return false.
     */
    P.isZero = function () {
      return !!this.c && this.c[0] == 0;
    };


    /*
     *  n - 0 = n
     *  n - N = N
     *  n - I = -I
     *  0 - n = -n
     *  0 - 0 = 0
     *  0 - N = N
     *  0 - I = -I
     *  N - n = N
     *  N - 0 = N
     *  N - N = N
     *  N - I = N
     *  I - n = I
     *  I - 0 = I
     *  I - N = N
     *  I - I = N
     *
     * Return a new BigNumber whose value is the value of this BigNumber minus the value of
     * BigNumber(y, b).
     */
    P.minus = function (y, b) {
      var i, j, t, xLTy,
        x = this,
        a = x.s;

      y = new BigNumber(y, b);
      b = y.s;

      // Either NaN?
      if (!a || !b) return new BigNumber(NaN);

      // Signs differ?
      if (a != b) {
        y.s = -b;
        return x.plus(y);
      }

      var xe = x.e / LOG_BASE,
        ye = y.e / LOG_BASE,
        xc = x.c,
        yc = y.c;

      if (!xe || !ye) {

        // Either Infinity?
        if (!xc || !yc) return xc ? (y.s = -b, y) : new BigNumber(yc ? x : NaN);

        // Either zero?
        if (!xc[0] || !yc[0]) {

          // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
          return yc[0] ? (y.s = -b, y) : new BigNumber(xc[0] ? x :

           // IEEE 754 (2008) 6.3: n - n = -0 when rounding to -Infinity
           ROUNDING_MODE == 3 ? -0 : 0);
        }
      }

      xe = bitFloor(xe);
      ye = bitFloor(ye);
      xc = xc.slice();

      // Determine which is the bigger number.
      if (a = xe - ye) {

        if (xLTy = a < 0) {
          a = -a;
          t = xc;
        } else {
          ye = xe;
          t = yc;
        }

        t.reverse();

        // Prepend zeros to equalise exponents.
        for (b = a; b--; t.push(0));
        t.reverse();
      } else {

        // Exponents equal. Check digit by digit.
        j = (xLTy = (a = xc.length) < (b = yc.length)) ? a : b;

        for (a = b = 0; b < j; b++) {

          if (xc[b] != yc[b]) {
            xLTy = xc[b] < yc[b];
            break;
          }
        }
      }

      // x < y? Point xc to the array of the bigger number.
      if (xLTy) t = xc, xc = yc, yc = t, y.s = -y.s;

      b = (j = yc.length) - (i = xc.length);

      // Append zeros to xc if shorter.
      // No need to add zeros to yc if shorter as subtract only needs to start at yc.length.
      if (b > 0) for (; b--; xc[i++] = 0);
      b = BASE - 1;

      // Subtract yc from xc.
      for (; j > a;) {

        if (xc[--j] < yc[j]) {
          for (i = j; i && !xc[--i]; xc[i] = b);
          --xc[i];
          xc[j] += BASE;
        }

        xc[j] -= yc[j];
      }

      // Remove leading zeros and adjust exponent accordingly.
      for (; xc[0] == 0; xc.splice(0, 1), --ye);

      // Zero?
      if (!xc[0]) {

        // Following IEEE 754 (2008) 6.3,
        // n - n = +0  but  n - n = -0  when rounding towards -Infinity.
        y.s = ROUNDING_MODE == 3 ? -1 : 1;
        y.c = [y.e = 0];
        return y;
      }

      // No need to check for Infinity as +x - +y != Infinity && -x - -y != Infinity
      // for finite x and y.
      return normalise(y, xc, ye);
    };


    /*
     *   n % 0 =  N
     *   n % N =  N
     *   n % I =  n
     *   0 % n =  0
     *  -0 % n = -0
     *   0 % 0 =  N
     *   0 % N =  N
     *   0 % I =  0
     *   N % n =  N
     *   N % 0 =  N
     *   N % N =  N
     *   N % I =  N
     *   I % n =  N
     *   I % 0 =  N
     *   I % N =  N
     *   I % I =  N
     *
     * Return a new BigNumber whose value is the value of this BigNumber modulo the value of
     * BigNumber(y, b). The result depends on the value of MODULO_MODE.
     */
    P.modulo = P.mod = function (y, b) {
      var q, s,
        x = this;

      y = new BigNumber(y, b);

      // Return NaN if x is Infinity or NaN, or y is NaN or zero.
      if (!x.c || !y.s || y.c && !y.c[0]) {
        return new BigNumber(NaN);

      // Return x if y is Infinity or x is zero.
      } else if (!y.c || x.c && !x.c[0]) {
        return new BigNumber(x);
      }

      if (MODULO_MODE == 9) {

        // Euclidian division: q = sign(y) * floor(x / abs(y))
        // r = x - qy    where  0 <= r < abs(y)
        s = y.s;
        y.s = 1;
        q = div(x, y, 0, 3);
        y.s = s;
        q.s *= s;
      } else {
        q = div(x, y, 0, MODULO_MODE);
      }

      y = x.minus(q.times(y));

      // To match JavaScript %, ensure sign of zero is sign of dividend.
      if (!y.c[0] && MODULO_MODE == 1) y.s = x.s;

      return y;
    };


    /*
     *  n * 0 = 0
     *  n * N = N
     *  n * I = I
     *  0 * n = 0
     *  0 * 0 = 0
     *  0 * N = N
     *  0 * I = N
     *  N * n = N
     *  N * 0 = N
     *  N * N = N
     *  N * I = N
     *  I * n = I
     *  I * 0 = N
     *  I * N = N
     *  I * I = I
     *
     * Return a new BigNumber whose value is the value of this BigNumber multiplied by the value
     * of BigNumber(y, b).
     */
    P.multipliedBy = P.times = function (y, b) {
      var c, e, i, j, k, m, xcL, xlo, xhi, ycL, ylo, yhi, zc,
        base, sqrtBase,
        x = this,
        xc = x.c,
        yc = (y = new BigNumber(y, b)).c;

      // Either NaN, ±Infinity or ±0?
      if (!xc || !yc || !xc[0] || !yc[0]) {

        // Return NaN if either is NaN, or one is 0 and the other is Infinity.
        if (!x.s || !y.s || xc && !xc[0] && !yc || yc && !yc[0] && !xc) {
          y.c = y.e = y.s = null;
        } else {
          y.s *= x.s;

          // Return ±Infinity if either is ±Infinity.
          if (!xc || !yc) {
            y.c = y.e = null;

          // Return ±0 if either is ±0.
          } else {
            y.c = [0];
            y.e = 0;
          }
        }

        return y;
      }

      e = bitFloor(x.e / LOG_BASE) + bitFloor(y.e / LOG_BASE);
      y.s *= x.s;
      xcL = xc.length;
      ycL = yc.length;

      // Ensure xc points to longer array and xcL to its length.
      if (xcL < ycL) zc = xc, xc = yc, yc = zc, i = xcL, xcL = ycL, ycL = i;

      // Initialise the result array with zeros.
      for (i = xcL + ycL, zc = []; i--; zc.push(0));

      base = BASE;
      sqrtBase = SQRT_BASE;

      for (i = ycL; --i >= 0;) {
        c = 0;
        ylo = yc[i] % sqrtBase;
        yhi = yc[i] / sqrtBase | 0;

        for (k = xcL, j = i + k; j > i;) {
          xlo = xc[--k] % sqrtBase;
          xhi = xc[k] / sqrtBase | 0;
          m = yhi * xlo + xhi * ylo;
          xlo = ylo * xlo + ((m % sqrtBase) * sqrtBase) + zc[j] + c;
          c = (xlo / base | 0) + (m / sqrtBase | 0) + yhi * xhi;
          zc[j--] = xlo % base;
        }

        zc[j] = c;
      }

      if (c) {
        ++e;
      } else {
        zc.splice(0, 1);
      }

      return normalise(y, zc, e);
    };


    /*
     * Return a new BigNumber whose value is the value of this BigNumber negated,
     * i.e. multiplied by -1.
     */
    P.negated = function () {
      var x = new BigNumber(this);
      x.s = -x.s || null;
      return x;
    };


    /*
     *  n + 0 = n
     *  n + N = N
     *  n + I = I
     *  0 + n = n
     *  0 + 0 = 0
     *  0 + N = N
     *  0 + I = I
     *  N + n = N
     *  N + 0 = N
     *  N + N = N
     *  N + I = N
     *  I + n = I
     *  I + 0 = I
     *  I + N = N
     *  I + I = I
     *
     * Return a new BigNumber whose value is the value of this BigNumber plus the value of
     * BigNumber(y, b).
     */
    P.plus = function (y, b) {
      var t,
        x = this,
        a = x.s;

      y = new BigNumber(y, b);
      b = y.s;

      // Either NaN?
      if (!a || !b) return new BigNumber(NaN);

      // Signs differ?
       if (a != b) {
        y.s = -b;
        return x.minus(y);
      }

      var xe = x.e / LOG_BASE,
        ye = y.e / LOG_BASE,
        xc = x.c,
        yc = y.c;

      if (!xe || !ye) {

        // Return ±Infinity if either ±Infinity.
        if (!xc || !yc) return new BigNumber(a / 0);

        // Either zero?
        // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
        if (!xc[0] || !yc[0]) return yc[0] ? y : new BigNumber(xc[0] ? x : a * 0);
      }

      xe = bitFloor(xe);
      ye = bitFloor(ye);
      xc = xc.slice();

      // Prepend zeros to equalise exponents. Faster to use reverse then do unshifts.
      if (a = xe - ye) {
        if (a > 0) {
          ye = xe;
          t = yc;
        } else {
          a = -a;
          t = xc;
        }

        t.reverse();
        for (; a--; t.push(0));
        t.reverse();
      }

      a = xc.length;
      b = yc.length;

      // Point xc to the longer array, and b to the shorter length.
      if (a - b < 0) t = yc, yc = xc, xc = t, b = a;

      // Only start adding at yc.length - 1 as the further digits of xc can be ignored.
      for (a = 0; b;) {
        a = (xc[--b] = xc[b] + yc[b] + a) / BASE | 0;
        xc[b] = BASE === xc[b] ? 0 : xc[b] % BASE;
      }

      if (a) {
        xc = [a].concat(xc);
        ++ye;
      }

      // No need to check for zero, as +x + +y != 0 && -x + -y != 0
      // ye = MAX_EXP + 1 possible
      return normalise(y, xc, ye);
    };


    /*
     * If sd is undefined or null or true or false, return the number of significant digits of
     * the value of this BigNumber, or null if the value of this BigNumber is ±Infinity or NaN.
     * If sd is true include integer-part trailing zeros in the count.
     *
     * Otherwise, if sd is a number, return a new BigNumber whose value is the value of this
     * BigNumber rounded to a maximum of sd significant digits using rounding mode rm, or
     * ROUNDING_MODE if rm is omitted.
     *
     * sd {number|boolean} number: significant digits: integer, 1 to MAX inclusive.
     *                     boolean: whether to count integer-part trailing zeros: true or false.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {sd|rm}'
     */
    P.precision = P.sd = function (sd, rm) {
      var c, n, v,
        x = this;

      if (sd != null && sd !== !!sd) {
        intCheck(sd, 1, MAX);
        if (rm == null) rm = ROUNDING_MODE;
        else intCheck(rm, 0, 8);

        return round(new BigNumber(x), sd, rm);
      }

      if (!(c = x.c)) return null;
      v = c.length - 1;
      n = v * LOG_BASE + 1;

      if (v = c[v]) {

        // Subtract the number of trailing zeros of the last element.
        for (; v % 10 == 0; v /= 10, n--);

        // Add the number of digits of the first element.
        for (v = c[0]; v >= 10; v /= 10, n++);
      }

      if (sd && x.e + 1 > n) n = x.e + 1;

      return n;
    };


    /*
     * Return a new BigNumber whose value is the value of this BigNumber shifted by k places
     * (powers of 10). Shift to the right if n > 0, and to the left if n < 0.
     *
     * k {number} Integer, -MAX_SAFE_INTEGER to MAX_SAFE_INTEGER inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {k}'
     */
    P.shiftedBy = function (k) {
      intCheck(k, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER);
      return this.times('1e' + k);
    };


    /*
     *  sqrt(-n) =  N
     *  sqrt(N) =  N
     *  sqrt(-I) =  N
     *  sqrt(I) =  I
     *  sqrt(0) =  0
     *  sqrt(-0) = -0
     *
     * Return a new BigNumber whose value is the square root of the value of this BigNumber,
     * rounded according to DECIMAL_PLACES and ROUNDING_MODE.
     */
    P.squareRoot = P.sqrt = function () {
      var m, n, r, rep, t,
        x = this,
        c = x.c,
        s = x.s,
        e = x.e,
        dp = DECIMAL_PLACES + 4,
        half = new BigNumber('0.5');

      // Negative/NaN/Infinity/zero?
      if (s !== 1 || !c || !c[0]) {
        return new BigNumber(!s || s < 0 && (!c || c[0]) ? NaN : c ? x : 1 / 0);
      }

      // Initial estimate.
      s = Math.sqrt(+valueOf(x));

      // Math.sqrt underflow/overflow?
      // Pass x to Math.sqrt as integer, then adjust the exponent of the result.
      if (s == 0 || s == 1 / 0) {
        n = coeffToString(c);
        if ((n.length + e) % 2 == 0) n += '0';
        s = Math.sqrt(+n);
        e = bitFloor((e + 1) / 2) - (e < 0 || e % 2);

        if (s == 1 / 0) {
          n = '5e' + e;
        } else {
          n = s.toExponential();
          n = n.slice(0, n.indexOf('e') + 1) + e;
        }

        r = new BigNumber(n);
      } else {
        r = new BigNumber(s + '');
      }

      // Check for zero.
      // r could be zero if MIN_EXP is changed after the this value was created.
      // This would cause a division by zero (x/t) and hence Infinity below, which would cause
      // coeffToString to throw.
      if (r.c[0]) {
        e = r.e;
        s = e + dp;
        if (s < 3) s = 0;

        // Newton-Raphson iteration.
        for (; ;) {
          t = r;
          r = half.times(t.plus(div(x, t, dp, 1)));

          if (coeffToString(t.c).slice(0, s) === (n = coeffToString(r.c)).slice(0, s)) {

            // The exponent of r may here be one less than the final result exponent,
            // e.g 0.0009999 (e-4) --> 0.001 (e-3), so adjust s so the rounding digits
            // are indexed correctly.
            if (r.e < e) --s;
            n = n.slice(s - 3, s + 1);

            // The 4th rounding digit may be in error by -1 so if the 4 rounding digits
            // are 9999 or 4999 (i.e. approaching a rounding boundary) continue the
            // iteration.
            if (n == '9999' || !rep && n == '4999') {

              // On the first iteration only, check to see if rounding up gives the
              // exact result as the nines may infinitely repeat.
              if (!rep) {
                round(t, t.e + DECIMAL_PLACES + 2, 0);

                if (t.times(t).eq(x)) {
                  r = t;
                  break;
                }
              }

              dp += 4;
              s += 4;
              rep = 1;
            } else {

              // If rounding digits are null, 0{0,4} or 50{0,3}, check for exact
              // result. If not, then there are further digits and m will be truthy.
              if (!+n || !+n.slice(1) && n.charAt(0) == '5') {

                // Truncate to the first rounding digit.
                round(r, r.e + DECIMAL_PLACES + 2, 1);
                m = !r.times(r).eq(x);
              }

              break;
            }
          }
        }
      }

      return round(r, r.e + DECIMAL_PLACES + 1, ROUNDING_MODE, m);
    };


    /*
     * Return a string representing the value of this BigNumber in exponential notation and
     * rounded using ROUNDING_MODE to dp fixed decimal places.
     *
     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
     */
    P.toExponential = function (dp, rm) {
      if (dp != null) {
        intCheck(dp, 0, MAX);
        dp++;
      }
      return format(this, dp, rm, 1);
    };


    /*
     * Return a string representing the value of this BigNumber in fixed-point notation rounding
     * to dp fixed decimal places using rounding mode rm, or ROUNDING_MODE if rm is omitted.
     *
     * Note: as with JavaScript's number type, (-0).toFixed(0) is '0',
     * but e.g. (-0.00001).toFixed(0) is '-0'.
     *
     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
     */
    P.toFixed = function (dp, rm) {
      if (dp != null) {
        intCheck(dp, 0, MAX);
        dp = dp + this.e + 1;
      }
      return format(this, dp, rm);
    };


    /*
     * Return a string representing the value of this BigNumber in fixed-point notation rounded
     * using rm or ROUNDING_MODE to dp decimal places, and formatted according to the properties
     * of the format or FORMAT object (see BigNumber.set).
     *
     * The formatting object may contain some or all of the properties shown below.
     *
     * FORMAT = {
     *   prefix: '',
     *   groupSize: 3,
     *   secondaryGroupSize: 0,
     *   groupSeparator: ',',
     *   decimalSeparator: '.',
     *   fractionGroupSize: 0,
     *   fractionGroupSeparator: '\xA0',      // non-breaking space
     *   suffix: ''
     * };
     *
     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     * [format] {object} Formatting options. See FORMAT pbject above.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
     * '[BigNumber Error] Argument not an object: {format}'
     */
    P.toFormat = function (dp, rm, format) {
      var str,
        x = this;

      if (format == null) {
        if (dp != null && rm && typeof rm == 'object') {
          format = rm;
          rm = null;
        } else if (dp && typeof dp == 'object') {
          format = dp;
          dp = rm = null;
        } else {
          format = FORMAT;
        }
      } else if (typeof format != 'object') {
        throw Error
          (bignumberError + 'Argument not an object: ' + format);
      }

      str = x.toFixed(dp, rm);

      if (x.c) {
        var i,
          arr = str.split('.'),
          g1 = +format.groupSize,
          g2 = +format.secondaryGroupSize,
          groupSeparator = format.groupSeparator || '',
          intPart = arr[0],
          fractionPart = arr[1],
          isNeg = x.s < 0,
          intDigits = isNeg ? intPart.slice(1) : intPart,
          len = intDigits.length;

        if (g2) i = g1, g1 = g2, g2 = i, len -= i;

        if (g1 > 0 && len > 0) {
          i = len % g1 || g1;
          intPart = intDigits.substr(0, i);
          for (; i < len; i += g1) intPart += groupSeparator + intDigits.substr(i, g1);
          if (g2 > 0) intPart += groupSeparator + intDigits.slice(i);
          if (isNeg) intPart = '-' + intPart;
        }

        str = fractionPart
         ? intPart + (format.decimalSeparator || '') + ((g2 = +format.fractionGroupSize)
          ? fractionPart.replace(new RegExp('\\d{' + g2 + '}\\B', 'g'),
           '$&' + (format.fractionGroupSeparator || ''))
          : fractionPart)
         : intPart;
      }

      return (format.prefix || '') + str + (format.suffix || '');
    };


    /*
     * Return an array of two BigNumbers representing the value of this BigNumber as a simple
     * fraction with an integer numerator and an integer denominator.
     * The denominator will be a positive non-zero value less than or equal to the specified
     * maximum denominator. If a maximum denominator is not specified, the denominator will be
     * the lowest value necessary to represent the number exactly.
     *
     * [md] {number|string|BigNumber} Integer >= 1, or Infinity. The maximum denominator.
     *
     * '[BigNumber Error] Argument {not an integer|out of range} : {md}'
     */
    P.toFraction = function (md) {
      var d, d0, d1, d2, e, exp, n, n0, n1, q, r, s,
        x = this,
        xc = x.c;

      if (md != null) {
        n = new BigNumber(md);

        // Throw if md is less than one or is not an integer, unless it is Infinity.
        if (!n.isInteger() && (n.c || n.s !== 1) || n.lt(ONE)) {
          throw Error
            (bignumberError + 'Argument ' +
              (n.isInteger() ? 'out of range: ' : 'not an integer: ') + valueOf(n));
        }
      }

      if (!xc) return new BigNumber(x);

      d = new BigNumber(ONE);
      n1 = d0 = new BigNumber(ONE);
      d1 = n0 = new BigNumber(ONE);
      s = coeffToString(xc);

      // Determine initial denominator.
      // d is a power of 10 and the minimum max denominator that specifies the value exactly.
      e = d.e = s.length - x.e - 1;
      d.c[0] = POWS_TEN[(exp = e % LOG_BASE) < 0 ? LOG_BASE + exp : exp];
      md = !md || n.comparedTo(d) > 0 ? (e > 0 ? d : n1) : n;

      exp = MAX_EXP;
      MAX_EXP = 1 / 0;
      n = new BigNumber(s);

      // n0 = d1 = 0
      n0.c[0] = 0;

      for (; ;)  {
        q = div(n, d, 0, 1);
        d2 = d0.plus(q.times(d1));
        if (d2.comparedTo(md) == 1) break;
        d0 = d1;
        d1 = d2;
        n1 = n0.plus(q.times(d2 = n1));
        n0 = d2;
        d = n.minus(q.times(d2 = d));
        n = d2;
      }

      d2 = div(md.minus(d0), d1, 0, 1);
      n0 = n0.plus(d2.times(n1));
      d0 = d0.plus(d2.times(d1));
      n0.s = n1.s = x.s;
      e = e * 2;

      // Determine which fraction is closer to x, n0/d0 or n1/d1
      r = div(n1, d1, e, ROUNDING_MODE).minus(x).abs().comparedTo(
          div(n0, d0, e, ROUNDING_MODE).minus(x).abs()) < 1 ? [n1, d1] : [n0, d0];

      MAX_EXP = exp;

      return r;
    };


    /*
     * Return the value of this BigNumber converted to a number primitive.
     */
    P.toNumber = function () {
      return +valueOf(this);
    };


    /*
     * Return a string representing the value of this BigNumber rounded to sd significant digits
     * using rounding mode rm or ROUNDING_MODE. If sd is less than the number of digits
     * necessary to represent the integer part of the value in fixed-point notation, then use
     * exponential notation.
     *
     * [sd] {number} Significant digits. Integer, 1 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {sd|rm}'
     */
    P.toPrecision = function (sd, rm) {
      if (sd != null) intCheck(sd, 1, MAX);
      return format(this, sd, rm, 2);
    };


    /*
     * Return a string representing the value of this BigNumber in base b, or base 10 if b is
     * omitted. If a base is specified, including base 10, round according to DECIMAL_PLACES and
     * ROUNDING_MODE. If a base is not specified, and this BigNumber has a positive exponent
     * that is equal to or greater than TO_EXP_POS, or a negative exponent equal to or less than
     * TO_EXP_NEG, return exponential notation.
     *
     * [b] {number} Integer, 2 to ALPHABET.length inclusive.
     *
     * '[BigNumber Error] Base {not a primitive number|not an integer|out of range}: {b}'
     */
    P.toString = function (b) {
      var str,
        n = this,
        s = n.s,
        e = n.e;

      // Infinity or NaN?
      if (e === null) {
        if (s) {
          str = 'Infinity';
          if (s < 0) str = '-' + str;
        } else {
          str = 'NaN';
        }
      } else {
        if (b == null) {
          str = e <= TO_EXP_NEG || e >= TO_EXP_POS
           ? toExponential(coeffToString(n.c), e)
           : toFixedPoint(coeffToString(n.c), e, '0');
        } else if (b === 10) {
          n = round(new BigNumber(n), DECIMAL_PLACES + e + 1, ROUNDING_MODE);
          str = toFixedPoint(coeffToString(n.c), n.e, '0');
        } else {
          intCheck(b, 2, ALPHABET.length, 'Base');
          str = convertBase(toFixedPoint(coeffToString(n.c), e, '0'), 10, b, s, true);
        }

        if (s < 0 && n.c[0]) str = '-' + str;
      }

      return str;
    };


    /*
     * Return as toString, but do not accept a base argument, and include the minus sign for
     * negative zero.
     */
    P.valueOf = P.toJSON = function () {
      return valueOf(this);
    };


    P._isBigNumber = true;

    if (configObject != null) BigNumber.set(configObject);

    return BigNumber;
  }


  // PRIVATE HELPER FUNCTIONS

  // These functions don't need access to variables,
  // e.g. DECIMAL_PLACES, in the scope of the `clone` function above.


  function bitFloor(n) {
    var i = n | 0;
    return n > 0 || n === i ? i : i - 1;
  }


  // Return a coefficient array as a string of base 10 digits.
  function coeffToString(a) {
    var s, z,
      i = 1,
      j = a.length,
      r = a[0] + '';

    for (; i < j;) {
      s = a[i++] + '';
      z = LOG_BASE - s.length;
      for (; z--; s = '0' + s);
      r += s;
    }

    // Determine trailing zeros.
    for (j = r.length; r.charCodeAt(--j) === 48;);

    return r.slice(0, j + 1 || 1);
  }


  // Compare the value of BigNumbers x and y.
  function compare(x, y) {
    var a, b,
      xc = x.c,
      yc = y.c,
      i = x.s,
      j = y.s,
      k = x.e,
      l = y.e;

    // Either NaN?
    if (!i || !j) return null;

    a = xc && !xc[0];
    b = yc && !yc[0];

    // Either zero?
    if (a || b) return a ? b ? 0 : -j : i;

    // Signs differ?
    if (i != j) return i;

    a = i < 0;
    b = k == l;

    // Either Infinity?
    if (!xc || !yc) return b ? 0 : !xc ^ a ? 1 : -1;

    // Compare exponents.
    if (!b) return k > l ^ a ? 1 : -1;

    j = (k = xc.length) < (l = yc.length) ? k : l;

    // Compare digit by digit.
    for (i = 0; i < j; i++) if (xc[i] != yc[i]) return xc[i] > yc[i] ^ a ? 1 : -1;

    // Compare lengths.
    return k == l ? 0 : k > l ^ a ? 1 : -1;
  }


  /*
   * Check that n is a primitive number, an integer, and in range, otherwise throw.
   */
  function intCheck(n, min, max, name) {
    if (n < min || n > max || n !== mathfloor(n)) {
      throw Error
       (bignumberError + (name || 'Argument') + (typeof n == 'number'
         ? n < min || n > max ? ' out of range: ' : ' not an integer: '
         : ' not a primitive number: ') + String(n));
    }
  }


  // Assumes finite n.
  function isOdd(n) {
    var k = n.c.length - 1;
    return bitFloor(n.e / LOG_BASE) == k && n.c[k] % 2 != 0;
  }


  function toExponential(str, e) {
    return (str.length > 1 ? str.charAt(0) + '.' + str.slice(1) : str) +
     (e < 0 ? 'e' : 'e+') + e;
  }


  function toFixedPoint(str, e, z) {
    var len, zs;

    // Negative exponent?
    if (e < 0) {

      // Prepend zeros.
      for (zs = z + '.'; ++e; zs += z);
      str = zs + str;

    // Positive exponent
    } else {
      len = str.length;

      // Append zeros.
      if (++e > len) {
        for (zs = z, e -= len; --e; zs += z);
        str += zs;
      } else if (e < len) {
        str = str.slice(0, e) + '.' + str.slice(e);
      }
    }

    return str;
  }


  // EXPORT


  BigNumber = clone();
  BigNumber['default'] = BigNumber.BigNumber = BigNumber;

  // AMD.
  if (typeof define == 'function' && define.amd) {
    define(function () { return BigNumber; });

  // Node.js and other environments that support module.exports.
  } else if (typeof module != 'undefined' && module.exports) {
    module.exports = BigNumber;

  // Browser.
  } else {
    if (!globalObject) {
      globalObject = typeof self != 'undefined' && self ? self : window;
    }

    globalObject.BigNumber = BigNumber;
  }
})(this);

},{}],21:[function(require,module,exports){
(function (module, exports) {
  'use strict';

  // Utils
  function assert (val, msg) {
    if (!val) throw new Error(msg || 'Assertion failed');
  }

  // Could use `inherits` module, but don't want to move from single file
  // architecture yet.
  function inherits (ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function () {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  }

  // BN

  function BN (number, base, endian) {
    if (BN.isBN(number)) {
      return number;
    }

    this.negative = 0;
    this.words = null;
    this.length = 0;

    // Reduction context
    this.red = null;

    if (number !== null) {
      if (base === 'le' || base === 'be') {
        endian = base;
        base = 10;
      }

      this._init(number || 0, base || 10, endian || 'be');
    }
  }
  if (typeof module === 'object') {
    module.exports = BN;
  } else {
    exports.BN = BN;
  }

  BN.BN = BN;
  BN.wordSize = 26;

  var Buffer;
  try {
    Buffer = require('buffer').Buffer;
  } catch (e) {
  }

  BN.isBN = function isBN (num) {
    if (num instanceof BN) {
      return true;
    }

    return num !== null && typeof num === 'object' &&
      num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
  };

  BN.max = function max (left, right) {
    if (left.cmp(right) > 0) return left;
    return right;
  };

  BN.min = function min (left, right) {
    if (left.cmp(right) < 0) return left;
    return right;
  };

  BN.prototype._init = function init (number, base, endian) {
    if (typeof number === 'number') {
      return this._initNumber(number, base, endian);
    }

    if (typeof number === 'object') {
      return this._initArray(number, base, endian);
    }

    if (base === 'hex') {
      base = 16;
    }
    assert(base === (base | 0) && base >= 2 && base <= 36);

    number = number.toString().replace(/\s+/g, '');
    var start = 0;
    if (number[0] === '-') {
      start++;
    }

    if (base === 16) {
      this._parseHex(number, start);
    } else {
      this._parseBase(number, base, start);
    }

    if (number[0] === '-') {
      this.negative = 1;
    }

    this.strip();

    if (endian !== 'le') return;

    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initNumber = function _initNumber (number, base, endian) {
    if (number < 0) {
      this.negative = 1;
      number = -number;
    }
    if (number < 0x4000000) {
      this.words = [ number & 0x3ffffff ];
      this.length = 1;
    } else if (number < 0x10000000000000) {
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff
      ];
      this.length = 2;
    } else {
      assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff,
        1
      ];
      this.length = 3;
    }

    if (endian !== 'le') return;

    // Reverse the bytes
    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initArray = function _initArray (number, base, endian) {
    // Perhaps a Uint8Array
    assert(typeof number.length === 'number');
    if (number.length <= 0) {
      this.words = [ 0 ];
      this.length = 1;
      return this;
    }

    this.length = Math.ceil(number.length / 3);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    var off = 0;
    if (endian === 'be') {
      for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
        w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    } else if (endian === 'le') {
      for (i = 0, j = 0; i < number.length; i += 3) {
        w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    }
    return this.strip();
  };

  function parseHex (str, start, end) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r <<= 4;

      // 'a' - 'f'
      if (c >= 49 && c <= 54) {
        r |= c - 49 + 0xa;

      // 'A' - 'F'
      } else if (c >= 17 && c <= 22) {
        r |= c - 17 + 0xa;

      // '0' - '9'
      } else {
        r |= c & 0xf;
      }
    }
    return r;
  }

  BN.prototype._parseHex = function _parseHex (number, start) {
    // Create possibly bigger array to ensure that it fits the number
    this.length = Math.ceil((number.length - start) / 6);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    // Scan 24-bit chunks and add them to the number
    var off = 0;
    for (i = number.length - 6, j = 0; i >= start; i -= 6) {
      w = parseHex(number, i, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      // NOTE: `0x3fffff` is intentional here, 26bits max shift + 24bit hex limb
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
      off += 24;
      if (off >= 26) {
        off -= 26;
        j++;
      }
    }
    if (i + 6 !== start) {
      w = parseHex(number, start, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
    }
    this.strip();
  };

  function parseBase (str, start, end, mul) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r *= mul;

      // 'a'
      if (c >= 49) {
        r += c - 49 + 0xa;

      // 'A'
      } else if (c >= 17) {
        r += c - 17 + 0xa;

      // '0' - '9'
      } else {
        r += c;
      }
    }
    return r;
  }

  BN.prototype._parseBase = function _parseBase (number, base, start) {
    // Initialize as zero
    this.words = [ 0 ];
    this.length = 1;

    // Find length of limb in base
    for (var limbLen = 0, limbPow = 1; limbPow <= 0x3ffffff; limbPow *= base) {
      limbLen++;
    }
    limbLen--;
    limbPow = (limbPow / base) | 0;

    var total = number.length - start;
    var mod = total % limbLen;
    var end = Math.min(total, total - mod) + start;

    var word = 0;
    for (var i = start; i < end; i += limbLen) {
      word = parseBase(number, i, i + limbLen, base);

      this.imuln(limbPow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }

    if (mod !== 0) {
      var pow = 1;
      word = parseBase(number, i, number.length, base);

      for (i = 0; i < mod; i++) {
        pow *= base;
      }

      this.imuln(pow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }
  };

  BN.prototype.copy = function copy (dest) {
    dest.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      dest.words[i] = this.words[i];
    }
    dest.length = this.length;
    dest.negative = this.negative;
    dest.red = this.red;
  };

  BN.prototype.clone = function clone () {
    var r = new BN(null);
    this.copy(r);
    return r;
  };

  BN.prototype._expand = function _expand (size) {
    while (this.length < size) {
      this.words[this.length++] = 0;
    }
    return this;
  };

  // Remove leading `0` from `this`
  BN.prototype.strip = function strip () {
    while (this.length > 1 && this.words[this.length - 1] === 0) {
      this.length--;
    }
    return this._normSign();
  };

  BN.prototype._normSign = function _normSign () {
    // -0 = 0
    if (this.length === 1 && this.words[0] === 0) {
      this.negative = 0;
    }
    return this;
  };

  BN.prototype.inspect = function inspect () {
    return (this.red ? '<BN-R: ' : '<BN: ') + this.toString(16) + '>';
  };

  /*

  var zeros = [];
  var groupSizes = [];
  var groupBases = [];

  var s = '';
  var i = -1;
  while (++i < BN.wordSize) {
    zeros[i] = s;
    s += '0';
  }
  groupSizes[0] = 0;
  groupSizes[1] = 0;
  groupBases[0] = 0;
  groupBases[1] = 0;
  var base = 2 - 1;
  while (++base < 36 + 1) {
    var groupSize = 0;
    var groupBase = 1;
    while (groupBase < (1 << BN.wordSize) / base) {
      groupBase *= base;
      groupSize += 1;
    }
    groupSizes[base] = groupSize;
    groupBases[base] = groupBase;
  }

  */

  var zeros = [
    '',
    '0',
    '00',
    '000',
    '0000',
    '00000',
    '000000',
    '0000000',
    '00000000',
    '000000000',
    '0000000000',
    '00000000000',
    '000000000000',
    '0000000000000',
    '00000000000000',
    '000000000000000',
    '0000000000000000',
    '00000000000000000',
    '000000000000000000',
    '0000000000000000000',
    '00000000000000000000',
    '000000000000000000000',
    '0000000000000000000000',
    '00000000000000000000000',
    '000000000000000000000000',
    '0000000000000000000000000'
  ];

  var groupSizes = [
    0, 0,
    25, 16, 12, 11, 10, 9, 8,
    8, 7, 7, 7, 7, 6, 6,
    6, 6, 6, 6, 6, 5, 5,
    5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5
  ];

  var groupBases = [
    0, 0,
    33554432, 43046721, 16777216, 48828125, 60466176, 40353607, 16777216,
    43046721, 10000000, 19487171, 35831808, 62748517, 7529536, 11390625,
    16777216, 24137569, 34012224, 47045881, 64000000, 4084101, 5153632,
    6436343, 7962624, 9765625, 11881376, 14348907, 17210368, 20511149,
    24300000, 28629151, 33554432, 39135393, 45435424, 52521875, 60466176
  ];

  BN.prototype.toString = function toString (base, padding) {
    base = base || 10;
    padding = padding | 0 || 1;

    var out;
    if (base === 16 || base === 'hex') {
      out = '';
      var off = 0;
      var carry = 0;
      for (var i = 0; i < this.length; i++) {
        var w = this.words[i];
        var word = (((w << off) | carry) & 0xffffff).toString(16);
        carry = (w >>> (24 - off)) & 0xffffff;
        if (carry !== 0 || i !== this.length - 1) {
          out = zeros[6 - word.length] + word + out;
        } else {
          out = word + out;
        }
        off += 2;
        if (off >= 26) {
          off -= 26;
          i--;
        }
      }
      if (carry !== 0) {
        out = carry.toString(16) + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    if (base === (base | 0) && base >= 2 && base <= 36) {
      // var groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
      var groupSize = groupSizes[base];
      // var groupBase = Math.pow(base, groupSize);
      var groupBase = groupBases[base];
      out = '';
      var c = this.clone();
      c.negative = 0;
      while (!c.isZero()) {
        var r = c.modn(groupBase).toString(base);
        c = c.idivn(groupBase);

        if (!c.isZero()) {
          out = zeros[groupSize - r.length] + r + out;
        } else {
          out = r + out;
        }
      }
      if (this.isZero()) {
        out = '0' + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    assert(false, 'Base should be between 2 and 36');
  };

  BN.prototype.toNumber = function toNumber () {
    var ret = this.words[0];
    if (this.length === 2) {
      ret += this.words[1] * 0x4000000;
    } else if (this.length === 3 && this.words[2] === 0x01) {
      // NOTE: at this stage it is known that the top bit is set
      ret += 0x10000000000000 + (this.words[1] * 0x4000000);
    } else if (this.length > 2) {
      assert(false, 'Number can only safely store up to 53 bits');
    }
    return (this.negative !== 0) ? -ret : ret;
  };

  BN.prototype.toJSON = function toJSON () {
    return this.toString(16);
  };

  BN.prototype.toBuffer = function toBuffer (endian, length) {
    assert(typeof Buffer !== 'undefined');
    return this.toArrayLike(Buffer, endian, length);
  };

  BN.prototype.toArray = function toArray (endian, length) {
    return this.toArrayLike(Array, endian, length);
  };

  BN.prototype.toArrayLike = function toArrayLike (ArrayType, endian, length) {
    var byteLength = this.byteLength();
    var reqLength = length || Math.max(1, byteLength);
    assert(byteLength <= reqLength, 'byte array longer than desired length');
    assert(reqLength > 0, 'Requested array length <= 0');

    this.strip();
    var littleEndian = endian === 'le';
    var res = new ArrayType(reqLength);

    var b, i;
    var q = this.clone();
    if (!littleEndian) {
      // Assume big-endian
      for (i = 0; i < reqLength - byteLength; i++) {
        res[i] = 0;
      }

      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[reqLength - i - 1] = b;
      }
    } else {
      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[i] = b;
      }

      for (; i < reqLength; i++) {
        res[i] = 0;
      }
    }

    return res;
  };

  if (Math.clz32) {
    BN.prototype._countBits = function _countBits (w) {
      return 32 - Math.clz32(w);
    };
  } else {
    BN.prototype._countBits = function _countBits (w) {
      var t = w;
      var r = 0;
      if (t >= 0x1000) {
        r += 13;
        t >>>= 13;
      }
      if (t >= 0x40) {
        r += 7;
        t >>>= 7;
      }
      if (t >= 0x8) {
        r += 4;
        t >>>= 4;
      }
      if (t >= 0x02) {
        r += 2;
        t >>>= 2;
      }
      return r + t;
    };
  }

  BN.prototype._zeroBits = function _zeroBits (w) {
    // Short-cut
    if (w === 0) return 26;

    var t = w;
    var r = 0;
    if ((t & 0x1fff) === 0) {
      r += 13;
      t >>>= 13;
    }
    if ((t & 0x7f) === 0) {
      r += 7;
      t >>>= 7;
    }
    if ((t & 0xf) === 0) {
      r += 4;
      t >>>= 4;
    }
    if ((t & 0x3) === 0) {
      r += 2;
      t >>>= 2;
    }
    if ((t & 0x1) === 0) {
      r++;
    }
    return r;
  };

  // Return number of used bits in a BN
  BN.prototype.bitLength = function bitLength () {
    var w = this.words[this.length - 1];
    var hi = this._countBits(w);
    return (this.length - 1) * 26 + hi;
  };

  function toBitArray (num) {
    var w = new Array(num.bitLength());

    for (var bit = 0; bit < w.length; bit++) {
      var off = (bit / 26) | 0;
      var wbit = bit % 26;

      w[bit] = (num.words[off] & (1 << wbit)) >>> wbit;
    }

    return w;
  }

  // Number of trailing zero bits
  BN.prototype.zeroBits = function zeroBits () {
    if (this.isZero()) return 0;

    var r = 0;
    for (var i = 0; i < this.length; i++) {
      var b = this._zeroBits(this.words[i]);
      r += b;
      if (b !== 26) break;
    }
    return r;
  };

  BN.prototype.byteLength = function byteLength () {
    return Math.ceil(this.bitLength() / 8);
  };

  BN.prototype.toTwos = function toTwos (width) {
    if (this.negative !== 0) {
      return this.abs().inotn(width).iaddn(1);
    }
    return this.clone();
  };

  BN.prototype.fromTwos = function fromTwos (width) {
    if (this.testn(width - 1)) {
      return this.notn(width).iaddn(1).ineg();
    }
    return this.clone();
  };

  BN.prototype.isNeg = function isNeg () {
    return this.negative !== 0;
  };

  // Return negative clone of `this`
  BN.prototype.neg = function neg () {
    return this.clone().ineg();
  };

  BN.prototype.ineg = function ineg () {
    if (!this.isZero()) {
      this.negative ^= 1;
    }

    return this;
  };

  // Or `num` with `this` in-place
  BN.prototype.iuor = function iuor (num) {
    while (this.length < num.length) {
      this.words[this.length++] = 0;
    }

    for (var i = 0; i < num.length; i++) {
      this.words[i] = this.words[i] | num.words[i];
    }

    return this.strip();
  };

  BN.prototype.ior = function ior (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuor(num);
  };

  // Or `num` with `this`
  BN.prototype.or = function or (num) {
    if (this.length > num.length) return this.clone().ior(num);
    return num.clone().ior(this);
  };

  BN.prototype.uor = function uor (num) {
    if (this.length > num.length) return this.clone().iuor(num);
    return num.clone().iuor(this);
  };

  // And `num` with `this` in-place
  BN.prototype.iuand = function iuand (num) {
    // b = min-length(num, this)
    var b;
    if (this.length > num.length) {
      b = num;
    } else {
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = this.words[i] & num.words[i];
    }

    this.length = b.length;

    return this.strip();
  };

  BN.prototype.iand = function iand (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuand(num);
  };

  // And `num` with `this`
  BN.prototype.and = function and (num) {
    if (this.length > num.length) return this.clone().iand(num);
    return num.clone().iand(this);
  };

  BN.prototype.uand = function uand (num) {
    if (this.length > num.length) return this.clone().iuand(num);
    return num.clone().iuand(this);
  };

  // Xor `num` with `this` in-place
  BN.prototype.iuxor = function iuxor (num) {
    // a.length > b.length
    var a;
    var b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = a.words[i] ^ b.words[i];
    }

    if (this !== a) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = a.length;

    return this.strip();
  };

  BN.prototype.ixor = function ixor (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuxor(num);
  };

  // Xor `num` with `this`
  BN.prototype.xor = function xor (num) {
    if (this.length > num.length) return this.clone().ixor(num);
    return num.clone().ixor(this);
  };

  BN.prototype.uxor = function uxor (num) {
    if (this.length > num.length) return this.clone().iuxor(num);
    return num.clone().iuxor(this);
  };

  // Not ``this`` with ``width`` bitwidth
  BN.prototype.inotn = function inotn (width) {
    assert(typeof width === 'number' && width >= 0);

    var bytesNeeded = Math.ceil(width / 26) | 0;
    var bitsLeft = width % 26;

    // Extend the buffer with leading zeroes
    this._expand(bytesNeeded);

    if (bitsLeft > 0) {
      bytesNeeded--;
    }

    // Handle complete words
    for (var i = 0; i < bytesNeeded; i++) {
      this.words[i] = ~this.words[i] & 0x3ffffff;
    }

    // Handle the residue
    if (bitsLeft > 0) {
      this.words[i] = ~this.words[i] & (0x3ffffff >> (26 - bitsLeft));
    }

    // And remove leading zeroes
    return this.strip();
  };

  BN.prototype.notn = function notn (width) {
    return this.clone().inotn(width);
  };

  // Set `bit` of `this`
  BN.prototype.setn = function setn (bit, val) {
    assert(typeof bit === 'number' && bit >= 0);

    var off = (bit / 26) | 0;
    var wbit = bit % 26;

    this._expand(off + 1);

    if (val) {
      this.words[off] = this.words[off] | (1 << wbit);
    } else {
      this.words[off] = this.words[off] & ~(1 << wbit);
    }

    return this.strip();
  };

  // Add `num` to `this` in-place
  BN.prototype.iadd = function iadd (num) {
    var r;

    // negative + positive
    if (this.negative !== 0 && num.negative === 0) {
      this.negative = 0;
      r = this.isub(num);
      this.negative ^= 1;
      return this._normSign();

    // positive + negative
    } else if (this.negative === 0 && num.negative !== 0) {
      num.negative = 0;
      r = this.isub(num);
      num.negative = 1;
      return r._normSign();
    }

    // a.length > b.length
    var a, b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }

    this.length = a.length;
    if (carry !== 0) {
      this.words[this.length] = carry;
      this.length++;
    // Copy the rest of the words
    } else if (a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    return this;
  };

  // Add `num` to `this`
  BN.prototype.add = function add (num) {
    var res;
    if (num.negative !== 0 && this.negative === 0) {
      num.negative = 0;
      res = this.sub(num);
      num.negative ^= 1;
      return res;
    } else if (num.negative === 0 && this.negative !== 0) {
      this.negative = 0;
      res = num.sub(this);
      this.negative = 1;
      return res;
    }

    if (this.length > num.length) return this.clone().iadd(num);

    return num.clone().iadd(this);
  };

  // Subtract `num` from `this` in-place
  BN.prototype.isub = function isub (num) {
    // this - (-num) = this + num
    if (num.negative !== 0) {
      num.negative = 0;
      var r = this.iadd(num);
      num.negative = 1;
      return r._normSign();

    // -this - num = -(this + num)
    } else if (this.negative !== 0) {
      this.negative = 0;
      this.iadd(num);
      this.negative = 1;
      return this._normSign();
    }

    // At this point both numbers are positive
    var cmp = this.cmp(num);

    // Optimization - zeroify
    if (cmp === 0) {
      this.negative = 0;
      this.length = 1;
      this.words[0] = 0;
      return this;
    }

    // a > b
    var a, b;
    if (cmp > 0) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }

    // Copy rest of the words
    if (carry === 0 && i < a.length && a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = Math.max(this.length, i);

    if (a !== this) {
      this.negative = 1;
    }

    return this.strip();
  };

  // Subtract `num` from `this`
  BN.prototype.sub = function sub (num) {
    return this.clone().isub(num);
  };

  function smallMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    var len = (self.length + num.length) | 0;
    out.length = len;
    len = (len - 1) | 0;

    // Peel one iteration (compiler can't do it, because of code complexity)
    var a = self.words[0] | 0;
    var b = num.words[0] | 0;
    var r = a * b;

    var lo = r & 0x3ffffff;
    var carry = (r / 0x4000000) | 0;
    out.words[0] = lo;

    for (var k = 1; k < len; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = carry >>> 26;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = (k - j) | 0;
        a = self.words[i] | 0;
        b = num.words[j] | 0;
        r = a * b + rword;
        ncarry += (r / 0x4000000) | 0;
        rword = r & 0x3ffffff;
      }
      out.words[k] = rword | 0;
      carry = ncarry | 0;
    }
    if (carry !== 0) {
      out.words[k] = carry | 0;
    } else {
      out.length--;
    }

    return out.strip();
  }

  // TODO(indutny): it may be reasonable to omit it for users who don't need
  // to work with 256-bit numbers, otherwise it gives 20% improvement for 256-bit
  // multiplication (like elliptic secp256k1).
  var comb10MulTo = function comb10MulTo (self, num, out) {
    var a = self.words;
    var b = num.words;
    var o = out.words;
    var c = 0;
    var lo;
    var mid;
    var hi;
    var a0 = a[0] | 0;
    var al0 = a0 & 0x1fff;
    var ah0 = a0 >>> 13;
    var a1 = a[1] | 0;
    var al1 = a1 & 0x1fff;
    var ah1 = a1 >>> 13;
    var a2 = a[2] | 0;
    var al2 = a2 & 0x1fff;
    var ah2 = a2 >>> 13;
    var a3 = a[3] | 0;
    var al3 = a3 & 0x1fff;
    var ah3 = a3 >>> 13;
    var a4 = a[4] | 0;
    var al4 = a4 & 0x1fff;
    var ah4 = a4 >>> 13;
    var a5 = a[5] | 0;
    var al5 = a5 & 0x1fff;
    var ah5 = a5 >>> 13;
    var a6 = a[6] | 0;
    var al6 = a6 & 0x1fff;
    var ah6 = a6 >>> 13;
    var a7 = a[7] | 0;
    var al7 = a7 & 0x1fff;
    var ah7 = a7 >>> 13;
    var a8 = a[8] | 0;
    var al8 = a8 & 0x1fff;
    var ah8 = a8 >>> 13;
    var a9 = a[9] | 0;
    var al9 = a9 & 0x1fff;
    var ah9 = a9 >>> 13;
    var b0 = b[0] | 0;
    var bl0 = b0 & 0x1fff;
    var bh0 = b0 >>> 13;
    var b1 = b[1] | 0;
    var bl1 = b1 & 0x1fff;
    var bh1 = b1 >>> 13;
    var b2 = b[2] | 0;
    var bl2 = b2 & 0x1fff;
    var bh2 = b2 >>> 13;
    var b3 = b[3] | 0;
    var bl3 = b3 & 0x1fff;
    var bh3 = b3 >>> 13;
    var b4 = b[4] | 0;
    var bl4 = b4 & 0x1fff;
    var bh4 = b4 >>> 13;
    var b5 = b[5] | 0;
    var bl5 = b5 & 0x1fff;
    var bh5 = b5 >>> 13;
    var b6 = b[6] | 0;
    var bl6 = b6 & 0x1fff;
    var bh6 = b6 >>> 13;
    var b7 = b[7] | 0;
    var bl7 = b7 & 0x1fff;
    var bh7 = b7 >>> 13;
    var b8 = b[8] | 0;
    var bl8 = b8 & 0x1fff;
    var bh8 = b8 >>> 13;
    var b9 = b[9] | 0;
    var bl9 = b9 & 0x1fff;
    var bh9 = b9 >>> 13;

    out.negative = self.negative ^ num.negative;
    out.length = 19;
    /* k = 0 */
    lo = Math.imul(al0, bl0);
    mid = Math.imul(al0, bh0);
    mid = (mid + Math.imul(ah0, bl0)) | 0;
    hi = Math.imul(ah0, bh0);
    var w0 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w0 >>> 26)) | 0;
    w0 &= 0x3ffffff;
    /* k = 1 */
    lo = Math.imul(al1, bl0);
    mid = Math.imul(al1, bh0);
    mid = (mid + Math.imul(ah1, bl0)) | 0;
    hi = Math.imul(ah1, bh0);
    lo = (lo + Math.imul(al0, bl1)) | 0;
    mid = (mid + Math.imul(al0, bh1)) | 0;
    mid = (mid + Math.imul(ah0, bl1)) | 0;
    hi = (hi + Math.imul(ah0, bh1)) | 0;
    var w1 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w1 >>> 26)) | 0;
    w1 &= 0x3ffffff;
    /* k = 2 */
    lo = Math.imul(al2, bl0);
    mid = Math.imul(al2, bh0);
    mid = (mid + Math.imul(ah2, bl0)) | 0;
    hi = Math.imul(ah2, bh0);
    lo = (lo + Math.imul(al1, bl1)) | 0;
    mid = (mid + Math.imul(al1, bh1)) | 0;
    mid = (mid + Math.imul(ah1, bl1)) | 0;
    hi = (hi + Math.imul(ah1, bh1)) | 0;
    lo = (lo + Math.imul(al0, bl2)) | 0;
    mid = (mid + Math.imul(al0, bh2)) | 0;
    mid = (mid + Math.imul(ah0, bl2)) | 0;
    hi = (hi + Math.imul(ah0, bh2)) | 0;
    var w2 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w2 >>> 26)) | 0;
    w2 &= 0x3ffffff;
    /* k = 3 */
    lo = Math.imul(al3, bl0);
    mid = Math.imul(al3, bh0);
    mid = (mid + Math.imul(ah3, bl0)) | 0;
    hi = Math.imul(ah3, bh0);
    lo = (lo + Math.imul(al2, bl1)) | 0;
    mid = (mid + Math.imul(al2, bh1)) | 0;
    mid = (mid + Math.imul(ah2, bl1)) | 0;
    hi = (hi + Math.imul(ah2, bh1)) | 0;
    lo = (lo + Math.imul(al1, bl2)) | 0;
    mid = (mid + Math.imul(al1, bh2)) | 0;
    mid = (mid + Math.imul(ah1, bl2)) | 0;
    hi = (hi + Math.imul(ah1, bh2)) | 0;
    lo = (lo + Math.imul(al0, bl3)) | 0;
    mid = (mid + Math.imul(al0, bh3)) | 0;
    mid = (mid + Math.imul(ah0, bl3)) | 0;
    hi = (hi + Math.imul(ah0, bh3)) | 0;
    var w3 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w3 >>> 26)) | 0;
    w3 &= 0x3ffffff;
    /* k = 4 */
    lo = Math.imul(al4, bl0);
    mid = Math.imul(al4, bh0);
    mid = (mid + Math.imul(ah4, bl0)) | 0;
    hi = Math.imul(ah4, bh0);
    lo = (lo + Math.imul(al3, bl1)) | 0;
    mid = (mid + Math.imul(al3, bh1)) | 0;
    mid = (mid + Math.imul(ah3, bl1)) | 0;
    hi = (hi + Math.imul(ah3, bh1)) | 0;
    lo = (lo + Math.imul(al2, bl2)) | 0;
    mid = (mid + Math.imul(al2, bh2)) | 0;
    mid = (mid + Math.imul(ah2, bl2)) | 0;
    hi = (hi + Math.imul(ah2, bh2)) | 0;
    lo = (lo + Math.imul(al1, bl3)) | 0;
    mid = (mid + Math.imul(al1, bh3)) | 0;
    mid = (mid + Math.imul(ah1, bl3)) | 0;
    hi = (hi + Math.imul(ah1, bh3)) | 0;
    lo = (lo + Math.imul(al0, bl4)) | 0;
    mid = (mid + Math.imul(al0, bh4)) | 0;
    mid = (mid + Math.imul(ah0, bl4)) | 0;
    hi = (hi + Math.imul(ah0, bh4)) | 0;
    var w4 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w4 >>> 26)) | 0;
    w4 &= 0x3ffffff;
    /* k = 5 */
    lo = Math.imul(al5, bl0);
    mid = Math.imul(al5, bh0);
    mid = (mid + Math.imul(ah5, bl0)) | 0;
    hi = Math.imul(ah5, bh0);
    lo = (lo + Math.imul(al4, bl1)) | 0;
    mid = (mid + Math.imul(al4, bh1)) | 0;
    mid = (mid + Math.imul(ah4, bl1)) | 0;
    hi = (hi + Math.imul(ah4, bh1)) | 0;
    lo = (lo + Math.imul(al3, bl2)) | 0;
    mid = (mid + Math.imul(al3, bh2)) | 0;
    mid = (mid + Math.imul(ah3, bl2)) | 0;
    hi = (hi + Math.imul(ah3, bh2)) | 0;
    lo = (lo + Math.imul(al2, bl3)) | 0;
    mid = (mid + Math.imul(al2, bh3)) | 0;
    mid = (mid + Math.imul(ah2, bl3)) | 0;
    hi = (hi + Math.imul(ah2, bh3)) | 0;
    lo = (lo + Math.imul(al1, bl4)) | 0;
    mid = (mid + Math.imul(al1, bh4)) | 0;
    mid = (mid + Math.imul(ah1, bl4)) | 0;
    hi = (hi + Math.imul(ah1, bh4)) | 0;
    lo = (lo + Math.imul(al0, bl5)) | 0;
    mid = (mid + Math.imul(al0, bh5)) | 0;
    mid = (mid + Math.imul(ah0, bl5)) | 0;
    hi = (hi + Math.imul(ah0, bh5)) | 0;
    var w5 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w5 >>> 26)) | 0;
    w5 &= 0x3ffffff;
    /* k = 6 */
    lo = Math.imul(al6, bl0);
    mid = Math.imul(al6, bh0);
    mid = (mid + Math.imul(ah6, bl0)) | 0;
    hi = Math.imul(ah6, bh0);
    lo = (lo + Math.imul(al5, bl1)) | 0;
    mid = (mid + Math.imul(al5, bh1)) | 0;
    mid = (mid + Math.imul(ah5, bl1)) | 0;
    hi = (hi + Math.imul(ah5, bh1)) | 0;
    lo = (lo + Math.imul(al4, bl2)) | 0;
    mid = (mid + Math.imul(al4, bh2)) | 0;
    mid = (mid + Math.imul(ah4, bl2)) | 0;
    hi = (hi + Math.imul(ah4, bh2)) | 0;
    lo = (lo + Math.imul(al3, bl3)) | 0;
    mid = (mid + Math.imul(al3, bh3)) | 0;
    mid = (mid + Math.imul(ah3, bl3)) | 0;
    hi = (hi + Math.imul(ah3, bh3)) | 0;
    lo = (lo + Math.imul(al2, bl4)) | 0;
    mid = (mid + Math.imul(al2, bh4)) | 0;
    mid = (mid + Math.imul(ah2, bl4)) | 0;
    hi = (hi + Math.imul(ah2, bh4)) | 0;
    lo = (lo + Math.imul(al1, bl5)) | 0;
    mid = (mid + Math.imul(al1, bh5)) | 0;
    mid = (mid + Math.imul(ah1, bl5)) | 0;
    hi = (hi + Math.imul(ah1, bh5)) | 0;
    lo = (lo + Math.imul(al0, bl6)) | 0;
    mid = (mid + Math.imul(al0, bh6)) | 0;
    mid = (mid + Math.imul(ah0, bl6)) | 0;
    hi = (hi + Math.imul(ah0, bh6)) | 0;
    var w6 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w6 >>> 26)) | 0;
    w6 &= 0x3ffffff;
    /* k = 7 */
    lo = Math.imul(al7, bl0);
    mid = Math.imul(al7, bh0);
    mid = (mid + Math.imul(ah7, bl0)) | 0;
    hi = Math.imul(ah7, bh0);
    lo = (lo + Math.imul(al6, bl1)) | 0;
    mid = (mid + Math.imul(al6, bh1)) | 0;
    mid = (mid + Math.imul(ah6, bl1)) | 0;
    hi = (hi + Math.imul(ah6, bh1)) | 0;
    lo = (lo + Math.imul(al5, bl2)) | 0;
    mid = (mid + Math.imul(al5, bh2)) | 0;
    mid = (mid + Math.imul(ah5, bl2)) | 0;
    hi = (hi + Math.imul(ah5, bh2)) | 0;
    lo = (lo + Math.imul(al4, bl3)) | 0;
    mid = (mid + Math.imul(al4, bh3)) | 0;
    mid = (mid + Math.imul(ah4, bl3)) | 0;
    hi = (hi + Math.imul(ah4, bh3)) | 0;
    lo = (lo + Math.imul(al3, bl4)) | 0;
    mid = (mid + Math.imul(al3, bh4)) | 0;
    mid = (mid + Math.imul(ah3, bl4)) | 0;
    hi = (hi + Math.imul(ah3, bh4)) | 0;
    lo = (lo + Math.imul(al2, bl5)) | 0;
    mid = (mid + Math.imul(al2, bh5)) | 0;
    mid = (mid + Math.imul(ah2, bl5)) | 0;
    hi = (hi + Math.imul(ah2, bh5)) | 0;
    lo = (lo + Math.imul(al1, bl6)) | 0;
    mid = (mid + Math.imul(al1, bh6)) | 0;
    mid = (mid + Math.imul(ah1, bl6)) | 0;
    hi = (hi + Math.imul(ah1, bh6)) | 0;
    lo = (lo + Math.imul(al0, bl7)) | 0;
    mid = (mid + Math.imul(al0, bh7)) | 0;
    mid = (mid + Math.imul(ah0, bl7)) | 0;
    hi = (hi + Math.imul(ah0, bh7)) | 0;
    var w7 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w7 >>> 26)) | 0;
    w7 &= 0x3ffffff;
    /* k = 8 */
    lo = Math.imul(al8, bl0);
    mid = Math.imul(al8, bh0);
    mid = (mid + Math.imul(ah8, bl0)) | 0;
    hi = Math.imul(ah8, bh0);
    lo = (lo + Math.imul(al7, bl1)) | 0;
    mid = (mid + Math.imul(al7, bh1)) | 0;
    mid = (mid + Math.imul(ah7, bl1)) | 0;
    hi = (hi + Math.imul(ah7, bh1)) | 0;
    lo = (lo + Math.imul(al6, bl2)) | 0;
    mid = (mid + Math.imul(al6, bh2)) | 0;
    mid = (mid + Math.imul(ah6, bl2)) | 0;
    hi = (hi + Math.imul(ah6, bh2)) | 0;
    lo = (lo + Math.imul(al5, bl3)) | 0;
    mid = (mid + Math.imul(al5, bh3)) | 0;
    mid = (mid + Math.imul(ah5, bl3)) | 0;
    hi = (hi + Math.imul(ah5, bh3)) | 0;
    lo = (lo + Math.imul(al4, bl4)) | 0;
    mid = (mid + Math.imul(al4, bh4)) | 0;
    mid = (mid + Math.imul(ah4, bl4)) | 0;
    hi = (hi + Math.imul(ah4, bh4)) | 0;
    lo = (lo + Math.imul(al3, bl5)) | 0;
    mid = (mid + Math.imul(al3, bh5)) | 0;
    mid = (mid + Math.imul(ah3, bl5)) | 0;
    hi = (hi + Math.imul(ah3, bh5)) | 0;
    lo = (lo + Math.imul(al2, bl6)) | 0;
    mid = (mid + Math.imul(al2, bh6)) | 0;
    mid = (mid + Math.imul(ah2, bl6)) | 0;
    hi = (hi + Math.imul(ah2, bh6)) | 0;
    lo = (lo + Math.imul(al1, bl7)) | 0;
    mid = (mid + Math.imul(al1, bh7)) | 0;
    mid = (mid + Math.imul(ah1, bl7)) | 0;
    hi = (hi + Math.imul(ah1, bh7)) | 0;
    lo = (lo + Math.imul(al0, bl8)) | 0;
    mid = (mid + Math.imul(al0, bh8)) | 0;
    mid = (mid + Math.imul(ah0, bl8)) | 0;
    hi = (hi + Math.imul(ah0, bh8)) | 0;
    var w8 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w8 >>> 26)) | 0;
    w8 &= 0x3ffffff;
    /* k = 9 */
    lo = Math.imul(al9, bl0);
    mid = Math.imul(al9, bh0);
    mid = (mid + Math.imul(ah9, bl0)) | 0;
    hi = Math.imul(ah9, bh0);
    lo = (lo + Math.imul(al8, bl1)) | 0;
    mid = (mid + Math.imul(al8, bh1)) | 0;
    mid = (mid + Math.imul(ah8, bl1)) | 0;
    hi = (hi + Math.imul(ah8, bh1)) | 0;
    lo = (lo + Math.imul(al7, bl2)) | 0;
    mid = (mid + Math.imul(al7, bh2)) | 0;
    mid = (mid + Math.imul(ah7, bl2)) | 0;
    hi = (hi + Math.imul(ah7, bh2)) | 0;
    lo = (lo + Math.imul(al6, bl3)) | 0;
    mid = (mid + Math.imul(al6, bh3)) | 0;
    mid = (mid + Math.imul(ah6, bl3)) | 0;
    hi = (hi + Math.imul(ah6, bh3)) | 0;
    lo = (lo + Math.imul(al5, bl4)) | 0;
    mid = (mid + Math.imul(al5, bh4)) | 0;
    mid = (mid + Math.imul(ah5, bl4)) | 0;
    hi = (hi + Math.imul(ah5, bh4)) | 0;
    lo = (lo + Math.imul(al4, bl5)) | 0;
    mid = (mid + Math.imul(al4, bh5)) | 0;
    mid = (mid + Math.imul(ah4, bl5)) | 0;
    hi = (hi + Math.imul(ah4, bh5)) | 0;
    lo = (lo + Math.imul(al3, bl6)) | 0;
    mid = (mid + Math.imul(al3, bh6)) | 0;
    mid = (mid + Math.imul(ah3, bl6)) | 0;
    hi = (hi + Math.imul(ah3, bh6)) | 0;
    lo = (lo + Math.imul(al2, bl7)) | 0;
    mid = (mid + Math.imul(al2, bh7)) | 0;
    mid = (mid + Math.imul(ah2, bl7)) | 0;
    hi = (hi + Math.imul(ah2, bh7)) | 0;
    lo = (lo + Math.imul(al1, bl8)) | 0;
    mid = (mid + Math.imul(al1, bh8)) | 0;
    mid = (mid + Math.imul(ah1, bl8)) | 0;
    hi = (hi + Math.imul(ah1, bh8)) | 0;
    lo = (lo + Math.imul(al0, bl9)) | 0;
    mid = (mid + Math.imul(al0, bh9)) | 0;
    mid = (mid + Math.imul(ah0, bl9)) | 0;
    hi = (hi + Math.imul(ah0, bh9)) | 0;
    var w9 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w9 >>> 26)) | 0;
    w9 &= 0x3ffffff;
    /* k = 10 */
    lo = Math.imul(al9, bl1);
    mid = Math.imul(al9, bh1);
    mid = (mid + Math.imul(ah9, bl1)) | 0;
    hi = Math.imul(ah9, bh1);
    lo = (lo + Math.imul(al8, bl2)) | 0;
    mid = (mid + Math.imul(al8, bh2)) | 0;
    mid = (mid + Math.imul(ah8, bl2)) | 0;
    hi = (hi + Math.imul(ah8, bh2)) | 0;
    lo = (lo + Math.imul(al7, bl3)) | 0;
    mid = (mid + Math.imul(al7, bh3)) | 0;
    mid = (mid + Math.imul(ah7, bl3)) | 0;
    hi = (hi + Math.imul(ah7, bh3)) | 0;
    lo = (lo + Math.imul(al6, bl4)) | 0;
    mid = (mid + Math.imul(al6, bh4)) | 0;
    mid = (mid + Math.imul(ah6, bl4)) | 0;
    hi = (hi + Math.imul(ah6, bh4)) | 0;
    lo = (lo + Math.imul(al5, bl5)) | 0;
    mid = (mid + Math.imul(al5, bh5)) | 0;
    mid = (mid + Math.imul(ah5, bl5)) | 0;
    hi = (hi + Math.imul(ah5, bh5)) | 0;
    lo = (lo + Math.imul(al4, bl6)) | 0;
    mid = (mid + Math.imul(al4, bh6)) | 0;
    mid = (mid + Math.imul(ah4, bl6)) | 0;
    hi = (hi + Math.imul(ah4, bh6)) | 0;
    lo = (lo + Math.imul(al3, bl7)) | 0;
    mid = (mid + Math.imul(al3, bh7)) | 0;
    mid = (mid + Math.imul(ah3, bl7)) | 0;
    hi = (hi + Math.imul(ah3, bh7)) | 0;
    lo = (lo + Math.imul(al2, bl8)) | 0;
    mid = (mid + Math.imul(al2, bh8)) | 0;
    mid = (mid + Math.imul(ah2, bl8)) | 0;
    hi = (hi + Math.imul(ah2, bh8)) | 0;
    lo = (lo + Math.imul(al1, bl9)) | 0;
    mid = (mid + Math.imul(al1, bh9)) | 0;
    mid = (mid + Math.imul(ah1, bl9)) | 0;
    hi = (hi + Math.imul(ah1, bh9)) | 0;
    var w10 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w10 >>> 26)) | 0;
    w10 &= 0x3ffffff;
    /* k = 11 */
    lo = Math.imul(al9, bl2);
    mid = Math.imul(al9, bh2);
    mid = (mid + Math.imul(ah9, bl2)) | 0;
    hi = Math.imul(ah9, bh2);
    lo = (lo + Math.imul(al8, bl3)) | 0;
    mid = (mid + Math.imul(al8, bh3)) | 0;
    mid = (mid + Math.imul(ah8, bl3)) | 0;
    hi = (hi + Math.imul(ah8, bh3)) | 0;
    lo = (lo + Math.imul(al7, bl4)) | 0;
    mid = (mid + Math.imul(al7, bh4)) | 0;
    mid = (mid + Math.imul(ah7, bl4)) | 0;
    hi = (hi + Math.imul(ah7, bh4)) | 0;
    lo = (lo + Math.imul(al6, bl5)) | 0;
    mid = (mid + Math.imul(al6, bh5)) | 0;
    mid = (mid + Math.imul(ah6, bl5)) | 0;
    hi = (hi + Math.imul(ah6, bh5)) | 0;
    lo = (lo + Math.imul(al5, bl6)) | 0;
    mid = (mid + Math.imul(al5, bh6)) | 0;
    mid = (mid + Math.imul(ah5, bl6)) | 0;
    hi = (hi + Math.imul(ah5, bh6)) | 0;
    lo = (lo + Math.imul(al4, bl7)) | 0;
    mid = (mid + Math.imul(al4, bh7)) | 0;
    mid = (mid + Math.imul(ah4, bl7)) | 0;
    hi = (hi + Math.imul(ah4, bh7)) | 0;
    lo = (lo + Math.imul(al3, bl8)) | 0;
    mid = (mid + Math.imul(al3, bh8)) | 0;
    mid = (mid + Math.imul(ah3, bl8)) | 0;
    hi = (hi + Math.imul(ah3, bh8)) | 0;
    lo = (lo + Math.imul(al2, bl9)) | 0;
    mid = (mid + Math.imul(al2, bh9)) | 0;
    mid = (mid + Math.imul(ah2, bl9)) | 0;
    hi = (hi + Math.imul(ah2, bh9)) | 0;
    var w11 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w11 >>> 26)) | 0;
    w11 &= 0x3ffffff;
    /* k = 12 */
    lo = Math.imul(al9, bl3);
    mid = Math.imul(al9, bh3);
    mid = (mid + Math.imul(ah9, bl3)) | 0;
    hi = Math.imul(ah9, bh3);
    lo = (lo + Math.imul(al8, bl4)) | 0;
    mid = (mid + Math.imul(al8, bh4)) | 0;
    mid = (mid + Math.imul(ah8, bl4)) | 0;
    hi = (hi + Math.imul(ah8, bh4)) | 0;
    lo = (lo + Math.imul(al7, bl5)) | 0;
    mid = (mid + Math.imul(al7, bh5)) | 0;
    mid = (mid + Math.imul(ah7, bl5)) | 0;
    hi = (hi + Math.imul(ah7, bh5)) | 0;
    lo = (lo + Math.imul(al6, bl6)) | 0;
    mid = (mid + Math.imul(al6, bh6)) | 0;
    mid = (mid + Math.imul(ah6, bl6)) | 0;
    hi = (hi + Math.imul(ah6, bh6)) | 0;
    lo = (lo + Math.imul(al5, bl7)) | 0;
    mid = (mid + Math.imul(al5, bh7)) | 0;
    mid = (mid + Math.imul(ah5, bl7)) | 0;
    hi = (hi + Math.imul(ah5, bh7)) | 0;
    lo = (lo + Math.imul(al4, bl8)) | 0;
    mid = (mid + Math.imul(al4, bh8)) | 0;
    mid = (mid + Math.imul(ah4, bl8)) | 0;
    hi = (hi + Math.imul(ah4, bh8)) | 0;
    lo = (lo + Math.imul(al3, bl9)) | 0;
    mid = (mid + Math.imul(al3, bh9)) | 0;
    mid = (mid + Math.imul(ah3, bl9)) | 0;
    hi = (hi + Math.imul(ah3, bh9)) | 0;
    var w12 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w12 >>> 26)) | 0;
    w12 &= 0x3ffffff;
    /* k = 13 */
    lo = Math.imul(al9, bl4);
    mid = Math.imul(al9, bh4);
    mid = (mid + Math.imul(ah9, bl4)) | 0;
    hi = Math.imul(ah9, bh4);
    lo = (lo + Math.imul(al8, bl5)) | 0;
    mid = (mid + Math.imul(al8, bh5)) | 0;
    mid = (mid + Math.imul(ah8, bl5)) | 0;
    hi = (hi + Math.imul(ah8, bh5)) | 0;
    lo = (lo + Math.imul(al7, bl6)) | 0;
    mid = (mid + Math.imul(al7, bh6)) | 0;
    mid = (mid + Math.imul(ah7, bl6)) | 0;
    hi = (hi + Math.imul(ah7, bh6)) | 0;
    lo = (lo + Math.imul(al6, bl7)) | 0;
    mid = (mid + Math.imul(al6, bh7)) | 0;
    mid = (mid + Math.imul(ah6, bl7)) | 0;
    hi = (hi + Math.imul(ah6, bh7)) | 0;
    lo = (lo + Math.imul(al5, bl8)) | 0;
    mid = (mid + Math.imul(al5, bh8)) | 0;
    mid = (mid + Math.imul(ah5, bl8)) | 0;
    hi = (hi + Math.imul(ah5, bh8)) | 0;
    lo = (lo + Math.imul(al4, bl9)) | 0;
    mid = (mid + Math.imul(al4, bh9)) | 0;
    mid = (mid + Math.imul(ah4, bl9)) | 0;
    hi = (hi + Math.imul(ah4, bh9)) | 0;
    var w13 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w13 >>> 26)) | 0;
    w13 &= 0x3ffffff;
    /* k = 14 */
    lo = Math.imul(al9, bl5);
    mid = Math.imul(al9, bh5);
    mid = (mid + Math.imul(ah9, bl5)) | 0;
    hi = Math.imul(ah9, bh5);
    lo = (lo + Math.imul(al8, bl6)) | 0;
    mid = (mid + Math.imul(al8, bh6)) | 0;
    mid = (mid + Math.imul(ah8, bl6)) | 0;
    hi = (hi + Math.imul(ah8, bh6)) | 0;
    lo = (lo + Math.imul(al7, bl7)) | 0;
    mid = (mid + Math.imul(al7, bh7)) | 0;
    mid = (mid + Math.imul(ah7, bl7)) | 0;
    hi = (hi + Math.imul(ah7, bh7)) | 0;
    lo = (lo + Math.imul(al6, bl8)) | 0;
    mid = (mid + Math.imul(al6, bh8)) | 0;
    mid = (mid + Math.imul(ah6, bl8)) | 0;
    hi = (hi + Math.imul(ah6, bh8)) | 0;
    lo = (lo + Math.imul(al5, bl9)) | 0;
    mid = (mid + Math.imul(al5, bh9)) | 0;
    mid = (mid + Math.imul(ah5, bl9)) | 0;
    hi = (hi + Math.imul(ah5, bh9)) | 0;
    var w14 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w14 >>> 26)) | 0;
    w14 &= 0x3ffffff;
    /* k = 15 */
    lo = Math.imul(al9, bl6);
    mid = Math.imul(al9, bh6);
    mid = (mid + Math.imul(ah9, bl6)) | 0;
    hi = Math.imul(ah9, bh6);
    lo = (lo + Math.imul(al8, bl7)) | 0;
    mid = (mid + Math.imul(al8, bh7)) | 0;
    mid = (mid + Math.imul(ah8, bl7)) | 0;
    hi = (hi + Math.imul(ah8, bh7)) | 0;
    lo = (lo + Math.imul(al7, bl8)) | 0;
    mid = (mid + Math.imul(al7, bh8)) | 0;
    mid = (mid + Math.imul(ah7, bl8)) | 0;
    hi = (hi + Math.imul(ah7, bh8)) | 0;
    lo = (lo + Math.imul(al6, bl9)) | 0;
    mid = (mid + Math.imul(al6, bh9)) | 0;
    mid = (mid + Math.imul(ah6, bl9)) | 0;
    hi = (hi + Math.imul(ah6, bh9)) | 0;
    var w15 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w15 >>> 26)) | 0;
    w15 &= 0x3ffffff;
    /* k = 16 */
    lo = Math.imul(al9, bl7);
    mid = Math.imul(al9, bh7);
    mid = (mid + Math.imul(ah9, bl7)) | 0;
    hi = Math.imul(ah9, bh7);
    lo = (lo + Math.imul(al8, bl8)) | 0;
    mid = (mid + Math.imul(al8, bh8)) | 0;
    mid = (mid + Math.imul(ah8, bl8)) | 0;
    hi = (hi + Math.imul(ah8, bh8)) | 0;
    lo = (lo + Math.imul(al7, bl9)) | 0;
    mid = (mid + Math.imul(al7, bh9)) | 0;
    mid = (mid + Math.imul(ah7, bl9)) | 0;
    hi = (hi + Math.imul(ah7, bh9)) | 0;
    var w16 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w16 >>> 26)) | 0;
    w16 &= 0x3ffffff;
    /* k = 17 */
    lo = Math.imul(al9, bl8);
    mid = Math.imul(al9, bh8);
    mid = (mid + Math.imul(ah9, bl8)) | 0;
    hi = Math.imul(ah9, bh8);
    lo = (lo + Math.imul(al8, bl9)) | 0;
    mid = (mid + Math.imul(al8, bh9)) | 0;
    mid = (mid + Math.imul(ah8, bl9)) | 0;
    hi = (hi + Math.imul(ah8, bh9)) | 0;
    var w17 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w17 >>> 26)) | 0;
    w17 &= 0x3ffffff;
    /* k = 18 */
    lo = Math.imul(al9, bl9);
    mid = Math.imul(al9, bh9);
    mid = (mid + Math.imul(ah9, bl9)) | 0;
    hi = Math.imul(ah9, bh9);
    var w18 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w18 >>> 26)) | 0;
    w18 &= 0x3ffffff;
    o[0] = w0;
    o[1] = w1;
    o[2] = w2;
    o[3] = w3;
    o[4] = w4;
    o[5] = w5;
    o[6] = w6;
    o[7] = w7;
    o[8] = w8;
    o[9] = w9;
    o[10] = w10;
    o[11] = w11;
    o[12] = w12;
    o[13] = w13;
    o[14] = w14;
    o[15] = w15;
    o[16] = w16;
    o[17] = w17;
    o[18] = w18;
    if (c !== 0) {
      o[19] = c;
      out.length++;
    }
    return out;
  };

  // Polyfill comb
  if (!Math.imul) {
    comb10MulTo = smallMulTo;
  }

  function bigMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    out.length = self.length + num.length;

    var carry = 0;
    var hncarry = 0;
    for (var k = 0; k < out.length - 1; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = hncarry;
      hncarry = 0;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = k - j;
        var a = self.words[i] | 0;
        var b = num.words[j] | 0;
        var r = a * b;

        var lo = r & 0x3ffffff;
        ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
        lo = (lo + rword) | 0;
        rword = lo & 0x3ffffff;
        ncarry = (ncarry + (lo >>> 26)) | 0;

        hncarry += ncarry >>> 26;
        ncarry &= 0x3ffffff;
      }
      out.words[k] = rword;
      carry = ncarry;
      ncarry = hncarry;
    }
    if (carry !== 0) {
      out.words[k] = carry;
    } else {
      out.length--;
    }

    return out.strip();
  }

  function jumboMulTo (self, num, out) {
    var fftm = new FFTM();
    return fftm.mulp(self, num, out);
  }

  BN.prototype.mulTo = function mulTo (num, out) {
    var res;
    var len = this.length + num.length;
    if (this.length === 10 && num.length === 10) {
      res = comb10MulTo(this, num, out);
    } else if (len < 63) {
      res = smallMulTo(this, num, out);
    } else if (len < 1024) {
      res = bigMulTo(this, num, out);
    } else {
      res = jumboMulTo(this, num, out);
    }

    return res;
  };

  // Cooley-Tukey algorithm for FFT
  // slightly revisited to rely on looping instead of recursion

  function FFTM (x, y) {
    this.x = x;
    this.y = y;
  }

  FFTM.prototype.makeRBT = function makeRBT (N) {
    var t = new Array(N);
    var l = BN.prototype._countBits(N) - 1;
    for (var i = 0; i < N; i++) {
      t[i] = this.revBin(i, l, N);
    }

    return t;
  };

  // Returns binary-reversed representation of `x`
  FFTM.prototype.revBin = function revBin (x, l, N) {
    if (x === 0 || x === N - 1) return x;

    var rb = 0;
    for (var i = 0; i < l; i++) {
      rb |= (x & 1) << (l - i - 1);
      x >>= 1;
    }

    return rb;
  };

  // Performs "tweedling" phase, therefore 'emulating'
  // behaviour of the recursive algorithm
  FFTM.prototype.permute = function permute (rbt, rws, iws, rtws, itws, N) {
    for (var i = 0; i < N; i++) {
      rtws[i] = rws[rbt[i]];
      itws[i] = iws[rbt[i]];
    }
  };

  FFTM.prototype.transform = function transform (rws, iws, rtws, itws, N, rbt) {
    this.permute(rbt, rws, iws, rtws, itws, N);

    for (var s = 1; s < N; s <<= 1) {
      var l = s << 1;

      var rtwdf = Math.cos(2 * Math.PI / l);
      var itwdf = Math.sin(2 * Math.PI / l);

      for (var p = 0; p < N; p += l) {
        var rtwdf_ = rtwdf;
        var itwdf_ = itwdf;

        for (var j = 0; j < s; j++) {
          var re = rtws[p + j];
          var ie = itws[p + j];

          var ro = rtws[p + j + s];
          var io = itws[p + j + s];

          var rx = rtwdf_ * ro - itwdf_ * io;

          io = rtwdf_ * io + itwdf_ * ro;
          ro = rx;

          rtws[p + j] = re + ro;
          itws[p + j] = ie + io;

          rtws[p + j + s] = re - ro;
          itws[p + j + s] = ie - io;

          /* jshint maxdepth : false */
          if (j !== l) {
            rx = rtwdf * rtwdf_ - itwdf * itwdf_;

            itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
            rtwdf_ = rx;
          }
        }
      }
    }
  };

  FFTM.prototype.guessLen13b = function guessLen13b (n, m) {
    var N = Math.max(m, n) | 1;
    var odd = N & 1;
    var i = 0;
    for (N = N / 2 | 0; N; N = N >>> 1) {
      i++;
    }

    return 1 << i + 1 + odd;
  };

  FFTM.prototype.conjugate = function conjugate (rws, iws, N) {
    if (N <= 1) return;

    for (var i = 0; i < N / 2; i++) {
      var t = rws[i];

      rws[i] = rws[N - i - 1];
      rws[N - i - 1] = t;

      t = iws[i];

      iws[i] = -iws[N - i - 1];
      iws[N - i - 1] = -t;
    }
  };

  FFTM.prototype.normalize13b = function normalize13b (ws, N) {
    var carry = 0;
    for (var i = 0; i < N / 2; i++) {
      var w = Math.round(ws[2 * i + 1] / N) * 0x2000 +
        Math.round(ws[2 * i] / N) +
        carry;

      ws[i] = w & 0x3ffffff;

      if (w < 0x4000000) {
        carry = 0;
      } else {
        carry = w / 0x4000000 | 0;
      }
    }

    return ws;
  };

  FFTM.prototype.convert13b = function convert13b (ws, len, rws, N) {
    var carry = 0;
    for (var i = 0; i < len; i++) {
      carry = carry + (ws[i] | 0);

      rws[2 * i] = carry & 0x1fff; carry = carry >>> 13;
      rws[2 * i + 1] = carry & 0x1fff; carry = carry >>> 13;
    }

    // Pad with zeroes
    for (i = 2 * len; i < N; ++i) {
      rws[i] = 0;
    }

    assert(carry === 0);
    assert((carry & ~0x1fff) === 0);
  };

  FFTM.prototype.stub = function stub (N) {
    var ph = new Array(N);
    for (var i = 0; i < N; i++) {
      ph[i] = 0;
    }

    return ph;
  };

  FFTM.prototype.mulp = function mulp (x, y, out) {
    var N = 2 * this.guessLen13b(x.length, y.length);

    var rbt = this.makeRBT(N);

    var _ = this.stub(N);

    var rws = new Array(N);
    var rwst = new Array(N);
    var iwst = new Array(N);

    var nrws = new Array(N);
    var nrwst = new Array(N);
    var niwst = new Array(N);

    var rmws = out.words;
    rmws.length = N;

    this.convert13b(x.words, x.length, rws, N);
    this.convert13b(y.words, y.length, nrws, N);

    this.transform(rws, _, rwst, iwst, N, rbt);
    this.transform(nrws, _, nrwst, niwst, N, rbt);

    for (var i = 0; i < N; i++) {
      var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
      iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
      rwst[i] = rx;
    }

    this.conjugate(rwst, iwst, N);
    this.transform(rwst, iwst, rmws, _, N, rbt);
    this.conjugate(rmws, _, N);
    this.normalize13b(rmws, N);

    out.negative = x.negative ^ y.negative;
    out.length = x.length + y.length;
    return out.strip();
  };

  // Multiply `this` by `num`
  BN.prototype.mul = function mul (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return this.mulTo(num, out);
  };

  // Multiply employing FFT
  BN.prototype.mulf = function mulf (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return jumboMulTo(this, num, out);
  };

  // In-place Multiplication
  BN.prototype.imul = function imul (num) {
    return this.clone().mulTo(num, this);
  };

  BN.prototype.imuln = function imuln (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);

    // Carry
    var carry = 0;
    for (var i = 0; i < this.length; i++) {
      var w = (this.words[i] | 0) * num;
      var lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
      carry >>= 26;
      carry += (w / 0x4000000) | 0;
      // NOTE: lo is 27bit maximum
      carry += lo >>> 26;
      this.words[i] = lo & 0x3ffffff;
    }

    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }

    return this;
  };

  BN.prototype.muln = function muln (num) {
    return this.clone().imuln(num);
  };

  // `this` * `this`
  BN.prototype.sqr = function sqr () {
    return this.mul(this);
  };

  // `this` * `this` in-place
  BN.prototype.isqr = function isqr () {
    return this.imul(this.clone());
  };

  // Math.pow(`this`, `num`)
  BN.prototype.pow = function pow (num) {
    var w = toBitArray(num);
    if (w.length === 0) return new BN(1);

    // Skip leading zeroes
    var res = this;
    for (var i = 0; i < w.length; i++, res = res.sqr()) {
      if (w[i] !== 0) break;
    }

    if (++i < w.length) {
      for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
        if (w[i] === 0) continue;

        res = res.mul(q);
      }
    }

    return res;
  };

  // Shift-left in-place
  BN.prototype.iushln = function iushln (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;
    var carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);
    var i;

    if (r !== 0) {
      var carry = 0;

      for (i = 0; i < this.length; i++) {
        var newCarry = this.words[i] & carryMask;
        var c = ((this.words[i] | 0) - newCarry) << r;
        this.words[i] = c | carry;
        carry = newCarry >>> (26 - r);
      }

      if (carry) {
        this.words[i] = carry;
        this.length++;
      }
    }

    if (s !== 0) {
      for (i = this.length - 1; i >= 0; i--) {
        this.words[i + s] = this.words[i];
      }

      for (i = 0; i < s; i++) {
        this.words[i] = 0;
      }

      this.length += s;
    }

    return this.strip();
  };

  BN.prototype.ishln = function ishln (bits) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushln(bits);
  };

  // Shift-right in-place
  // NOTE: `hint` is a lowest bit before trailing zeroes
  // NOTE: if `extended` is present - it will be filled with destroyed bits
  BN.prototype.iushrn = function iushrn (bits, hint, extended) {
    assert(typeof bits === 'number' && bits >= 0);
    var h;
    if (hint) {
      h = (hint - (hint % 26)) / 26;
    } else {
      h = 0;
    }

    var r = bits % 26;
    var s = Math.min((bits - r) / 26, this.length);
    var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
    var maskedWords = extended;

    h -= s;
    h = Math.max(0, h);

    // Extended mode, copy masked part
    if (maskedWords) {
      for (var i = 0; i < s; i++) {
        maskedWords.words[i] = this.words[i];
      }
      maskedWords.length = s;
    }

    if (s === 0) {
      // No-op, we should not move anything at all
    } else if (this.length > s) {
      this.length -= s;
      for (i = 0; i < this.length; i++) {
        this.words[i] = this.words[i + s];
      }
    } else {
      this.words[0] = 0;
      this.length = 1;
    }

    var carry = 0;
    for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
      var word = this.words[i] | 0;
      this.words[i] = (carry << (26 - r)) | (word >>> r);
      carry = word & mask;
    }

    // Push carried bits as a mask
    if (maskedWords && carry !== 0) {
      maskedWords.words[maskedWords.length++] = carry;
    }

    if (this.length === 0) {
      this.words[0] = 0;
      this.length = 1;
    }

    return this.strip();
  };

  BN.prototype.ishrn = function ishrn (bits, hint, extended) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushrn(bits, hint, extended);
  };

  // Shift-left
  BN.prototype.shln = function shln (bits) {
    return this.clone().ishln(bits);
  };

  BN.prototype.ushln = function ushln (bits) {
    return this.clone().iushln(bits);
  };

  // Shift-right
  BN.prototype.shrn = function shrn (bits) {
    return this.clone().ishrn(bits);
  };

  BN.prototype.ushrn = function ushrn (bits) {
    return this.clone().iushrn(bits);
  };

  // Test if n bit is set
  BN.prototype.testn = function testn (bit) {
    assert(typeof bit === 'number' && bit >= 0);
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) return false;

    // Check bit and return
    var w = this.words[s];

    return !!(w & q);
  };

  // Return only lowers bits of number (in-place)
  BN.prototype.imaskn = function imaskn (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;

    assert(this.negative === 0, 'imaskn works only with positive numbers');

    if (this.length <= s) {
      return this;
    }

    if (r !== 0) {
      s++;
    }
    this.length = Math.min(s, this.length);

    if (r !== 0) {
      var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
      this.words[this.length - 1] &= mask;
    }

    return this.strip();
  };

  // Return only lowers bits of number
  BN.prototype.maskn = function maskn (bits) {
    return this.clone().imaskn(bits);
  };

  // Add plain number `num` to `this`
  BN.prototype.iaddn = function iaddn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.isubn(-num);

    // Possible sign change
    if (this.negative !== 0) {
      if (this.length === 1 && (this.words[0] | 0) < num) {
        this.words[0] = num - (this.words[0] | 0);
        this.negative = 0;
        return this;
      }

      this.negative = 0;
      this.isubn(num);
      this.negative = 1;
      return this;
    }

    // Add without checks
    return this._iaddn(num);
  };

  BN.prototype._iaddn = function _iaddn (num) {
    this.words[0] += num;

    // Carry
    for (var i = 0; i < this.length && this.words[i] >= 0x4000000; i++) {
      this.words[i] -= 0x4000000;
      if (i === this.length - 1) {
        this.words[i + 1] = 1;
      } else {
        this.words[i + 1]++;
      }
    }
    this.length = Math.max(this.length, i + 1);

    return this;
  };

  // Subtract plain number `num` from `this`
  BN.prototype.isubn = function isubn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.iaddn(-num);

    if (this.negative !== 0) {
      this.negative = 0;
      this.iaddn(num);
      this.negative = 1;
      return this;
    }

    this.words[0] -= num;

    if (this.length === 1 && this.words[0] < 0) {
      this.words[0] = -this.words[0];
      this.negative = 1;
    } else {
      // Carry
      for (var i = 0; i < this.length && this.words[i] < 0; i++) {
        this.words[i] += 0x4000000;
        this.words[i + 1] -= 1;
      }
    }

    return this.strip();
  };

  BN.prototype.addn = function addn (num) {
    return this.clone().iaddn(num);
  };

  BN.prototype.subn = function subn (num) {
    return this.clone().isubn(num);
  };

  BN.prototype.iabs = function iabs () {
    this.negative = 0;

    return this;
  };

  BN.prototype.abs = function abs () {
    return this.clone().iabs();
  };

  BN.prototype._ishlnsubmul = function _ishlnsubmul (num, mul, shift) {
    var len = num.length + shift;
    var i;

    this._expand(len);

    var w;
    var carry = 0;
    for (i = 0; i < num.length; i++) {
      w = (this.words[i + shift] | 0) + carry;
      var right = (num.words[i] | 0) * mul;
      w -= right & 0x3ffffff;
      carry = (w >> 26) - ((right / 0x4000000) | 0);
      this.words[i + shift] = w & 0x3ffffff;
    }
    for (; i < this.length - shift; i++) {
      w = (this.words[i + shift] | 0) + carry;
      carry = w >> 26;
      this.words[i + shift] = w & 0x3ffffff;
    }

    if (carry === 0) return this.strip();

    // Subtraction overflow
    assert(carry === -1);
    carry = 0;
    for (i = 0; i < this.length; i++) {
      w = -(this.words[i] | 0) + carry;
      carry = w >> 26;
      this.words[i] = w & 0x3ffffff;
    }
    this.negative = 1;

    return this.strip();
  };

  BN.prototype._wordDiv = function _wordDiv (num, mode) {
    var shift = this.length - num.length;

    var a = this.clone();
    var b = num;

    // Normalize
    var bhi = b.words[b.length - 1] | 0;
    var bhiBits = this._countBits(bhi);
    shift = 26 - bhiBits;
    if (shift !== 0) {
      b = b.ushln(shift);
      a.iushln(shift);
      bhi = b.words[b.length - 1] | 0;
    }

    // Initialize quotient
    var m = a.length - b.length;
    var q;

    if (mode !== 'mod') {
      q = new BN(null);
      q.length = m + 1;
      q.words = new Array(q.length);
      for (var i = 0; i < q.length; i++) {
        q.words[i] = 0;
      }
    }

    var diff = a.clone()._ishlnsubmul(b, 1, m);
    if (diff.negative === 0) {
      a = diff;
      if (q) {
        q.words[m] = 1;
      }
    }

    for (var j = m - 1; j >= 0; j--) {
      var qj = (a.words[b.length + j] | 0) * 0x4000000 +
        (a.words[b.length + j - 1] | 0);

      // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
      // (0x7ffffff)
      qj = Math.min((qj / bhi) | 0, 0x3ffffff);

      a._ishlnsubmul(b, qj, j);
      while (a.negative !== 0) {
        qj--;
        a.negative = 0;
        a._ishlnsubmul(b, 1, j);
        if (!a.isZero()) {
          a.negative ^= 1;
        }
      }
      if (q) {
        q.words[j] = qj;
      }
    }
    if (q) {
      q.strip();
    }
    a.strip();

    // Denormalize
    if (mode !== 'div' && shift !== 0) {
      a.iushrn(shift);
    }

    return {
      div: q || null,
      mod: a
    };
  };

  // NOTE: 1) `mode` can be set to `mod` to request mod only,
  //       to `div` to request div only, or be absent to
  //       request both div & mod
  //       2) `positive` is true if unsigned mod is requested
  BN.prototype.divmod = function divmod (num, mode, positive) {
    assert(!num.isZero());

    if (this.isZero()) {
      return {
        div: new BN(0),
        mod: new BN(0)
      };
    }

    var div, mod, res;
    if (this.negative !== 0 && num.negative === 0) {
      res = this.neg().divmod(num, mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.iadd(num);
        }
      }

      return {
        div: div,
        mod: mod
      };
    }

    if (this.negative === 0 && num.negative !== 0) {
      res = this.divmod(num.neg(), mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      return {
        div: div,
        mod: res.mod
      };
    }

    if ((this.negative & num.negative) !== 0) {
      res = this.neg().divmod(num.neg(), mode);

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.isub(num);
        }
      }

      return {
        div: res.div,
        mod: mod
      };
    }

    // Both numbers are positive at this point

    // Strip both numbers to approximate shift value
    if (num.length > this.length || this.cmp(num) < 0) {
      return {
        div: new BN(0),
        mod: this
      };
    }

    // Very short reduction
    if (num.length === 1) {
      if (mode === 'div') {
        return {
          div: this.divn(num.words[0]),
          mod: null
        };
      }

      if (mode === 'mod') {
        return {
          div: null,
          mod: new BN(this.modn(num.words[0]))
        };
      }

      return {
        div: this.divn(num.words[0]),
        mod: new BN(this.modn(num.words[0]))
      };
    }

    return this._wordDiv(num, mode);
  };

  // Find `this` / `num`
  BN.prototype.div = function div (num) {
    return this.divmod(num, 'div', false).div;
  };

  // Find `this` % `num`
  BN.prototype.mod = function mod (num) {
    return this.divmod(num, 'mod', false).mod;
  };

  BN.prototype.umod = function umod (num) {
    return this.divmod(num, 'mod', true).mod;
  };

  // Find Round(`this` / `num`)
  BN.prototype.divRound = function divRound (num) {
    var dm = this.divmod(num);

    // Fast case - exact division
    if (dm.mod.isZero()) return dm.div;

    var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;

    var half = num.ushrn(1);
    var r2 = num.andln(1);
    var cmp = mod.cmp(half);

    // Round down
    if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;

    // Round up
    return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
  };

  BN.prototype.modn = function modn (num) {
    assert(num <= 0x3ffffff);
    var p = (1 << 26) % num;

    var acc = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      acc = (p * acc + (this.words[i] | 0)) % num;
    }

    return acc;
  };

  // In-place division by number
  BN.prototype.idivn = function idivn (num) {
    assert(num <= 0x3ffffff);

    var carry = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var w = (this.words[i] | 0) + carry * 0x4000000;
      this.words[i] = (w / num) | 0;
      carry = w % num;
    }

    return this.strip();
  };

  BN.prototype.divn = function divn (num) {
    return this.clone().idivn(num);
  };

  BN.prototype.egcd = function egcd (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var x = this;
    var y = p.clone();

    if (x.negative !== 0) {
      x = x.umod(p);
    } else {
      x = x.clone();
    }

    // A * x + B * y = x
    var A = new BN(1);
    var B = new BN(0);

    // C * x + D * y = y
    var C = new BN(0);
    var D = new BN(1);

    var g = 0;

    while (x.isEven() && y.isEven()) {
      x.iushrn(1);
      y.iushrn(1);
      ++g;
    }

    var yp = y.clone();
    var xp = x.clone();

    while (!x.isZero()) {
      for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        x.iushrn(i);
        while (i-- > 0) {
          if (A.isOdd() || B.isOdd()) {
            A.iadd(yp);
            B.isub(xp);
          }

          A.iushrn(1);
          B.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        y.iushrn(j);
        while (j-- > 0) {
          if (C.isOdd() || D.isOdd()) {
            C.iadd(yp);
            D.isub(xp);
          }

          C.iushrn(1);
          D.iushrn(1);
        }
      }

      if (x.cmp(y) >= 0) {
        x.isub(y);
        A.isub(C);
        B.isub(D);
      } else {
        y.isub(x);
        C.isub(A);
        D.isub(B);
      }
    }

    return {
      a: C,
      b: D,
      gcd: y.iushln(g)
    };
  };

  // This is reduced incarnation of the binary EEA
  // above, designated to invert members of the
  // _prime_ fields F(p) at a maximal speed
  BN.prototype._invmp = function _invmp (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var a = this;
    var b = p.clone();

    if (a.negative !== 0) {
      a = a.umod(p);
    } else {
      a = a.clone();
    }

    var x1 = new BN(1);
    var x2 = new BN(0);

    var delta = b.clone();

    while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
      for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        a.iushrn(i);
        while (i-- > 0) {
          if (x1.isOdd()) {
            x1.iadd(delta);
          }

          x1.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        b.iushrn(j);
        while (j-- > 0) {
          if (x2.isOdd()) {
            x2.iadd(delta);
          }

          x2.iushrn(1);
        }
      }

      if (a.cmp(b) >= 0) {
        a.isub(b);
        x1.isub(x2);
      } else {
        b.isub(a);
        x2.isub(x1);
      }
    }

    var res;
    if (a.cmpn(1) === 0) {
      res = x1;
    } else {
      res = x2;
    }

    if (res.cmpn(0) < 0) {
      res.iadd(p);
    }

    return res;
  };

  BN.prototype.gcd = function gcd (num) {
    if (this.isZero()) return num.abs();
    if (num.isZero()) return this.abs();

    var a = this.clone();
    var b = num.clone();
    a.negative = 0;
    b.negative = 0;

    // Remove common factor of two
    for (var shift = 0; a.isEven() && b.isEven(); shift++) {
      a.iushrn(1);
      b.iushrn(1);
    }

    do {
      while (a.isEven()) {
        a.iushrn(1);
      }
      while (b.isEven()) {
        b.iushrn(1);
      }

      var r = a.cmp(b);
      if (r < 0) {
        // Swap `a` and `b` to make `a` always bigger than `b`
        var t = a;
        a = b;
        b = t;
      } else if (r === 0 || b.cmpn(1) === 0) {
        break;
      }

      a.isub(b);
    } while (true);

    return b.iushln(shift);
  };

  // Invert number in the field F(num)
  BN.prototype.invm = function invm (num) {
    return this.egcd(num).a.umod(num);
  };

  BN.prototype.isEven = function isEven () {
    return (this.words[0] & 1) === 0;
  };

  BN.prototype.isOdd = function isOdd () {
    return (this.words[0] & 1) === 1;
  };

  // And first word and num
  BN.prototype.andln = function andln (num) {
    return this.words[0] & num;
  };

  // Increment at the bit position in-line
  BN.prototype.bincn = function bincn (bit) {
    assert(typeof bit === 'number');
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) {
      this._expand(s + 1);
      this.words[s] |= q;
      return this;
    }

    // Add bit and propagate, if needed
    var carry = q;
    for (var i = s; carry !== 0 && i < this.length; i++) {
      var w = this.words[i] | 0;
      w += carry;
      carry = w >>> 26;
      w &= 0x3ffffff;
      this.words[i] = w;
    }
    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }
    return this;
  };

  BN.prototype.isZero = function isZero () {
    return this.length === 1 && this.words[0] === 0;
  };

  BN.prototype.cmpn = function cmpn (num) {
    var negative = num < 0;

    if (this.negative !== 0 && !negative) return -1;
    if (this.negative === 0 && negative) return 1;

    this.strip();

    var res;
    if (this.length > 1) {
      res = 1;
    } else {
      if (negative) {
        num = -num;
      }

      assert(num <= 0x3ffffff, 'Number is too big');

      var w = this.words[0] | 0;
      res = w === num ? 0 : w < num ? -1 : 1;
    }
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Compare two numbers and return:
  // 1 - if `this` > `num`
  // 0 - if `this` == `num`
  // -1 - if `this` < `num`
  BN.prototype.cmp = function cmp (num) {
    if (this.negative !== 0 && num.negative === 0) return -1;
    if (this.negative === 0 && num.negative !== 0) return 1;

    var res = this.ucmp(num);
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Unsigned comparison
  BN.prototype.ucmp = function ucmp (num) {
    // At this point both numbers have the same sign
    if (this.length > num.length) return 1;
    if (this.length < num.length) return -1;

    var res = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var a = this.words[i] | 0;
      var b = num.words[i] | 0;

      if (a === b) continue;
      if (a < b) {
        res = -1;
      } else if (a > b) {
        res = 1;
      }
      break;
    }
    return res;
  };

  BN.prototype.gtn = function gtn (num) {
    return this.cmpn(num) === 1;
  };

  BN.prototype.gt = function gt (num) {
    return this.cmp(num) === 1;
  };

  BN.prototype.gten = function gten (num) {
    return this.cmpn(num) >= 0;
  };

  BN.prototype.gte = function gte (num) {
    return this.cmp(num) >= 0;
  };

  BN.prototype.ltn = function ltn (num) {
    return this.cmpn(num) === -1;
  };

  BN.prototype.lt = function lt (num) {
    return this.cmp(num) === -1;
  };

  BN.prototype.lten = function lten (num) {
    return this.cmpn(num) <= 0;
  };

  BN.prototype.lte = function lte (num) {
    return this.cmp(num) <= 0;
  };

  BN.prototype.eqn = function eqn (num) {
    return this.cmpn(num) === 0;
  };

  BN.prototype.eq = function eq (num) {
    return this.cmp(num) === 0;
  };

  //
  // A reduce context, could be using montgomery or something better, depending
  // on the `m` itself.
  //
  BN.red = function red (num) {
    return new Red(num);
  };

  BN.prototype.toRed = function toRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    assert(this.negative === 0, 'red works only with positives');
    return ctx.convertTo(this)._forceRed(ctx);
  };

  BN.prototype.fromRed = function fromRed () {
    assert(this.red, 'fromRed works only with numbers in reduction context');
    return this.red.convertFrom(this);
  };

  BN.prototype._forceRed = function _forceRed (ctx) {
    this.red = ctx;
    return this;
  };

  BN.prototype.forceRed = function forceRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    return this._forceRed(ctx);
  };

  BN.prototype.redAdd = function redAdd (num) {
    assert(this.red, 'redAdd works only with red numbers');
    return this.red.add(this, num);
  };

  BN.prototype.redIAdd = function redIAdd (num) {
    assert(this.red, 'redIAdd works only with red numbers');
    return this.red.iadd(this, num);
  };

  BN.prototype.redSub = function redSub (num) {
    assert(this.red, 'redSub works only with red numbers');
    return this.red.sub(this, num);
  };

  BN.prototype.redISub = function redISub (num) {
    assert(this.red, 'redISub works only with red numbers');
    return this.red.isub(this, num);
  };

  BN.prototype.redShl = function redShl (num) {
    assert(this.red, 'redShl works only with red numbers');
    return this.red.shl(this, num);
  };

  BN.prototype.redMul = function redMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.mul(this, num);
  };

  BN.prototype.redIMul = function redIMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.imul(this, num);
  };

  BN.prototype.redSqr = function redSqr () {
    assert(this.red, 'redSqr works only with red numbers');
    this.red._verify1(this);
    return this.red.sqr(this);
  };

  BN.prototype.redISqr = function redISqr () {
    assert(this.red, 'redISqr works only with red numbers');
    this.red._verify1(this);
    return this.red.isqr(this);
  };

  // Square root over p
  BN.prototype.redSqrt = function redSqrt () {
    assert(this.red, 'redSqrt works only with red numbers');
    this.red._verify1(this);
    return this.red.sqrt(this);
  };

  BN.prototype.redInvm = function redInvm () {
    assert(this.red, 'redInvm works only with red numbers');
    this.red._verify1(this);
    return this.red.invm(this);
  };

  // Return negative clone of `this` % `red modulo`
  BN.prototype.redNeg = function redNeg () {
    assert(this.red, 'redNeg works only with red numbers');
    this.red._verify1(this);
    return this.red.neg(this);
  };

  BN.prototype.redPow = function redPow (num) {
    assert(this.red && !num.red, 'redPow(normalNum)');
    this.red._verify1(this);
    return this.red.pow(this, num);
  };

  // Prime numbers with efficient reduction
  var primes = {
    k256: null,
    p224: null,
    p192: null,
    p25519: null
  };

  // Pseudo-Mersenne prime
  function MPrime (name, p) {
    // P = 2 ^ N - K
    this.name = name;
    this.p = new BN(p, 16);
    this.n = this.p.bitLength();
    this.k = new BN(1).iushln(this.n).isub(this.p);

    this.tmp = this._tmp();
  }

  MPrime.prototype._tmp = function _tmp () {
    var tmp = new BN(null);
    tmp.words = new Array(Math.ceil(this.n / 13));
    return tmp;
  };

  MPrime.prototype.ireduce = function ireduce (num) {
    // Assumes that `num` is less than `P^2`
    // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
    var r = num;
    var rlen;

    do {
      this.split(r, this.tmp);
      r = this.imulK(r);
      r = r.iadd(this.tmp);
      rlen = r.bitLength();
    } while (rlen > this.n);

    var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
    if (cmp === 0) {
      r.words[0] = 0;
      r.length = 1;
    } else if (cmp > 0) {
      r.isub(this.p);
    } else {
      r.strip();
    }

    return r;
  };

  MPrime.prototype.split = function split (input, out) {
    input.iushrn(this.n, 0, out);
  };

  MPrime.prototype.imulK = function imulK (num) {
    return num.imul(this.k);
  };

  function K256 () {
    MPrime.call(
      this,
      'k256',
      'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f');
  }
  inherits(K256, MPrime);

  K256.prototype.split = function split (input, output) {
    // 256 = 9 * 26 + 22
    var mask = 0x3fffff;

    var outLen = Math.min(input.length, 9);
    for (var i = 0; i < outLen; i++) {
      output.words[i] = input.words[i];
    }
    output.length = outLen;

    if (input.length <= 9) {
      input.words[0] = 0;
      input.length = 1;
      return;
    }

    // Shift by 9 limbs
    var prev = input.words[9];
    output.words[output.length++] = prev & mask;

    for (i = 10; i < input.length; i++) {
      var next = input.words[i] | 0;
      input.words[i - 10] = ((next & mask) << 4) | (prev >>> 22);
      prev = next;
    }
    prev >>>= 22;
    input.words[i - 10] = prev;
    if (prev === 0 && input.length > 10) {
      input.length -= 10;
    } else {
      input.length -= 9;
    }
  };

  K256.prototype.imulK = function imulK (num) {
    // K = 0x1000003d1 = [ 0x40, 0x3d1 ]
    num.words[num.length] = 0;
    num.words[num.length + 1] = 0;
    num.length += 2;

    // bounded at: 0x40 * 0x3ffffff + 0x3d0 = 0x100000390
    var lo = 0;
    for (var i = 0; i < num.length; i++) {
      var w = num.words[i] | 0;
      lo += w * 0x3d1;
      num.words[i] = lo & 0x3ffffff;
      lo = w * 0x40 + ((lo / 0x4000000) | 0);
    }

    // Fast length reduction
    if (num.words[num.length - 1] === 0) {
      num.length--;
      if (num.words[num.length - 1] === 0) {
        num.length--;
      }
    }
    return num;
  };

  function P224 () {
    MPrime.call(
      this,
      'p224',
      'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001');
  }
  inherits(P224, MPrime);

  function P192 () {
    MPrime.call(
      this,
      'p192',
      'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff');
  }
  inherits(P192, MPrime);

  function P25519 () {
    // 2 ^ 255 - 19
    MPrime.call(
      this,
      '25519',
      '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed');
  }
  inherits(P25519, MPrime);

  P25519.prototype.imulK = function imulK (num) {
    // K = 0x13
    var carry = 0;
    for (var i = 0; i < num.length; i++) {
      var hi = (num.words[i] | 0) * 0x13 + carry;
      var lo = hi & 0x3ffffff;
      hi >>>= 26;

      num.words[i] = lo;
      carry = hi;
    }
    if (carry !== 0) {
      num.words[num.length++] = carry;
    }
    return num;
  };

  // Exported mostly for testing purposes, use plain name instead
  BN._prime = function prime (name) {
    // Cached version of prime
    if (primes[name]) return primes[name];

    var prime;
    if (name === 'k256') {
      prime = new K256();
    } else if (name === 'p224') {
      prime = new P224();
    } else if (name === 'p192') {
      prime = new P192();
    } else if (name === 'p25519') {
      prime = new P25519();
    } else {
      throw new Error('Unknown prime ' + name);
    }
    primes[name] = prime;

    return prime;
  };

  //
  // Base reduction engine
  //
  function Red (m) {
    if (typeof m === 'string') {
      var prime = BN._prime(m);
      this.m = prime.p;
      this.prime = prime;
    } else {
      assert(m.gtn(1), 'modulus must be greater than 1');
      this.m = m;
      this.prime = null;
    }
  }

  Red.prototype._verify1 = function _verify1 (a) {
    assert(a.negative === 0, 'red works only with positives');
    assert(a.red, 'red works only with red numbers');
  };

  Red.prototype._verify2 = function _verify2 (a, b) {
    assert((a.negative | b.negative) === 0, 'red works only with positives');
    assert(a.red && a.red === b.red,
      'red works only with red numbers');
  };

  Red.prototype.imod = function imod (a) {
    if (this.prime) return this.prime.ireduce(a)._forceRed(this);
    return a.umod(this.m)._forceRed(this);
  };

  Red.prototype.neg = function neg (a) {
    if (a.isZero()) {
      return a.clone();
    }

    return this.m.sub(a)._forceRed(this);
  };

  Red.prototype.add = function add (a, b) {
    this._verify2(a, b);

    var res = a.add(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.iadd = function iadd (a, b) {
    this._verify2(a, b);

    var res = a.iadd(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res;
  };

  Red.prototype.sub = function sub (a, b) {
    this._verify2(a, b);

    var res = a.sub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.isub = function isub (a, b) {
    this._verify2(a, b);

    var res = a.isub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res;
  };

  Red.prototype.shl = function shl (a, num) {
    this._verify1(a);
    return this.imod(a.ushln(num));
  };

  Red.prototype.imul = function imul (a, b) {
    this._verify2(a, b);
    return this.imod(a.imul(b));
  };

  Red.prototype.mul = function mul (a, b) {
    this._verify2(a, b);
    return this.imod(a.mul(b));
  };

  Red.prototype.isqr = function isqr (a) {
    return this.imul(a, a.clone());
  };

  Red.prototype.sqr = function sqr (a) {
    return this.mul(a, a);
  };

  Red.prototype.sqrt = function sqrt (a) {
    if (a.isZero()) return a.clone();

    var mod3 = this.m.andln(3);
    assert(mod3 % 2 === 1);

    // Fast case
    if (mod3 === 3) {
      var pow = this.m.add(new BN(1)).iushrn(2);
      return this.pow(a, pow);
    }

    // Tonelli-Shanks algorithm (Totally unoptimized and slow)
    //
    // Find Q and S, that Q * 2 ^ S = (P - 1)
    var q = this.m.subn(1);
    var s = 0;
    while (!q.isZero() && q.andln(1) === 0) {
      s++;
      q.iushrn(1);
    }
    assert(!q.isZero());

    var one = new BN(1).toRed(this);
    var nOne = one.redNeg();

    // Find quadratic non-residue
    // NOTE: Max is such because of generalized Riemann hypothesis.
    var lpow = this.m.subn(1).iushrn(1);
    var z = this.m.bitLength();
    z = new BN(2 * z * z).toRed(this);

    while (this.pow(z, lpow).cmp(nOne) !== 0) {
      z.redIAdd(nOne);
    }

    var c = this.pow(z, q);
    var r = this.pow(a, q.addn(1).iushrn(1));
    var t = this.pow(a, q);
    var m = s;
    while (t.cmp(one) !== 0) {
      var tmp = t;
      for (var i = 0; tmp.cmp(one) !== 0; i++) {
        tmp = tmp.redSqr();
      }
      assert(i < m);
      var b = this.pow(c, new BN(1).iushln(m - i - 1));

      r = r.redMul(b);
      c = b.redSqr();
      t = t.redMul(c);
      m = i;
    }

    return r;
  };

  Red.prototype.invm = function invm (a) {
    var inv = a._invmp(this.m);
    if (inv.negative !== 0) {
      inv.negative = 0;
      return this.imod(inv).redNeg();
    } else {
      return this.imod(inv);
    }
  };

  Red.prototype.pow = function pow (a, num) {
    if (num.isZero()) return new BN(1).toRed(this);
    if (num.cmpn(1) === 0) return a.clone();

    var windowSize = 4;
    var wnd = new Array(1 << windowSize);
    wnd[0] = new BN(1).toRed(this);
    wnd[1] = a;
    for (var i = 2; i < wnd.length; i++) {
      wnd[i] = this.mul(wnd[i - 1], a);
    }

    var res = wnd[0];
    var current = 0;
    var currentLen = 0;
    var start = num.bitLength() % 26;
    if (start === 0) {
      start = 26;
    }

    for (i = num.length - 1; i >= 0; i--) {
      var word = num.words[i];
      for (var j = start - 1; j >= 0; j--) {
        var bit = (word >> j) & 1;
        if (res !== wnd[0]) {
          res = this.sqr(res);
        }

        if (bit === 0 && current === 0) {
          currentLen = 0;
          continue;
        }

        current <<= 1;
        current |= bit;
        currentLen++;
        if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;

        res = this.mul(res, wnd[current]);
        currentLen = 0;
        current = 0;
      }
      start = 26;
    }

    return res;
  };

  Red.prototype.convertTo = function convertTo (num) {
    var r = num.umod(this.m);

    return r === num ? r.clone() : r;
  };

  Red.prototype.convertFrom = function convertFrom (num) {
    var res = num.clone();
    res.red = null;
    return res;
  };

  //
  // Montgomery method engine
  //

  BN.mont = function mont (num) {
    return new Mont(num);
  };

  function Mont (m) {
    Red.call(this, m);

    this.shift = this.m.bitLength();
    if (this.shift % 26 !== 0) {
      this.shift += 26 - (this.shift % 26);
    }

    this.r = new BN(1).iushln(this.shift);
    this.r2 = this.imod(this.r.sqr());
    this.rinv = this.r._invmp(this.m);

    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
    this.minv = this.minv.umod(this.r);
    this.minv = this.r.sub(this.minv);
  }
  inherits(Mont, Red);

  Mont.prototype.convertTo = function convertTo (num) {
    return this.imod(num.ushln(this.shift));
  };

  Mont.prototype.convertFrom = function convertFrom (num) {
    var r = this.imod(num.mul(this.rinv));
    r.red = null;
    return r;
  };

  Mont.prototype.imul = function imul (a, b) {
    if (a.isZero() || b.isZero()) {
      a.words[0] = 0;
      a.length = 1;
      return a;
    }

    var t = a.imul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;

    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.mul = function mul (a, b) {
    if (a.isZero() || b.isZero()) return new BN(0)._forceRed(this);

    var t = a.mul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;
    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.invm = function invm (a) {
    // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
    var res = this.imod(a._invmp(this.m).mul(this.r2));
    return res._forceRed(this);
  };
})(typeof module === 'undefined' || module, this);

},{"buffer":22}],22:[function(require,module,exports){

},{}],23:[function(require,module,exports){
(function (Buffer){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this,require("buffer").Buffer)
},{"base64-js":19,"buffer":23,"ieee754":354}],24:[function(require,module,exports){
require('../../modules/core.regexp.escape');
module.exports = require('../../modules/_core').RegExp.escape;

},{"../../modules/_core":46,"../../modules/core.regexp.escape":154}],25:[function(require,module,exports){
module.exports = function (it) {
  if (typeof it != 'function') throw TypeError(it + ' is not a function!');
  return it;
};

},{}],26:[function(require,module,exports){
var cof = require('./_cof');
module.exports = function (it, msg) {
  if (typeof it != 'number' && cof(it) != 'Number') throw TypeError(msg);
  return +it;
};

},{"./_cof":41}],27:[function(require,module,exports){
// 22.1.3.31 Array.prototype[@@unscopables]
var UNSCOPABLES = require('./_wks')('unscopables');
var ArrayProto = Array.prototype;
if (ArrayProto[UNSCOPABLES] == undefined) require('./_hide')(ArrayProto, UNSCOPABLES, {});
module.exports = function (key) {
  ArrayProto[UNSCOPABLES][key] = true;
};

},{"./_hide":66,"./_wks":152}],28:[function(require,module,exports){
'use strict';
var at = require('./_string-at')(true);

 // `AdvanceStringIndex` abstract operation
// https://tc39.github.io/ecma262/#sec-advancestringindex
module.exports = function (S, index, unicode) {
  return index + (unicode ? at(S, index).length : 1);
};

},{"./_string-at":129}],29:[function(require,module,exports){
module.exports = function (it, Constructor, name, forbiddenField) {
  if (!(it instanceof Constructor) || (forbiddenField !== undefined && forbiddenField in it)) {
    throw TypeError(name + ': incorrect invocation!');
  } return it;
};

},{}],30:[function(require,module,exports){
var isObject = require('./_is-object');
module.exports = function (it) {
  if (!isObject(it)) throw TypeError(it + ' is not an object!');
  return it;
};

},{"./_is-object":75}],31:[function(require,module,exports){
// 22.1.3.3 Array.prototype.copyWithin(target, start, end = this.length)
'use strict';
var toObject = require('./_to-object');
var toAbsoluteIndex = require('./_to-absolute-index');
var toLength = require('./_to-length');

module.exports = [].copyWithin || function copyWithin(target /* = 0 */, start /* = 0, end = @length */) {
  var O = toObject(this);
  var len = toLength(O.length);
  var to = toAbsoluteIndex(target, len);
  var from = toAbsoluteIndex(start, len);
  var end = arguments.length > 2 ? arguments[2] : undefined;
  var count = Math.min((end === undefined ? len : toAbsoluteIndex(end, len)) - from, len - to);
  var inc = 1;
  if (from < to && to < from + count) {
    inc = -1;
    from += count - 1;
    to += count - 1;
  }
  while (count-- > 0) {
    if (from in O) O[to] = O[from];
    else delete O[to];
    to += inc;
    from += inc;
  } return O;
};

},{"./_to-absolute-index":137,"./_to-length":141,"./_to-object":142}],32:[function(require,module,exports){
// 22.1.3.6 Array.prototype.fill(value, start = 0, end = this.length)
'use strict';
var toObject = require('./_to-object');
var toAbsoluteIndex = require('./_to-absolute-index');
var toLength = require('./_to-length');
module.exports = function fill(value /* , start = 0, end = @length */) {
  var O = toObject(this);
  var length = toLength(O.length);
  var aLen = arguments.length;
  var index = toAbsoluteIndex(aLen > 1 ? arguments[1] : undefined, length);
  var end = aLen > 2 ? arguments[2] : undefined;
  var endPos = end === undefined ? length : toAbsoluteIndex(end, length);
  while (endPos > index) O[index++] = value;
  return O;
};

},{"./_to-absolute-index":137,"./_to-length":141,"./_to-object":142}],33:[function(require,module,exports){
var forOf = require('./_for-of');

module.exports = function (iter, ITERATOR) {
  var result = [];
  forOf(iter, false, result.push, result, ITERATOR);
  return result;
};

},{"./_for-of":62}],34:[function(require,module,exports){
// false -> Array#indexOf
// true  -> Array#includes
var toIObject = require('./_to-iobject');
var toLength = require('./_to-length');
var toAbsoluteIndex = require('./_to-absolute-index');
module.exports = function (IS_INCLUDES) {
  return function ($this, el, fromIndex) {
    var O = toIObject($this);
    var length = toLength(O.length);
    var index = toAbsoluteIndex(fromIndex, length);
    var value;
    // Array#includes uses SameValueZero equality algorithm
    // eslint-disable-next-line no-self-compare
    if (IS_INCLUDES && el != el) while (length > index) {
      value = O[index++];
      // eslint-disable-next-line no-self-compare
      if (value != value) return true;
    // Array#indexOf ignores holes, Array#includes - not
    } else for (;length > index; index++) if (IS_INCLUDES || index in O) {
      if (O[index] === el) return IS_INCLUDES || index || 0;
    } return !IS_INCLUDES && -1;
  };
};

},{"./_to-absolute-index":137,"./_to-iobject":140,"./_to-length":141}],35:[function(require,module,exports){
// 0 -> Array#forEach
// 1 -> Array#map
// 2 -> Array#filter
// 3 -> Array#some
// 4 -> Array#every
// 5 -> Array#find
// 6 -> Array#findIndex
var ctx = require('./_ctx');
var IObject = require('./_iobject');
var toObject = require('./_to-object');
var toLength = require('./_to-length');
var asc = require('./_array-species-create');
module.exports = function (TYPE, $create) {
  var IS_MAP = TYPE == 1;
  var IS_FILTER = TYPE == 2;
  var IS_SOME = TYPE == 3;
  var IS_EVERY = TYPE == 4;
  var IS_FIND_INDEX = TYPE == 6;
  var NO_HOLES = TYPE == 5 || IS_FIND_INDEX;
  var create = $create || asc;
  return function ($this, callbackfn, that) {
    var O = toObject($this);
    var self = IObject(O);
    var f = ctx(callbackfn, that, 3);
    var length = toLength(self.length);
    var index = 0;
    var result = IS_MAP ? create($this, length) : IS_FILTER ? create($this, 0) : undefined;
    var val, res;
    for (;length > index; index++) if (NO_HOLES || index in self) {
      val = self[index];
      res = f(val, index, O);
      if (TYPE) {
        if (IS_MAP) result[index] = res;   // map
        else if (res) switch (TYPE) {
          case 3: return true;             // some
          case 5: return val;              // find
          case 6: return index;            // findIndex
          case 2: result.push(val);        // filter
        } else if (IS_EVERY) return false; // every
      }
    }
    return IS_FIND_INDEX ? -1 : IS_SOME || IS_EVERY ? IS_EVERY : result;
  };
};

},{"./_array-species-create":38,"./_ctx":48,"./_iobject":71,"./_to-length":141,"./_to-object":142}],36:[function(require,module,exports){
var aFunction = require('./_a-function');
var toObject = require('./_to-object');
var IObject = require('./_iobject');
var toLength = require('./_to-length');

module.exports = function (that, callbackfn, aLen, memo, isRight) {
  aFunction(callbackfn);
  var O = toObject(that);
  var self = IObject(O);
  var length = toLength(O.length);
  var index = isRight ? length - 1 : 0;
  var i = isRight ? -1 : 1;
  if (aLen < 2) for (;;) {
    if (index in self) {
      memo = self[index];
      index += i;
      break;
    }
    index += i;
    if (isRight ? index < 0 : length <= index) {
      throw TypeError('Reduce of empty array with no initial value');
    }
  }
  for (;isRight ? index >= 0 : length > index; index += i) if (index in self) {
    memo = callbackfn(memo, self[index], index, O);
  }
  return memo;
};

},{"./_a-function":25,"./_iobject":71,"./_to-length":141,"./_to-object":142}],37:[function(require,module,exports){
var isObject = require('./_is-object');
var isArray = require('./_is-array');
var SPECIES = require('./_wks')('species');

module.exports = function (original) {
  var C;
  if (isArray(original)) {
    C = original.constructor;
    // cross-realm fallback
    if (typeof C == 'function' && (C === Array || isArray(C.prototype))) C = undefined;
    if (isObject(C)) {
      C = C[SPECIES];
      if (C === null) C = undefined;
    }
  } return C === undefined ? Array : C;
};

},{"./_is-array":73,"./_is-object":75,"./_wks":152}],38:[function(require,module,exports){
// 9.4.2.3 ArraySpeciesCreate(originalArray, length)
var speciesConstructor = require('./_array-species-constructor');

module.exports = function (original, length) {
  return new (speciesConstructor(original))(length);
};

},{"./_array-species-constructor":37}],39:[function(require,module,exports){
'use strict';
var aFunction = require('./_a-function');
var isObject = require('./_is-object');
var invoke = require('./_invoke');
var arraySlice = [].slice;
var factories = {};

var construct = function (F, len, args) {
  if (!(len in factories)) {
    for (var n = [], i = 0; i < len; i++) n[i] = 'a[' + i + ']';
    // eslint-disable-next-line no-new-func
    factories[len] = Function('F,a', 'return new F(' + n.join(',') + ')');
  } return factories[len](F, args);
};

module.exports = Function.bind || function bind(that /* , ...args */) {
  var fn = aFunction(this);
  var partArgs = arraySlice.call(arguments, 1);
  var bound = function (/* args... */) {
    var args = partArgs.concat(arraySlice.call(arguments));
    return this instanceof bound ? construct(fn, args.length, args) : invoke(fn, args, that);
  };
  if (isObject(fn.prototype)) bound.prototype = fn.prototype;
  return bound;
};

},{"./_a-function":25,"./_invoke":70,"./_is-object":75}],40:[function(require,module,exports){
// getting tag from 19.1.3.6 Object.prototype.toString()
var cof = require('./_cof');
var TAG = require('./_wks')('toStringTag');
// ES3 wrong here
var ARG = cof(function () { return arguments; }()) == 'Arguments';

// fallback for IE11 Script Access Denied error
var tryGet = function (it, key) {
  try {
    return it[key];
  } catch (e) { /* empty */ }
};

module.exports = function (it) {
  var O, T, B;
  return it === undefined ? 'Undefined' : it === null ? 'Null'
    // @@toStringTag case
    : typeof (T = tryGet(O = Object(it), TAG)) == 'string' ? T
    // builtinTag case
    : ARG ? cof(O)
    // ES3 arguments fallback
    : (B = cof(O)) == 'Object' && typeof O.callee == 'function' ? 'Arguments' : B;
};

},{"./_cof":41,"./_wks":152}],41:[function(require,module,exports){
var toString = {}.toString;

module.exports = function (it) {
  return toString.call(it).slice(8, -1);
};

},{}],42:[function(require,module,exports){
'use strict';
var dP = require('./_object-dp').f;
var create = require('./_object-create');
var redefineAll = require('./_redefine-all');
var ctx = require('./_ctx');
var anInstance = require('./_an-instance');
var forOf = require('./_for-of');
var $iterDefine = require('./_iter-define');
var step = require('./_iter-step');
var setSpecies = require('./_set-species');
var DESCRIPTORS = require('./_descriptors');
var fastKey = require('./_meta').fastKey;
var validate = require('./_validate-collection');
var SIZE = DESCRIPTORS ? '_s' : 'size';

var getEntry = function (that, key) {
  // fast case
  var index = fastKey(key);
  var entry;
  if (index !== 'F') return that._i[index];
  // frozen object case
  for (entry = that._f; entry; entry = entry.n) {
    if (entry.k == key) return entry;
  }
};

module.exports = {
  getConstructor: function (wrapper, NAME, IS_MAP, ADDER) {
    var C = wrapper(function (that, iterable) {
      anInstance(that, C, NAME, '_i');
      that._t = NAME;         // collection type
      that._i = create(null); // index
      that._f = undefined;    // first entry
      that._l = undefined;    // last entry
      that[SIZE] = 0;         // size
      if (iterable != undefined) forOf(iterable, IS_MAP, that[ADDER], that);
    });
    redefineAll(C.prototype, {
      // 23.1.3.1 Map.prototype.clear()
      // 23.2.3.2 Set.prototype.clear()
      clear: function clear() {
        for (var that = validate(this, NAME), data = that._i, entry = that._f; entry; entry = entry.n) {
          entry.r = true;
          if (entry.p) entry.p = entry.p.n = undefined;
          delete data[entry.i];
        }
        that._f = that._l = undefined;
        that[SIZE] = 0;
      },
      // 23.1.3.3 Map.prototype.delete(key)
      // 23.2.3.4 Set.prototype.delete(value)
      'delete': function (key) {
        var that = validate(this, NAME);
        var entry = getEntry(that, key);
        if (entry) {
          var next = entry.n;
          var prev = entry.p;
          delete that._i[entry.i];
          entry.r = true;
          if (prev) prev.n = next;
          if (next) next.p = prev;
          if (that._f == entry) that._f = next;
          if (that._l == entry) that._l = prev;
          that[SIZE]--;
        } return !!entry;
      },
      // 23.2.3.6 Set.prototype.forEach(callbackfn, thisArg = undefined)
      // 23.1.3.5 Map.prototype.forEach(callbackfn, thisArg = undefined)
      forEach: function forEach(callbackfn /* , that = undefined */) {
        validate(this, NAME);
        var f = ctx(callbackfn, arguments.length > 1 ? arguments[1] : undefined, 3);
        var entry;
        while (entry = entry ? entry.n : this._f) {
          f(entry.v, entry.k, this);
          // revert to the last existing entry
          while (entry && entry.r) entry = entry.p;
        }
      },
      // 23.1.3.7 Map.prototype.has(key)
      // 23.2.3.7 Set.prototype.has(value)
      has: function has(key) {
        return !!getEntry(validate(this, NAME), key);
      }
    });
    if (DESCRIPTORS) dP(C.prototype, 'size', {
      get: function () {
        return validate(this, NAME)[SIZE];
      }
    });
    return C;
  },
  def: function (that, key, value) {
    var entry = getEntry(that, key);
    var prev, index;
    // change existing entry
    if (entry) {
      entry.v = value;
    // create new entry
    } else {
      that._l = entry = {
        i: index = fastKey(key, true), // <- index
        k: key,                        // <- key
        v: value,                      // <- value
        p: prev = that._l,             // <- previous entry
        n: undefined,                  // <- next entry
        r: false                       // <- removed
      };
      if (!that._f) that._f = entry;
      if (prev) prev.n = entry;
      that[SIZE]++;
      // add to index
      if (index !== 'F') that._i[index] = entry;
    } return that;
  },
  getEntry: getEntry,
  setStrong: function (C, NAME, IS_MAP) {
    // add .keys, .values, .entries, [@@iterator]
    // 23.1.3.4, 23.1.3.8, 23.1.3.11, 23.1.3.12, 23.2.3.5, 23.2.3.8, 23.2.3.10, 23.2.3.11
    $iterDefine(C, NAME, function (iterated, kind) {
      this._t = validate(iterated, NAME); // target
      this._k = kind;                     // kind
      this._l = undefined;                // previous
    }, function () {
      var that = this;
      var kind = that._k;
      var entry = that._l;
      // revert to the last existing entry
      while (entry && entry.r) entry = entry.p;
      // get next entry
      if (!that._t || !(that._l = entry = entry ? entry.n : that._t._f)) {
        // or finish the iteration
        that._t = undefined;
        return step(1);
      }
      // return step by kind
      if (kind == 'keys') return step(0, entry.k);
      if (kind == 'values') return step(0, entry.v);
      return step(0, [entry.k, entry.v]);
    }, IS_MAP ? 'entries' : 'values', !IS_MAP, true);

    // add [@@species], 23.1.2.2, 23.2.2.2
    setSpecies(NAME);
  }
};

},{"./_an-instance":29,"./_ctx":48,"./_descriptors":52,"./_for-of":62,"./_iter-define":79,"./_iter-step":81,"./_meta":89,"./_object-create":94,"./_object-dp":95,"./_redefine-all":114,"./_set-species":123,"./_validate-collection":149}],43:[function(require,module,exports){
// https://github.com/DavidBruant/Map-Set.prototype.toJSON
var classof = require('./_classof');
var from = require('./_array-from-iterable');
module.exports = function (NAME) {
  return function toJSON() {
    if (classof(this) != NAME) throw TypeError(NAME + "#toJSON isn't generic");
    return from(this);
  };
};

},{"./_array-from-iterable":33,"./_classof":40}],44:[function(require,module,exports){
'use strict';
var redefineAll = require('./_redefine-all');
var getWeak = require('./_meta').getWeak;
var anObject = require('./_an-object');
var isObject = require('./_is-object');
var anInstance = require('./_an-instance');
var forOf = require('./_for-of');
var createArrayMethod = require('./_array-methods');
var $has = require('./_has');
var validate = require('./_validate-collection');
var arrayFind = createArrayMethod(5);
var arrayFindIndex = createArrayMethod(6);
var id = 0;

// fallback for uncaught frozen keys
var uncaughtFrozenStore = function (that) {
  return that._l || (that._l = new UncaughtFrozenStore());
};
var UncaughtFrozenStore = function () {
  this.a = [];
};
var findUncaughtFrozen = function (store, key) {
  return arrayFind(store.a, function (it) {
    return it[0] === key;
  });
};
UncaughtFrozenStore.prototype = {
  get: function (key) {
    var entry = findUncaughtFrozen(this, key);
    if (entry) return entry[1];
  },
  has: function (key) {
    return !!findUncaughtFrozen(this, key);
  },
  set: function (key, value) {
    var entry = findUncaughtFrozen(this, key);
    if (entry) entry[1] = value;
    else this.a.push([key, value]);
  },
  'delete': function (key) {
    var index = arrayFindIndex(this.a, function (it) {
      return it[0] === key;
    });
    if (~index) this.a.splice(index, 1);
    return !!~index;
  }
};

module.exports = {
  getConstructor: function (wrapper, NAME, IS_MAP, ADDER) {
    var C = wrapper(function (that, iterable) {
      anInstance(that, C, NAME, '_i');
      that._t = NAME;      // collection type
      that._i = id++;      // collection id
      that._l = undefined; // leak store for uncaught frozen objects
      if (iterable != undefined) forOf(iterable, IS_MAP, that[ADDER], that);
    });
    redefineAll(C.prototype, {
      // 23.3.3.2 WeakMap.prototype.delete(key)
      // 23.4.3.3 WeakSet.prototype.delete(value)
      'delete': function (key) {
        if (!isObject(key)) return false;
        var data = getWeak(key);
        if (data === true) return uncaughtFrozenStore(validate(this, NAME))['delete'](key);
        return data && $has(data, this._i) && delete data[this._i];
      },
      // 23.3.3.4 WeakMap.prototype.has(key)
      // 23.4.3.4 WeakSet.prototype.has(value)
      has: function has(key) {
        if (!isObject(key)) return false;
        var data = getWeak(key);
        if (data === true) return uncaughtFrozenStore(validate(this, NAME)).has(key);
        return data && $has(data, this._i);
      }
    });
    return C;
  },
  def: function (that, key, value) {
    var data = getWeak(anObject(key), true);
    if (data === true) uncaughtFrozenStore(that).set(key, value);
    else data[that._i] = value;
    return that;
  },
  ufstore: uncaughtFrozenStore
};

},{"./_an-instance":29,"./_an-object":30,"./_array-methods":35,"./_for-of":62,"./_has":65,"./_is-object":75,"./_meta":89,"./_redefine-all":114,"./_validate-collection":149}],45:[function(require,module,exports){
'use strict';
var global = require('./_global');
var $export = require('./_export');
var redefine = require('./_redefine');
var redefineAll = require('./_redefine-all');
var meta = require('./_meta');
var forOf = require('./_for-of');
var anInstance = require('./_an-instance');
var isObject = require('./_is-object');
var fails = require('./_fails');
var $iterDetect = require('./_iter-detect');
var setToStringTag = require('./_set-to-string-tag');
var inheritIfRequired = require('./_inherit-if-required');

module.exports = function (NAME, wrapper, methods, common, IS_MAP, IS_WEAK) {
  var Base = global[NAME];
  var C = Base;
  var ADDER = IS_MAP ? 'set' : 'add';
  var proto = C && C.prototype;
  var O = {};
  var fixMethod = function (KEY) {
    var fn = proto[KEY];
    redefine(proto, KEY,
      KEY == 'delete' ? function (a) {
        return IS_WEAK && !isObject(a) ? false : fn.call(this, a === 0 ? 0 : a);
      } : KEY == 'has' ? function has(a) {
        return IS_WEAK && !isObject(a) ? false : fn.call(this, a === 0 ? 0 : a);
      } : KEY == 'get' ? function get(a) {
        return IS_WEAK && !isObject(a) ? undefined : fn.call(this, a === 0 ? 0 : a);
      } : KEY == 'add' ? function add(a) { fn.call(this, a === 0 ? 0 : a); return this; }
        : function set(a, b) { fn.call(this, a === 0 ? 0 : a, b); return this; }
    );
  };
  if (typeof C != 'function' || !(IS_WEAK || proto.forEach && !fails(function () {
    new C().entries().next();
  }))) {
    // create collection constructor
    C = common.getConstructor(wrapper, NAME, IS_MAP, ADDER);
    redefineAll(C.prototype, methods);
    meta.NEED = true;
  } else {
    var instance = new C();
    // early implementations not supports chaining
    var HASNT_CHAINING = instance[ADDER](IS_WEAK ? {} : -0, 1) != instance;
    // V8 ~  Chromium 40- weak-collections throws on primitives, but should return false
    var THROWS_ON_PRIMITIVES = fails(function () { instance.has(1); });
    // most early implementations doesn't supports iterables, most modern - not close it correctly
    var ACCEPT_ITERABLES = $iterDetect(function (iter) { new C(iter); }); // eslint-disable-line no-new
    // for early implementations -0 and +0 not the same
    var BUGGY_ZERO = !IS_WEAK && fails(function () {
      // V8 ~ Chromium 42- fails only with 5+ elements
      var $instance = new C();
      var index = 5;
      while (index--) $instance[ADDER](index, index);
      return !$instance.has(-0);
    });
    if (!ACCEPT_ITERABLES) {
      C = wrapper(function (target, iterable) {
        anInstance(target, C, NAME);
        var that = inheritIfRequired(new Base(), target, C);
        if (iterable != undefined) forOf(iterable, IS_MAP, that[ADDER], that);
        return that;
      });
      C.prototype = proto;
      proto.constructor = C;
    }
    if (THROWS_ON_PRIMITIVES || BUGGY_ZERO) {
      fixMethod('delete');
      fixMethod('has');
      IS_MAP && fixMethod('get');
    }
    if (BUGGY_ZERO || HASNT_CHAINING) fixMethod(ADDER);
    // weak collections should not contains .clear method
    if (IS_WEAK && proto.clear) delete proto.clear;
  }

  setToStringTag(C, NAME);

  O[NAME] = C;
  $export($export.G + $export.W + $export.F * (C != Base), O);

  if (!IS_WEAK) common.setStrong(C, NAME, IS_MAP);

  return C;
};

},{"./_an-instance":29,"./_export":56,"./_fails":58,"./_for-of":62,"./_global":64,"./_inherit-if-required":69,"./_is-object":75,"./_iter-detect":80,"./_meta":89,"./_redefine":115,"./_redefine-all":114,"./_set-to-string-tag":124}],46:[function(require,module,exports){
var core = module.exports = { version: '2.6.5' };
if (typeof __e == 'number') __e = core; // eslint-disable-line no-undef

},{}],47:[function(require,module,exports){
'use strict';
var $defineProperty = require('./_object-dp');
var createDesc = require('./_property-desc');

module.exports = function (object, index, value) {
  if (index in object) $defineProperty.f(object, index, createDesc(0, value));
  else object[index] = value;
};

},{"./_object-dp":95,"./_property-desc":113}],48:[function(require,module,exports){
// optional / simple context binding
var aFunction = require('./_a-function');
module.exports = function (fn, that, length) {
  aFunction(fn);
  if (that === undefined) return fn;
  switch (length) {
    case 1: return function (a) {
      return fn.call(that, a);
    };
    case 2: return function (a, b) {
      return fn.call(that, a, b);
    };
    case 3: return function (a, b, c) {
      return fn.call(that, a, b, c);
    };
  }
  return function (/* ...args */) {
    return fn.apply(that, arguments);
  };
};

},{"./_a-function":25}],49:[function(require,module,exports){
'use strict';
// 20.3.4.36 / 15.9.5.43 Date.prototype.toISOString()
var fails = require('./_fails');
var getTime = Date.prototype.getTime;
var $toISOString = Date.prototype.toISOString;

var lz = function (num) {
  return num > 9 ? num : '0' + num;
};

// PhantomJS / old WebKit has a broken implementations
module.exports = (fails(function () {
  return $toISOString.call(new Date(-5e13 - 1)) != '0385-07-25T07:06:39.999Z';
}) || !fails(function () {
  $toISOString.call(new Date(NaN));
})) ? function toISOString() {
  if (!isFinite(getTime.call(this))) throw RangeError('Invalid time value');
  var d = this;
  var y = d.getUTCFullYear();
  var m = d.getUTCMilliseconds();
  var s = y < 0 ? '-' : y > 9999 ? '+' : '';
  return s + ('00000' + Math.abs(y)).slice(s ? -6 : -4) +
    '-' + lz(d.getUTCMonth() + 1) + '-' + lz(d.getUTCDate()) +
    'T' + lz(d.getUTCHours()) + ':' + lz(d.getUTCMinutes()) +
    ':' + lz(d.getUTCSeconds()) + '.' + (m > 99 ? m : '0' + lz(m)) + 'Z';
} : $toISOString;

},{"./_fails":58}],50:[function(require,module,exports){
'use strict';
var anObject = require('./_an-object');
var toPrimitive = require('./_to-primitive');
var NUMBER = 'number';

module.exports = function (hint) {
  if (hint !== 'string' && hint !== NUMBER && hint !== 'default') throw TypeError('Incorrect hint');
  return toPrimitive(anObject(this), hint != NUMBER);
};

},{"./_an-object":30,"./_to-primitive":143}],51:[function(require,module,exports){
// 7.2.1 RequireObjectCoercible(argument)
module.exports = function (it) {
  if (it == undefined) throw TypeError("Can't call method on  " + it);
  return it;
};

},{}],52:[function(require,module,exports){
// Thank's IE8 for his funny defineProperty
module.exports = !require('./_fails')(function () {
  return Object.defineProperty({}, 'a', { get: function () { return 7; } }).a != 7;
});

},{"./_fails":58}],53:[function(require,module,exports){
var isObject = require('./_is-object');
var document = require('./_global').document;
// typeof document.createElement is 'object' in old IE
var is = isObject(document) && isObject(document.createElement);
module.exports = function (it) {
  return is ? document.createElement(it) : {};
};

},{"./_global":64,"./_is-object":75}],54:[function(require,module,exports){
// IE 8- don't enum bug keys
module.exports = (
  'constructor,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,toLocaleString,toString,valueOf'
).split(',');

},{}],55:[function(require,module,exports){
// all enumerable object keys, includes symbols
var getKeys = require('./_object-keys');
var gOPS = require('./_object-gops');
var pIE = require('./_object-pie');
module.exports = function (it) {
  var result = getKeys(it);
  var getSymbols = gOPS.f;
  if (getSymbols) {
    var symbols = getSymbols(it);
    var isEnum = pIE.f;
    var i = 0;
    var key;
    while (symbols.length > i) if (isEnum.call(it, key = symbols[i++])) result.push(key);
  } return result;
};

},{"./_object-gops":101,"./_object-keys":104,"./_object-pie":105}],56:[function(require,module,exports){
var global = require('./_global');
var core = require('./_core');
var hide = require('./_hide');
var redefine = require('./_redefine');
var ctx = require('./_ctx');
var PROTOTYPE = 'prototype';

var $export = function (type, name, source) {
  var IS_FORCED = type & $export.F;
  var IS_GLOBAL = type & $export.G;
  var IS_STATIC = type & $export.S;
  var IS_PROTO = type & $export.P;
  var IS_BIND = type & $export.B;
  var target = IS_GLOBAL ? global : IS_STATIC ? global[name] || (global[name] = {}) : (global[name] || {})[PROTOTYPE];
  var exports = IS_GLOBAL ? core : core[name] || (core[name] = {});
  var expProto = exports[PROTOTYPE] || (exports[PROTOTYPE] = {});
  var key, own, out, exp;
  if (IS_GLOBAL) source = name;
  for (key in source) {
    // contains in native
    own = !IS_FORCED && target && target[key] !== undefined;
    // export native or passed
    out = (own ? target : source)[key];
    // bind timers to global for call from export context
    exp = IS_BIND && own ? ctx(out, global) : IS_PROTO && typeof out == 'function' ? ctx(Function.call, out) : out;
    // extend global
    if (target) redefine(target, key, out, type & $export.U);
    // export
    if (exports[key] != out) hide(exports, key, exp);
    if (IS_PROTO && expProto[key] != out) expProto[key] = out;
  }
};
global.core = core;
// type bitmap
$export.F = 1;   // forced
$export.G = 2;   // global
$export.S = 4;   // static
$export.P = 8;   // proto
$export.B = 16;  // bind
$export.W = 32;  // wrap
$export.U = 64;  // safe
$export.R = 128; // real proto method for `library`
module.exports = $export;

},{"./_core":46,"./_ctx":48,"./_global":64,"./_hide":66,"./_redefine":115}],57:[function(require,module,exports){
var MATCH = require('./_wks')('match');
module.exports = function (KEY) {
  var re = /./;
  try {
    '/./'[KEY](re);
  } catch (e) {
    try {
      re[MATCH] = false;
      return !'/./'[KEY](re);
    } catch (f) { /* empty */ }
  } return true;
};

},{"./_wks":152}],58:[function(require,module,exports){
module.exports = function (exec) {
  try {
    return !!exec();
  } catch (e) {
    return true;
  }
};

},{}],59:[function(require,module,exports){
'use strict';
require('./es6.regexp.exec');
var redefine = require('./_redefine');
var hide = require('./_hide');
var fails = require('./_fails');
var defined = require('./_defined');
var wks = require('./_wks');
var regexpExec = require('./_regexp-exec');

var SPECIES = wks('species');

var REPLACE_SUPPORTS_NAMED_GROUPS = !fails(function () {
  // #replace needs built-in support for named groups.
  // #match works fine because it just return the exec results, even if it has
  // a "grops" property.
  var re = /./;
  re.exec = function () {
    var result = [];
    result.groups = { a: '7' };
    return result;
  };
  return ''.replace(re, '$<a>') !== '7';
});

var SPLIT_WORKS_WITH_OVERWRITTEN_EXEC = (function () {
  // Chrome 51 has a buggy "split" implementation when RegExp#exec !== nativeExec
  var re = /(?:)/;
  var originalExec = re.exec;
  re.exec = function () { return originalExec.apply(this, arguments); };
  var result = 'ab'.split(re);
  return result.length === 2 && result[0] === 'a' && result[1] === 'b';
})();

module.exports = function (KEY, length, exec) {
  var SYMBOL = wks(KEY);

  var DELEGATES_TO_SYMBOL = !fails(function () {
    // String methods call symbol-named RegEp methods
    var O = {};
    O[SYMBOL] = function () { return 7; };
    return ''[KEY](O) != 7;
  });

  var DELEGATES_TO_EXEC = DELEGATES_TO_SYMBOL ? !fails(function () {
    // Symbol-named RegExp methods call .exec
    var execCalled = false;
    var re = /a/;
    re.exec = function () { execCalled = true; return null; };
    if (KEY === 'split') {
      // RegExp[@@split] doesn't call the regex's exec method, but first creates
      // a new one. We need to return the patched regex when creating the new one.
      re.constructor = {};
      re.constructor[SPECIES] = function () { return re; };
    }
    re[SYMBOL]('');
    return !execCalled;
  }) : undefined;

  if (
    !DELEGATES_TO_SYMBOL ||
    !DELEGATES_TO_EXEC ||
    (KEY === 'replace' && !REPLACE_SUPPORTS_NAMED_GROUPS) ||
    (KEY === 'split' && !SPLIT_WORKS_WITH_OVERWRITTEN_EXEC)
  ) {
    var nativeRegExpMethod = /./[SYMBOL];
    var fns = exec(
      defined,
      SYMBOL,
      ''[KEY],
      function maybeCallNative(nativeMethod, regexp, str, arg2, forceStringMethod) {
        if (regexp.exec === regexpExec) {
          if (DELEGATES_TO_SYMBOL && !forceStringMethod) {
            // The native String method already delegates to @@method (this
            // polyfilled function), leasing to infinite recursion.
            // We avoid it by directly calling the native @@method method.
            return { done: true, value: nativeRegExpMethod.call(regexp, str, arg2) };
          }
          return { done: true, value: nativeMethod.call(str, regexp, arg2) };
        }
        return { done: false };
      }
    );
    var strfn = fns[0];
    var rxfn = fns[1];

    redefine(String.prototype, KEY, strfn);
    hide(RegExp.prototype, SYMBOL, length == 2
      // 21.2.5.8 RegExp.prototype[@@replace](string, replaceValue)
      // 21.2.5.11 RegExp.prototype[@@split](string, limit)
      ? function (string, arg) { return rxfn.call(string, this, arg); }
      // 21.2.5.6 RegExp.prototype[@@match](string)
      // 21.2.5.9 RegExp.prototype[@@search](string)
      : function (string) { return rxfn.call(string, this); }
    );
  }
};

},{"./_defined":51,"./_fails":58,"./_hide":66,"./_redefine":115,"./_regexp-exec":117,"./_wks":152,"./es6.regexp.exec":249}],60:[function(require,module,exports){
'use strict';
// 21.2.5.3 get RegExp.prototype.flags
var anObject = require('./_an-object');
module.exports = function () {
  var that = anObject(this);
  var result = '';
  if (that.global) result += 'g';
  if (that.ignoreCase) result += 'i';
  if (that.multiline) result += 'm';
  if (that.unicode) result += 'u';
  if (that.sticky) result += 'y';
  return result;
};

},{"./_an-object":30}],61:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-flatMap/#sec-FlattenIntoArray
var isArray = require('./_is-array');
var isObject = require('./_is-object');
var toLength = require('./_to-length');
var ctx = require('./_ctx');
var IS_CONCAT_SPREADABLE = require('./_wks')('isConcatSpreadable');

function flattenIntoArray(target, original, source, sourceLen, start, depth, mapper, thisArg) {
  var targetIndex = start;
  var sourceIndex = 0;
  var mapFn = mapper ? ctx(mapper, thisArg, 3) : false;
  var element, spreadable;

  while (sourceIndex < sourceLen) {
    if (sourceIndex in source) {
      element = mapFn ? mapFn(source[sourceIndex], sourceIndex, original) : source[sourceIndex];

      spreadable = false;
      if (isObject(element)) {
        spreadable = element[IS_CONCAT_SPREADABLE];
        spreadable = spreadable !== undefined ? !!spreadable : isArray(element);
      }

      if (spreadable && depth > 0) {
        targetIndex = flattenIntoArray(target, original, element, toLength(element.length), targetIndex, depth - 1) - 1;
      } else {
        if (targetIndex >= 0x1fffffffffffff) throw TypeError();
        target[targetIndex] = element;
      }

      targetIndex++;
    }
    sourceIndex++;
  }
  return targetIndex;
}

module.exports = flattenIntoArray;

},{"./_ctx":48,"./_is-array":73,"./_is-object":75,"./_to-length":141,"./_wks":152}],62:[function(require,module,exports){
var ctx = require('./_ctx');
var call = require('./_iter-call');
var isArrayIter = require('./_is-array-iter');
var anObject = require('./_an-object');
var toLength = require('./_to-length');
var getIterFn = require('./core.get-iterator-method');
var BREAK = {};
var RETURN = {};
var exports = module.exports = function (iterable, entries, fn, that, ITERATOR) {
  var iterFn = ITERATOR ? function () { return iterable; } : getIterFn(iterable);
  var f = ctx(fn, that, entries ? 2 : 1);
  var index = 0;
  var length, step, iterator, result;
  if (typeof iterFn != 'function') throw TypeError(iterable + ' is not iterable!');
  // fast case for arrays with default iterator
  if (isArrayIter(iterFn)) for (length = toLength(iterable.length); length > index; index++) {
    result = entries ? f(anObject(step = iterable[index])[0], step[1]) : f(iterable[index]);
    if (result === BREAK || result === RETURN) return result;
  } else for (iterator = iterFn.call(iterable); !(step = iterator.next()).done;) {
    result = call(iterator, f, step.value, entries);
    if (result === BREAK || result === RETURN) return result;
  }
};
exports.BREAK = BREAK;
exports.RETURN = RETURN;

},{"./_an-object":30,"./_ctx":48,"./_is-array-iter":72,"./_iter-call":77,"./_to-length":141,"./core.get-iterator-method":153}],63:[function(require,module,exports){
module.exports = require('./_shared')('native-function-to-string', Function.toString);

},{"./_shared":126}],64:[function(require,module,exports){
// https://github.com/zloirock/core-js/issues/86#issuecomment-115759028
var global = module.exports = typeof window != 'undefined' && window.Math == Math
  ? window : typeof self != 'undefined' && self.Math == Math ? self
  // eslint-disable-next-line no-new-func
  : Function('return this')();
if (typeof __g == 'number') __g = global; // eslint-disable-line no-undef

},{}],65:[function(require,module,exports){
var hasOwnProperty = {}.hasOwnProperty;
module.exports = function (it, key) {
  return hasOwnProperty.call(it, key);
};

},{}],66:[function(require,module,exports){
var dP = require('./_object-dp');
var createDesc = require('./_property-desc');
module.exports = require('./_descriptors') ? function (object, key, value) {
  return dP.f(object, key, createDesc(1, value));
} : function (object, key, value) {
  object[key] = value;
  return object;
};

},{"./_descriptors":52,"./_object-dp":95,"./_property-desc":113}],67:[function(require,module,exports){
var document = require('./_global').document;
module.exports = document && document.documentElement;

},{"./_global":64}],68:[function(require,module,exports){
module.exports = !require('./_descriptors') && !require('./_fails')(function () {
  return Object.defineProperty(require('./_dom-create')('div'), 'a', { get: function () { return 7; } }).a != 7;
});

},{"./_descriptors":52,"./_dom-create":53,"./_fails":58}],69:[function(require,module,exports){
var isObject = require('./_is-object');
var setPrototypeOf = require('./_set-proto').set;
module.exports = function (that, target, C) {
  var S = target.constructor;
  var P;
  if (S !== C && typeof S == 'function' && (P = S.prototype) !== C.prototype && isObject(P) && setPrototypeOf) {
    setPrototypeOf(that, P);
  } return that;
};

},{"./_is-object":75,"./_set-proto":122}],70:[function(require,module,exports){
// fast apply, http://jsperf.lnkit.com/fast-apply/5
module.exports = function (fn, args, that) {
  var un = that === undefined;
  switch (args.length) {
    case 0: return un ? fn()
                      : fn.call(that);
    case 1: return un ? fn(args[0])
                      : fn.call(that, args[0]);
    case 2: return un ? fn(args[0], args[1])
                      : fn.call(that, args[0], args[1]);
    case 3: return un ? fn(args[0], args[1], args[2])
                      : fn.call(that, args[0], args[1], args[2]);
    case 4: return un ? fn(args[0], args[1], args[2], args[3])
                      : fn.call(that, args[0], args[1], args[2], args[3]);
  } return fn.apply(that, args);
};

},{}],71:[function(require,module,exports){
// fallback for non-array-like ES3 and non-enumerable old V8 strings
var cof = require('./_cof');
// eslint-disable-next-line no-prototype-builtins
module.exports = Object('z').propertyIsEnumerable(0) ? Object : function (it) {
  return cof(it) == 'String' ? it.split('') : Object(it);
};

},{"./_cof":41}],72:[function(require,module,exports){
// check on default Array iterator
var Iterators = require('./_iterators');
var ITERATOR = require('./_wks')('iterator');
var ArrayProto = Array.prototype;

module.exports = function (it) {
  return it !== undefined && (Iterators.Array === it || ArrayProto[ITERATOR] === it);
};

},{"./_iterators":82,"./_wks":152}],73:[function(require,module,exports){
// 7.2.2 IsArray(argument)
var cof = require('./_cof');
module.exports = Array.isArray || function isArray(arg) {
  return cof(arg) == 'Array';
};

},{"./_cof":41}],74:[function(require,module,exports){
// 20.1.2.3 Number.isInteger(number)
var isObject = require('./_is-object');
var floor = Math.floor;
module.exports = function isInteger(it) {
  return !isObject(it) && isFinite(it) && floor(it) === it;
};

},{"./_is-object":75}],75:[function(require,module,exports){
module.exports = function (it) {
  return typeof it === 'object' ? it !== null : typeof it === 'function';
};

},{}],76:[function(require,module,exports){
// 7.2.8 IsRegExp(argument)
var isObject = require('./_is-object');
var cof = require('./_cof');
var MATCH = require('./_wks')('match');
module.exports = function (it) {
  var isRegExp;
  return isObject(it) && ((isRegExp = it[MATCH]) !== undefined ? !!isRegExp : cof(it) == 'RegExp');
};

},{"./_cof":41,"./_is-object":75,"./_wks":152}],77:[function(require,module,exports){
// call something on iterator step with safe closing on error
var anObject = require('./_an-object');
module.exports = function (iterator, fn, value, entries) {
  try {
    return entries ? fn(anObject(value)[0], value[1]) : fn(value);
  // 7.4.6 IteratorClose(iterator, completion)
  } catch (e) {
    var ret = iterator['return'];
    if (ret !== undefined) anObject(ret.call(iterator));
    throw e;
  }
};

},{"./_an-object":30}],78:[function(require,module,exports){
'use strict';
var create = require('./_object-create');
var descriptor = require('./_property-desc');
var setToStringTag = require('./_set-to-string-tag');
var IteratorPrototype = {};

// 25.1.2.1.1 %IteratorPrototype%[@@iterator]()
require('./_hide')(IteratorPrototype, require('./_wks')('iterator'), function () { return this; });

module.exports = function (Constructor, NAME, next) {
  Constructor.prototype = create(IteratorPrototype, { next: descriptor(1, next) });
  setToStringTag(Constructor, NAME + ' Iterator');
};

},{"./_hide":66,"./_object-create":94,"./_property-desc":113,"./_set-to-string-tag":124,"./_wks":152}],79:[function(require,module,exports){
'use strict';
var LIBRARY = require('./_library');
var $export = require('./_export');
var redefine = require('./_redefine');
var hide = require('./_hide');
var Iterators = require('./_iterators');
var $iterCreate = require('./_iter-create');
var setToStringTag = require('./_set-to-string-tag');
var getPrototypeOf = require('./_object-gpo');
var ITERATOR = require('./_wks')('iterator');
var BUGGY = !([].keys && 'next' in [].keys()); // Safari has buggy iterators w/o `next`
var FF_ITERATOR = '@@iterator';
var KEYS = 'keys';
var VALUES = 'values';

var returnThis = function () { return this; };

module.exports = function (Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCED) {
  $iterCreate(Constructor, NAME, next);
  var getMethod = function (kind) {
    if (!BUGGY && kind in proto) return proto[kind];
    switch (kind) {
      case KEYS: return function keys() { return new Constructor(this, kind); };
      case VALUES: return function values() { return new Constructor(this, kind); };
    } return function entries() { return new Constructor(this, kind); };
  };
  var TAG = NAME + ' Iterator';
  var DEF_VALUES = DEFAULT == VALUES;
  var VALUES_BUG = false;
  var proto = Base.prototype;
  var $native = proto[ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT];
  var $default = $native || getMethod(DEFAULT);
  var $entries = DEFAULT ? !DEF_VALUES ? $default : getMethod('entries') : undefined;
  var $anyNative = NAME == 'Array' ? proto.entries || $native : $native;
  var methods, key, IteratorPrototype;
  // Fix native
  if ($anyNative) {
    IteratorPrototype = getPrototypeOf($anyNative.call(new Base()));
    if (IteratorPrototype !== Object.prototype && IteratorPrototype.next) {
      // Set @@toStringTag to native iterators
      setToStringTag(IteratorPrototype, TAG, true);
      // fix for some old engines
      if (!LIBRARY && typeof IteratorPrototype[ITERATOR] != 'function') hide(IteratorPrototype, ITERATOR, returnThis);
    }
  }
  // fix Array#{values, @@iterator}.name in V8 / FF
  if (DEF_VALUES && $native && $native.name !== VALUES) {
    VALUES_BUG = true;
    $default = function values() { return $native.call(this); };
  }
  // Define iterator
  if ((!LIBRARY || FORCED) && (BUGGY || VALUES_BUG || !proto[ITERATOR])) {
    hide(proto, ITERATOR, $default);
  }
  // Plug for library
  Iterators[NAME] = $default;
  Iterators[TAG] = returnThis;
  if (DEFAULT) {
    methods = {
      values: DEF_VALUES ? $default : getMethod(VALUES),
      keys: IS_SET ? $default : getMethod(KEYS),
      entries: $entries
    };
    if (FORCED) for (key in methods) {
      if (!(key in proto)) redefine(proto, key, methods[key]);
    } else $export($export.P + $export.F * (BUGGY || VALUES_BUG), NAME, methods);
  }
  return methods;
};

},{"./_export":56,"./_hide":66,"./_iter-create":78,"./_iterators":82,"./_library":83,"./_object-gpo":102,"./_redefine":115,"./_set-to-string-tag":124,"./_wks":152}],80:[function(require,module,exports){
var ITERATOR = require('./_wks')('iterator');
var SAFE_CLOSING = false;

try {
  var riter = [7][ITERATOR]();
  riter['return'] = function () { SAFE_CLOSING = true; };
  // eslint-disable-next-line no-throw-literal
  Array.from(riter, function () { throw 2; });
} catch (e) { /* empty */ }

module.exports = function (exec, skipClosing) {
  if (!skipClosing && !SAFE_CLOSING) return false;
  var safe = false;
  try {
    var arr = [7];
    var iter = arr[ITERATOR]();
    iter.next = function () { return { done: safe = true }; };
    arr[ITERATOR] = function () { return iter; };
    exec(arr);
  } catch (e) { /* empty */ }
  return safe;
};

},{"./_wks":152}],81:[function(require,module,exports){
module.exports = function (done, value) {
  return { value: value, done: !!done };
};

},{}],82:[function(require,module,exports){
module.exports = {};

},{}],83:[function(require,module,exports){
module.exports = false;

},{}],84:[function(require,module,exports){
// 20.2.2.14 Math.expm1(x)
var $expm1 = Math.expm1;
module.exports = (!$expm1
  // Old FF bug
  || $expm1(10) > 22025.465794806719 || $expm1(10) < 22025.4657948067165168
  // Tor Browser bug
  || $expm1(-2e-17) != -2e-17
) ? function expm1(x) {
  return (x = +x) == 0 ? x : x > -1e-6 && x < 1e-6 ? x + x * x / 2 : Math.exp(x) - 1;
} : $expm1;

},{}],85:[function(require,module,exports){
// 20.2.2.16 Math.fround(x)
var sign = require('./_math-sign');
var pow = Math.pow;
var EPSILON = pow(2, -52);
var EPSILON32 = pow(2, -23);
var MAX32 = pow(2, 127) * (2 - EPSILON32);
var MIN32 = pow(2, -126);

var roundTiesToEven = function (n) {
  return n + 1 / EPSILON - 1 / EPSILON;
};

module.exports = Math.fround || function fround(x) {
  var $abs = Math.abs(x);
  var $sign = sign(x);
  var a, result;
  if ($abs < MIN32) return $sign * roundTiesToEven($abs / MIN32 / EPSILON32) * MIN32 * EPSILON32;
  a = (1 + EPSILON32 / EPSILON) * $abs;
  result = a - (a - $abs);
  // eslint-disable-next-line no-self-compare
  if (result > MAX32 || result != result) return $sign * Infinity;
  return $sign * result;
};

},{"./_math-sign":88}],86:[function(require,module,exports){
// 20.2.2.20 Math.log1p(x)
module.exports = Math.log1p || function log1p(x) {
  return (x = +x) > -1e-8 && x < 1e-8 ? x - x * x / 2 : Math.log(1 + x);
};

},{}],87:[function(require,module,exports){
// https://rwaldron.github.io/proposal-math-extensions/
module.exports = Math.scale || function scale(x, inLow, inHigh, outLow, outHigh) {
  if (
    arguments.length === 0
      // eslint-disable-next-line no-self-compare
      || x != x
      // eslint-disable-next-line no-self-compare
      || inLow != inLow
      // eslint-disable-next-line no-self-compare
      || inHigh != inHigh
      // eslint-disable-next-line no-self-compare
      || outLow != outLow
      // eslint-disable-next-line no-self-compare
      || outHigh != outHigh
  ) return NaN;
  if (x === Infinity || x === -Infinity) return x;
  return (x - inLow) * (outHigh - outLow) / (inHigh - inLow) + outLow;
};

},{}],88:[function(require,module,exports){
// 20.2.2.28 Math.sign(x)
module.exports = Math.sign || function sign(x) {
  // eslint-disable-next-line no-self-compare
  return (x = +x) == 0 || x != x ? x : x < 0 ? -1 : 1;
};

},{}],89:[function(require,module,exports){
var META = require('./_uid')('meta');
var isObject = require('./_is-object');
var has = require('./_has');
var setDesc = require('./_object-dp').f;
var id = 0;
var isExtensible = Object.isExtensible || function () {
  return true;
};
var FREEZE = !require('./_fails')(function () {
  return isExtensible(Object.preventExtensions({}));
});
var setMeta = function (it) {
  setDesc(it, META, { value: {
    i: 'O' + ++id, // object ID
    w: {}          // weak collections IDs
  } });
};
var fastKey = function (it, create) {
  // return primitive with prefix
  if (!isObject(it)) return typeof it == 'symbol' ? it : (typeof it == 'string' ? 'S' : 'P') + it;
  if (!has(it, META)) {
    // can't set metadata to uncaught frozen object
    if (!isExtensible(it)) return 'F';
    // not necessary to add metadata
    if (!create) return 'E';
    // add missing metadata
    setMeta(it);
  // return object ID
  } return it[META].i;
};
var getWeak = function (it, create) {
  if (!has(it, META)) {
    // can't set metadata to uncaught frozen object
    if (!isExtensible(it)) return true;
    // not necessary to add metadata
    if (!create) return false;
    // add missing metadata
    setMeta(it);
  // return hash weak collections IDs
  } return it[META].w;
};
// add metadata on freeze-family methods calling
var onFreeze = function (it) {
  if (FREEZE && meta.NEED && isExtensible(it) && !has(it, META)) setMeta(it);
  return it;
};
var meta = module.exports = {
  KEY: META,
  NEED: false,
  fastKey: fastKey,
  getWeak: getWeak,
  onFreeze: onFreeze
};

},{"./_fails":58,"./_has":65,"./_is-object":75,"./_object-dp":95,"./_uid":147}],90:[function(require,module,exports){
var Map = require('./es6.map');
var $export = require('./_export');
var shared = require('./_shared')('metadata');
var store = shared.store || (shared.store = new (require('./es6.weak-map'))());

var getOrCreateMetadataMap = function (target, targetKey, create) {
  var targetMetadata = store.get(target);
  if (!targetMetadata) {
    if (!create) return undefined;
    store.set(target, targetMetadata = new Map());
  }
  var keyMetadata = targetMetadata.get(targetKey);
  if (!keyMetadata) {
    if (!create) return undefined;
    targetMetadata.set(targetKey, keyMetadata = new Map());
  } return keyMetadata;
};
var ordinaryHasOwnMetadata = function (MetadataKey, O, P) {
  var metadataMap = getOrCreateMetadataMap(O, P, false);
  return metadataMap === undefined ? false : metadataMap.has(MetadataKey);
};
var ordinaryGetOwnMetadata = function (MetadataKey, O, P) {
  var metadataMap = getOrCreateMetadataMap(O, P, false);
  return metadataMap === undefined ? undefined : metadataMap.get(MetadataKey);
};
var ordinaryDefineOwnMetadata = function (MetadataKey, MetadataValue, O, P) {
  getOrCreateMetadataMap(O, P, true).set(MetadataKey, MetadataValue);
};
var ordinaryOwnMetadataKeys = function (target, targetKey) {
  var metadataMap = getOrCreateMetadataMap(target, targetKey, false);
  var keys = [];
  if (metadataMap) metadataMap.forEach(function (_, key) { keys.push(key); });
  return keys;
};
var toMetaKey = function (it) {
  return it === undefined || typeof it == 'symbol' ? it : String(it);
};
var exp = function (O) {
  $export($export.S, 'Reflect', O);
};

module.exports = {
  store: store,
  map: getOrCreateMetadataMap,
  has: ordinaryHasOwnMetadata,
  get: ordinaryGetOwnMetadata,
  set: ordinaryDefineOwnMetadata,
  keys: ordinaryOwnMetadataKeys,
  key: toMetaKey,
  exp: exp
};

},{"./_export":56,"./_shared":126,"./es6.map":184,"./es6.weak-map":291}],91:[function(require,module,exports){
var global = require('./_global');
var macrotask = require('./_task').set;
var Observer = global.MutationObserver || global.WebKitMutationObserver;
var process = global.process;
var Promise = global.Promise;
var isNode = require('./_cof')(process) == 'process';

module.exports = function () {
  var head, last, notify;

  var flush = function () {
    var parent, fn;
    if (isNode && (parent = process.domain)) parent.exit();
    while (head) {
      fn = head.fn;
      head = head.next;
      try {
        fn();
      } catch (e) {
        if (head) notify();
        else last = undefined;
        throw e;
      }
    } last = undefined;
    if (parent) parent.enter();
  };

  // Node.js
  if (isNode) {
    notify = function () {
      process.nextTick(flush);
    };
  // browsers with MutationObserver, except iOS Safari - https://github.com/zloirock/core-js/issues/339
  } else if (Observer && !(global.navigator && global.navigator.standalone)) {
    var toggle = true;
    var node = document.createTextNode('');
    new Observer(flush).observe(node, { characterData: true }); // eslint-disable-line no-new
    notify = function () {
      node.data = toggle = !toggle;
    };
  // environments with maybe non-completely correct, but existent Promise
  } else if (Promise && Promise.resolve) {
    // Promise.resolve without an argument throws an error in LG WebOS 2
    var promise = Promise.resolve(undefined);
    notify = function () {
      promise.then(flush);
    };
  // for other environments - macrotask based on:
  // - setImmediate
  // - MessageChannel
  // - window.postMessag
  // - onreadystatechange
  // - setTimeout
  } else {
    notify = function () {
      // strange IE + webpack dev server bug - use .call(global)
      macrotask.call(global, flush);
    };
  }

  return function (fn) {
    var task = { fn: fn, next: undefined };
    if (last) last.next = task;
    if (!head) {
      head = task;
      notify();
    } last = task;
  };
};

},{"./_cof":41,"./_global":64,"./_task":136}],92:[function(require,module,exports){
'use strict';
// 25.4.1.5 NewPromiseCapability(C)
var aFunction = require('./_a-function');

function PromiseCapability(C) {
  var resolve, reject;
  this.promise = new C(function ($$resolve, $$reject) {
    if (resolve !== undefined || reject !== undefined) throw TypeError('Bad Promise constructor');
    resolve = $$resolve;
    reject = $$reject;
  });
  this.resolve = aFunction(resolve);
  this.reject = aFunction(reject);
}

module.exports.f = function (C) {
  return new PromiseCapability(C);
};

},{"./_a-function":25}],93:[function(require,module,exports){
'use strict';
// 19.1.2.1 Object.assign(target, source, ...)
var getKeys = require('./_object-keys');
var gOPS = require('./_object-gops');
var pIE = require('./_object-pie');
var toObject = require('./_to-object');
var IObject = require('./_iobject');
var $assign = Object.assign;

// should work with symbols and should have deterministic property order (V8 bug)
module.exports = !$assign || require('./_fails')(function () {
  var A = {};
  var B = {};
  // eslint-disable-next-line no-undef
  var S = Symbol();
  var K = 'abcdefghijklmnopqrst';
  A[S] = 7;
  K.split('').forEach(function (k) { B[k] = k; });
  return $assign({}, A)[S] != 7 || Object.keys($assign({}, B)).join('') != K;
}) ? function assign(target, source) { // eslint-disable-line no-unused-vars
  var T = toObject(target);
  var aLen = arguments.length;
  var index = 1;
  var getSymbols = gOPS.f;
  var isEnum = pIE.f;
  while (aLen > index) {
    var S = IObject(arguments[index++]);
    var keys = getSymbols ? getKeys(S).concat(getSymbols(S)) : getKeys(S);
    var length = keys.length;
    var j = 0;
    var key;
    while (length > j) if (isEnum.call(S, key = keys[j++])) T[key] = S[key];
  } return T;
} : $assign;

},{"./_fails":58,"./_iobject":71,"./_object-gops":101,"./_object-keys":104,"./_object-pie":105,"./_to-object":142}],94:[function(require,module,exports){
// 19.1.2.2 / 15.2.3.5 Object.create(O [, Properties])
var anObject = require('./_an-object');
var dPs = require('./_object-dps');
var enumBugKeys = require('./_enum-bug-keys');
var IE_PROTO = require('./_shared-key')('IE_PROTO');
var Empty = function () { /* empty */ };
var PROTOTYPE = 'prototype';

// Create object with fake `null` prototype: use iframe Object with cleared prototype
var createDict = function () {
  // Thrash, waste and sodomy: IE GC bug
  var iframe = require('./_dom-create')('iframe');
  var i = enumBugKeys.length;
  var lt = '<';
  var gt = '>';
  var iframeDocument;
  iframe.style.display = 'none';
  require('./_html').appendChild(iframe);
  iframe.src = 'javascript:'; // eslint-disable-line no-script-url
  // createDict = iframe.contentWindow.Object;
  // html.removeChild(iframe);
  iframeDocument = iframe.contentWindow.document;
  iframeDocument.open();
  iframeDocument.write(lt + 'script' + gt + 'document.F=Object' + lt + '/script' + gt);
  iframeDocument.close();
  createDict = iframeDocument.F;
  while (i--) delete createDict[PROTOTYPE][enumBugKeys[i]];
  return createDict();
};

module.exports = Object.create || function create(O, Properties) {
  var result;
  if (O !== null) {
    Empty[PROTOTYPE] = anObject(O);
    result = new Empty();
    Empty[PROTOTYPE] = null;
    // add "__proto__" for Object.getPrototypeOf polyfill
    result[IE_PROTO] = O;
  } else result = createDict();
  return Properties === undefined ? result : dPs(result, Properties);
};

},{"./_an-object":30,"./_dom-create":53,"./_enum-bug-keys":54,"./_html":67,"./_object-dps":96,"./_shared-key":125}],95:[function(require,module,exports){
var anObject = require('./_an-object');
var IE8_DOM_DEFINE = require('./_ie8-dom-define');
var toPrimitive = require('./_to-primitive');
var dP = Object.defineProperty;

exports.f = require('./_descriptors') ? Object.defineProperty : function defineProperty(O, P, Attributes) {
  anObject(O);
  P = toPrimitive(P, true);
  anObject(Attributes);
  if (IE8_DOM_DEFINE) try {
    return dP(O, P, Attributes);
  } catch (e) { /* empty */ }
  if ('get' in Attributes || 'set' in Attributes) throw TypeError('Accessors not supported!');
  if ('value' in Attributes) O[P] = Attributes.value;
  return O;
};

},{"./_an-object":30,"./_descriptors":52,"./_ie8-dom-define":68,"./_to-primitive":143}],96:[function(require,module,exports){
var dP = require('./_object-dp');
var anObject = require('./_an-object');
var getKeys = require('./_object-keys');

module.exports = require('./_descriptors') ? Object.defineProperties : function defineProperties(O, Properties) {
  anObject(O);
  var keys = getKeys(Properties);
  var length = keys.length;
  var i = 0;
  var P;
  while (length > i) dP.f(O, P = keys[i++], Properties[P]);
  return O;
};

},{"./_an-object":30,"./_descriptors":52,"./_object-dp":95,"./_object-keys":104}],97:[function(require,module,exports){
'use strict';
// Forced replacement prototype accessors methods
module.exports = require('./_library') || !require('./_fails')(function () {
  var K = Math.random();
  // In FF throws only define methods
  // eslint-disable-next-line no-undef, no-useless-call
  __defineSetter__.call(null, K, function () { /* empty */ });
  delete require('./_global')[K];
});

},{"./_fails":58,"./_global":64,"./_library":83}],98:[function(require,module,exports){
var pIE = require('./_object-pie');
var createDesc = require('./_property-desc');
var toIObject = require('./_to-iobject');
var toPrimitive = require('./_to-primitive');
var has = require('./_has');
var IE8_DOM_DEFINE = require('./_ie8-dom-define');
var gOPD = Object.getOwnPropertyDescriptor;

exports.f = require('./_descriptors') ? gOPD : function getOwnPropertyDescriptor(O, P) {
  O = toIObject(O);
  P = toPrimitive(P, true);
  if (IE8_DOM_DEFINE) try {
    return gOPD(O, P);
  } catch (e) { /* empty */ }
  if (has(O, P)) return createDesc(!pIE.f.call(O, P), O[P]);
};

},{"./_descriptors":52,"./_has":65,"./_ie8-dom-define":68,"./_object-pie":105,"./_property-desc":113,"./_to-iobject":140,"./_to-primitive":143}],99:[function(require,module,exports){
// fallback for IE11 buggy Object.getOwnPropertyNames with iframe and window
var toIObject = require('./_to-iobject');
var gOPN = require('./_object-gopn').f;
var toString = {}.toString;

var windowNames = typeof window == 'object' && window && Object.getOwnPropertyNames
  ? Object.getOwnPropertyNames(window) : [];

var getWindowNames = function (it) {
  try {
    return gOPN(it);
  } catch (e) {
    return windowNames.slice();
  }
};

module.exports.f = function getOwnPropertyNames(it) {
  return windowNames && toString.call(it) == '[object Window]' ? getWindowNames(it) : gOPN(toIObject(it));
};

},{"./_object-gopn":100,"./_to-iobject":140}],100:[function(require,module,exports){
// 19.1.2.7 / 15.2.3.4 Object.getOwnPropertyNames(O)
var $keys = require('./_object-keys-internal');
var hiddenKeys = require('./_enum-bug-keys').concat('length', 'prototype');

exports.f = Object.getOwnPropertyNames || function getOwnPropertyNames(O) {
  return $keys(O, hiddenKeys);
};

},{"./_enum-bug-keys":54,"./_object-keys-internal":103}],101:[function(require,module,exports){
exports.f = Object.getOwnPropertySymbols;

},{}],102:[function(require,module,exports){
// 19.1.2.9 / 15.2.3.2 Object.getPrototypeOf(O)
var has = require('./_has');
var toObject = require('./_to-object');
var IE_PROTO = require('./_shared-key')('IE_PROTO');
var ObjectProto = Object.prototype;

module.exports = Object.getPrototypeOf || function (O) {
  O = toObject(O);
  if (has(O, IE_PROTO)) return O[IE_PROTO];
  if (typeof O.constructor == 'function' && O instanceof O.constructor) {
    return O.constructor.prototype;
  } return O instanceof Object ? ObjectProto : null;
};

},{"./_has":65,"./_shared-key":125,"./_to-object":142}],103:[function(require,module,exports){
var has = require('./_has');
var toIObject = require('./_to-iobject');
var arrayIndexOf = require('./_array-includes')(false);
var IE_PROTO = require('./_shared-key')('IE_PROTO');

module.exports = function (object, names) {
  var O = toIObject(object);
  var i = 0;
  var result = [];
  var key;
  for (key in O) if (key != IE_PROTO) has(O, key) && result.push(key);
  // Don't enum bug & hidden keys
  while (names.length > i) if (has(O, key = names[i++])) {
    ~arrayIndexOf(result, key) || result.push(key);
  }
  return result;
};

},{"./_array-includes":34,"./_has":65,"./_shared-key":125,"./_to-iobject":140}],104:[function(require,module,exports){
// 19.1.2.14 / 15.2.3.14 Object.keys(O)
var $keys = require('./_object-keys-internal');
var enumBugKeys = require('./_enum-bug-keys');

module.exports = Object.keys || function keys(O) {
  return $keys(O, enumBugKeys);
};

},{"./_enum-bug-keys":54,"./_object-keys-internal":103}],105:[function(require,module,exports){
exports.f = {}.propertyIsEnumerable;

},{}],106:[function(require,module,exports){
// most Object methods by ES6 should accept primitives
var $export = require('./_export');
var core = require('./_core');
var fails = require('./_fails');
module.exports = function (KEY, exec) {
  var fn = (core.Object || {})[KEY] || Object[KEY];
  var exp = {};
  exp[KEY] = exec(fn);
  $export($export.S + $export.F * fails(function () { fn(1); }), 'Object', exp);
};

},{"./_core":46,"./_export":56,"./_fails":58}],107:[function(require,module,exports){
var getKeys = require('./_object-keys');
var toIObject = require('./_to-iobject');
var isEnum = require('./_object-pie').f;
module.exports = function (isEntries) {
  return function (it) {
    var O = toIObject(it);
    var keys = getKeys(O);
    var length = keys.length;
    var i = 0;
    var result = [];
    var key;
    while (length > i) if (isEnum.call(O, key = keys[i++])) {
      result.push(isEntries ? [key, O[key]] : O[key]);
    } return result;
  };
};

},{"./_object-keys":104,"./_object-pie":105,"./_to-iobject":140}],108:[function(require,module,exports){
// all object keys, includes non-enumerable and symbols
var gOPN = require('./_object-gopn');
var gOPS = require('./_object-gops');
var anObject = require('./_an-object');
var Reflect = require('./_global').Reflect;
module.exports = Reflect && Reflect.ownKeys || function ownKeys(it) {
  var keys = gOPN.f(anObject(it));
  var getSymbols = gOPS.f;
  return getSymbols ? keys.concat(getSymbols(it)) : keys;
};

},{"./_an-object":30,"./_global":64,"./_object-gopn":100,"./_object-gops":101}],109:[function(require,module,exports){
var $parseFloat = require('./_global').parseFloat;
var $trim = require('./_string-trim').trim;

module.exports = 1 / $parseFloat(require('./_string-ws') + '-0') !== -Infinity ? function parseFloat(str) {
  var string = $trim(String(str), 3);
  var result = $parseFloat(string);
  return result === 0 && string.charAt(0) == '-' ? -0 : result;
} : $parseFloat;

},{"./_global":64,"./_string-trim":134,"./_string-ws":135}],110:[function(require,module,exports){
var $parseInt = require('./_global').parseInt;
var $trim = require('./_string-trim').trim;
var ws = require('./_string-ws');
var hex = /^[-+]?0[xX]/;

module.exports = $parseInt(ws + '08') !== 8 || $parseInt(ws + '0x16') !== 22 ? function parseInt(str, radix) {
  var string = $trim(String(str), 3);
  return $parseInt(string, (radix >>> 0) || (hex.test(string) ? 16 : 10));
} : $parseInt;

},{"./_global":64,"./_string-trim":134,"./_string-ws":135}],111:[function(require,module,exports){
module.exports = function (exec) {
  try {
    return { e: false, v: exec() };
  } catch (e) {
    return { e: true, v: e };
  }
};

},{}],112:[function(require,module,exports){
var anObject = require('./_an-object');
var isObject = require('./_is-object');
var newPromiseCapability = require('./_new-promise-capability');

module.exports = function (C, x) {
  anObject(C);
  if (isObject(x) && x.constructor === C) return x;
  var promiseCapability = newPromiseCapability.f(C);
  var resolve = promiseCapability.resolve;
  resolve(x);
  return promiseCapability.promise;
};

},{"./_an-object":30,"./_is-object":75,"./_new-promise-capability":92}],113:[function(require,module,exports){
module.exports = function (bitmap, value) {
  return {
    enumerable: !(bitmap & 1),
    configurable: !(bitmap & 2),
    writable: !(bitmap & 4),
    value: value
  };
};

},{}],114:[function(require,module,exports){
var redefine = require('./_redefine');
module.exports = function (target, src, safe) {
  for (var key in src) redefine(target, key, src[key], safe);
  return target;
};

},{"./_redefine":115}],115:[function(require,module,exports){
var global = require('./_global');
var hide = require('./_hide');
var has = require('./_has');
var SRC = require('./_uid')('src');
var $toString = require('./_function-to-string');
var TO_STRING = 'toString';
var TPL = ('' + $toString).split(TO_STRING);

require('./_core').inspectSource = function (it) {
  return $toString.call(it);
};

(module.exports = function (O, key, val, safe) {
  var isFunction = typeof val == 'function';
  if (isFunction) has(val, 'name') || hide(val, 'name', key);
  if (O[key] === val) return;
  if (isFunction) has(val, SRC) || hide(val, SRC, O[key] ? '' + O[key] : TPL.join(String(key)));
  if (O === global) {
    O[key] = val;
  } else if (!safe) {
    delete O[key];
    hide(O, key, val);
  } else if (O[key]) {
    O[key] = val;
  } else {
    hide(O, key, val);
  }
// add fake Function#toString for correct work wrapped methods / constructors with methods like LoDash isNative
})(Function.prototype, TO_STRING, function toString() {
  return typeof this == 'function' && this[SRC] || $toString.call(this);
});

},{"./_core":46,"./_function-to-string":63,"./_global":64,"./_has":65,"./_hide":66,"./_uid":147}],116:[function(require,module,exports){
'use strict';

var classof = require('./_classof');
var builtinExec = RegExp.prototype.exec;

 // `RegExpExec` abstract operation
// https://tc39.github.io/ecma262/#sec-regexpexec
module.exports = function (R, S) {
  var exec = R.exec;
  if (typeof exec === 'function') {
    var result = exec.call(R, S);
    if (typeof result !== 'object') {
      throw new TypeError('RegExp exec method returned something other than an Object or null');
    }
    return result;
  }
  if (classof(R) !== 'RegExp') {
    throw new TypeError('RegExp#exec called on incompatible receiver');
  }
  return builtinExec.call(R, S);
};

},{"./_classof":40}],117:[function(require,module,exports){
'use strict';

var regexpFlags = require('./_flags');

var nativeExec = RegExp.prototype.exec;
// This always refers to the native implementation, because the
// String#replace polyfill uses ./fix-regexp-well-known-symbol-logic.js,
// which loads this file before patching the method.
var nativeReplace = String.prototype.replace;

var patchedExec = nativeExec;

var LAST_INDEX = 'lastIndex';

var UPDATES_LAST_INDEX_WRONG = (function () {
  var re1 = /a/,
      re2 = /b*/g;
  nativeExec.call(re1, 'a');
  nativeExec.call(re2, 'a');
  return re1[LAST_INDEX] !== 0 || re2[LAST_INDEX] !== 0;
})();

// nonparticipating capturing group, copied from es5-shim's String#split patch.
var NPCG_INCLUDED = /()??/.exec('')[1] !== undefined;

var PATCH = UPDATES_LAST_INDEX_WRONG || NPCG_INCLUDED;

if (PATCH) {
  patchedExec = function exec(str) {
    var re = this;
    var lastIndex, reCopy, match, i;

    if (NPCG_INCLUDED) {
      reCopy = new RegExp('^' + re.source + '$(?!\\s)', regexpFlags.call(re));
    }
    if (UPDATES_LAST_INDEX_WRONG) lastIndex = re[LAST_INDEX];

    match = nativeExec.call(re, str);

    if (UPDATES_LAST_INDEX_WRONG && match) {
      re[LAST_INDEX] = re.global ? match.index + match[0].length : lastIndex;
    }
    if (NPCG_INCLUDED && match && match.length > 1) {
      // Fix browsers whose `exec` methods don't consistently return `undefined`
      // for NPCG, like IE8. NOTE: This doesn' work for /(.?)?/
      // eslint-disable-next-line no-loop-func
      nativeReplace.call(match[0], reCopy, function () {
        for (i = 1; i < arguments.length - 2; i++) {
          if (arguments[i] === undefined) match[i] = undefined;
        }
      });
    }

    return match;
  };
}

module.exports = patchedExec;

},{"./_flags":60}],118:[function(require,module,exports){
module.exports = function (regExp, replace) {
  var replacer = replace === Object(replace) ? function (part) {
    return replace[part];
  } : replace;
  return function (it) {
    return String(it).replace(regExp, replacer);
  };
};

},{}],119:[function(require,module,exports){
// 7.2.9 SameValue(x, y)
module.exports = Object.is || function is(x, y) {
  // eslint-disable-next-line no-self-compare
  return x === y ? x !== 0 || 1 / x === 1 / y : x != x && y != y;
};

},{}],120:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-setmap-offrom/
var $export = require('./_export');
var aFunction = require('./_a-function');
var ctx = require('./_ctx');
var forOf = require('./_for-of');

module.exports = function (COLLECTION) {
  $export($export.S, COLLECTION, { from: function from(source /* , mapFn, thisArg */) {
    var mapFn = arguments[1];
    var mapping, A, n, cb;
    aFunction(this);
    mapping = mapFn !== undefined;
    if (mapping) aFunction(mapFn);
    if (source == undefined) return new this();
    A = [];
    if (mapping) {
      n = 0;
      cb = ctx(mapFn, arguments[2], 2);
      forOf(source, false, function (nextItem) {
        A.push(cb(nextItem, n++));
      });
    } else {
      forOf(source, false, A.push, A);
    }
    return new this(A);
  } });
};

},{"./_a-function":25,"./_ctx":48,"./_export":56,"./_for-of":62}],121:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-setmap-offrom/
var $export = require('./_export');

module.exports = function (COLLECTION) {
  $export($export.S, COLLECTION, { of: function of() {
    var length = arguments.length;
    var A = new Array(length);
    while (length--) A[length] = arguments[length];
    return new this(A);
  } });
};

},{"./_export":56}],122:[function(require,module,exports){
// Works with __proto__ only. Old v8 can't work with null proto objects.
/* eslint-disable no-proto */
var isObject = require('./_is-object');
var anObject = require('./_an-object');
var check = function (O, proto) {
  anObject(O);
  if (!isObject(proto) && proto !== null) throw TypeError(proto + ": can't set as prototype!");
};
module.exports = {
  set: Object.setPrototypeOf || ('__proto__' in {} ? // eslint-disable-line
    function (test, buggy, set) {
      try {
        set = require('./_ctx')(Function.call, require('./_object-gopd').f(Object.prototype, '__proto__').set, 2);
        set(test, []);
        buggy = !(test instanceof Array);
      } catch (e) { buggy = true; }
      return function setPrototypeOf(O, proto) {
        check(O, proto);
        if (buggy) O.__proto__ = proto;
        else set(O, proto);
        return O;
      };
    }({}, false) : undefined),
  check: check
};

},{"./_an-object":30,"./_ctx":48,"./_is-object":75,"./_object-gopd":98}],123:[function(require,module,exports){
'use strict';
var global = require('./_global');
var dP = require('./_object-dp');
var DESCRIPTORS = require('./_descriptors');
var SPECIES = require('./_wks')('species');

module.exports = function (KEY) {
  var C = global[KEY];
  if (DESCRIPTORS && C && !C[SPECIES]) dP.f(C, SPECIES, {
    configurable: true,
    get: function () { return this; }
  });
};

},{"./_descriptors":52,"./_global":64,"./_object-dp":95,"./_wks":152}],124:[function(require,module,exports){
var def = require('./_object-dp').f;
var has = require('./_has');
var TAG = require('./_wks')('toStringTag');

module.exports = function (it, tag, stat) {
  if (it && !has(it = stat ? it : it.prototype, TAG)) def(it, TAG, { configurable: true, value: tag });
};

},{"./_has":65,"./_object-dp":95,"./_wks":152}],125:[function(require,module,exports){
var shared = require('./_shared')('keys');
var uid = require('./_uid');
module.exports = function (key) {
  return shared[key] || (shared[key] = uid(key));
};

},{"./_shared":126,"./_uid":147}],126:[function(require,module,exports){
var core = require('./_core');
var global = require('./_global');
var SHARED = '__core-js_shared__';
var store = global[SHARED] || (global[SHARED] = {});

(module.exports = function (key, value) {
  return store[key] || (store[key] = value !== undefined ? value : {});
})('versions', []).push({
  version: core.version,
  mode: require('./_library') ? 'pure' : 'global',
  copyright: '© 2019 Denis Pushkarev (zloirock.ru)'
});

},{"./_core":46,"./_global":64,"./_library":83}],127:[function(require,module,exports){
// 7.3.20 SpeciesConstructor(O, defaultConstructor)
var anObject = require('./_an-object');
var aFunction = require('./_a-function');
var SPECIES = require('./_wks')('species');
module.exports = function (O, D) {
  var C = anObject(O).constructor;
  var S;
  return C === undefined || (S = anObject(C)[SPECIES]) == undefined ? D : aFunction(S);
};

},{"./_a-function":25,"./_an-object":30,"./_wks":152}],128:[function(require,module,exports){
'use strict';
var fails = require('./_fails');

module.exports = function (method, arg) {
  return !!method && fails(function () {
    // eslint-disable-next-line no-useless-call
    arg ? method.call(null, function () { /* empty */ }, 1) : method.call(null);
  });
};

},{"./_fails":58}],129:[function(require,module,exports){
var toInteger = require('./_to-integer');
var defined = require('./_defined');
// true  -> String#at
// false -> String#codePointAt
module.exports = function (TO_STRING) {
  return function (that, pos) {
    var s = String(defined(that));
    var i = toInteger(pos);
    var l = s.length;
    var a, b;
    if (i < 0 || i >= l) return TO_STRING ? '' : undefined;
    a = s.charCodeAt(i);
    return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff
      ? TO_STRING ? s.charAt(i) : a
      : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
  };
};

},{"./_defined":51,"./_to-integer":139}],130:[function(require,module,exports){
// helper for String#{startsWith, endsWith, includes}
var isRegExp = require('./_is-regexp');
var defined = require('./_defined');

module.exports = function (that, searchString, NAME) {
  if (isRegExp(searchString)) throw TypeError('String#' + NAME + " doesn't accept regex!");
  return String(defined(that));
};

},{"./_defined":51,"./_is-regexp":76}],131:[function(require,module,exports){
var $export = require('./_export');
var fails = require('./_fails');
var defined = require('./_defined');
var quot = /"/g;
// B.2.3.2.1 CreateHTML(string, tag, attribute, value)
var createHTML = function (string, tag, attribute, value) {
  var S = String(defined(string));
  var p1 = '<' + tag;
  if (attribute !== '') p1 += ' ' + attribute + '="' + String(value).replace(quot, '&quot;') + '"';
  return p1 + '>' + S + '</' + tag + '>';
};
module.exports = function (NAME, exec) {
  var O = {};
  O[NAME] = exec(createHTML);
  $export($export.P + $export.F * fails(function () {
    var test = ''[NAME]('"');
    return test !== test.toLowerCase() || test.split('"').length > 3;
  }), 'String', O);
};

},{"./_defined":51,"./_export":56,"./_fails":58}],132:[function(require,module,exports){
// https://github.com/tc39/proposal-string-pad-start-end
var toLength = require('./_to-length');
var repeat = require('./_string-repeat');
var defined = require('./_defined');

module.exports = function (that, maxLength, fillString, left) {
  var S = String(defined(that));
  var stringLength = S.length;
  var fillStr = fillString === undefined ? ' ' : String(fillString);
  var intMaxLength = toLength(maxLength);
  if (intMaxLength <= stringLength || fillStr == '') return S;
  var fillLen = intMaxLength - stringLength;
  var stringFiller = repeat.call(fillStr, Math.ceil(fillLen / fillStr.length));
  if (stringFiller.length > fillLen) stringFiller = stringFiller.slice(0, fillLen);
  return left ? stringFiller + S : S + stringFiller;
};

},{"./_defined":51,"./_string-repeat":133,"./_to-length":141}],133:[function(require,module,exports){
'use strict';
var toInteger = require('./_to-integer');
var defined = require('./_defined');

module.exports = function repeat(count) {
  var str = String(defined(this));
  var res = '';
  var n = toInteger(count);
  if (n < 0 || n == Infinity) throw RangeError("Count can't be negative");
  for (;n > 0; (n >>>= 1) && (str += str)) if (n & 1) res += str;
  return res;
};

},{"./_defined":51,"./_to-integer":139}],134:[function(require,module,exports){
var $export = require('./_export');
var defined = require('./_defined');
var fails = require('./_fails');
var spaces = require('./_string-ws');
var space = '[' + spaces + ']';
var non = '\u200b\u0085';
var ltrim = RegExp('^' + space + space + '*');
var rtrim = RegExp(space + space + '*$');

var exporter = function (KEY, exec, ALIAS) {
  var exp = {};
  var FORCE = fails(function () {
    return !!spaces[KEY]() || non[KEY]() != non;
  });
  var fn = exp[KEY] = FORCE ? exec(trim) : spaces[KEY];
  if (ALIAS) exp[ALIAS] = fn;
  $export($export.P + $export.F * FORCE, 'String', exp);
};

// 1 -> String#trimLeft
// 2 -> String#trimRight
// 3 -> String#trim
var trim = exporter.trim = function (string, TYPE) {
  string = String(defined(string));
  if (TYPE & 1) string = string.replace(ltrim, '');
  if (TYPE & 2) string = string.replace(rtrim, '');
  return string;
};

module.exports = exporter;

},{"./_defined":51,"./_export":56,"./_fails":58,"./_string-ws":135}],135:[function(require,module,exports){
module.exports = '\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003' +
  '\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028\u2029\uFEFF';

},{}],136:[function(require,module,exports){
var ctx = require('./_ctx');
var invoke = require('./_invoke');
var html = require('./_html');
var cel = require('./_dom-create');
var global = require('./_global');
var process = global.process;
var setTask = global.setImmediate;
var clearTask = global.clearImmediate;
var MessageChannel = global.MessageChannel;
var Dispatch = global.Dispatch;
var counter = 0;
var queue = {};
var ONREADYSTATECHANGE = 'onreadystatechange';
var defer, channel, port;
var run = function () {
  var id = +this;
  // eslint-disable-next-line no-prototype-builtins
  if (queue.hasOwnProperty(id)) {
    var fn = queue[id];
    delete queue[id];
    fn();
  }
};
var listener = function (event) {
  run.call(event.data);
};
// Node.js 0.9+ & IE10+ has setImmediate, otherwise:
if (!setTask || !clearTask) {
  setTask = function setImmediate(fn) {
    var args = [];
    var i = 1;
    while (arguments.length > i) args.push(arguments[i++]);
    queue[++counter] = function () {
      // eslint-disable-next-line no-new-func
      invoke(typeof fn == 'function' ? fn : Function(fn), args);
    };
    defer(counter);
    return counter;
  };
  clearTask = function clearImmediate(id) {
    delete queue[id];
  };
  // Node.js 0.8-
  if (require('./_cof')(process) == 'process') {
    defer = function (id) {
      process.nextTick(ctx(run, id, 1));
    };
  // Sphere (JS game engine) Dispatch API
  } else if (Dispatch && Dispatch.now) {
    defer = function (id) {
      Dispatch.now(ctx(run, id, 1));
    };
  // Browsers with MessageChannel, includes WebWorkers
  } else if (MessageChannel) {
    channel = new MessageChannel();
    port = channel.port2;
    channel.port1.onmessage = listener;
    defer = ctx(port.postMessage, port, 1);
  // Browsers with postMessage, skip WebWorkers
  // IE8 has postMessage, but it's sync & typeof its postMessage is 'object'
  } else if (global.addEventListener && typeof postMessage == 'function' && !global.importScripts) {
    defer = function (id) {
      global.postMessage(id + '', '*');
    };
    global.addEventListener('message', listener, false);
  // IE8-
  } else if (ONREADYSTATECHANGE in cel('script')) {
    defer = function (id) {
      html.appendChild(cel('script'))[ONREADYSTATECHANGE] = function () {
        html.removeChild(this);
        run.call(id);
      };
    };
  // Rest old browsers
  } else {
    defer = function (id) {
      setTimeout(ctx(run, id, 1), 0);
    };
  }
}
module.exports = {
  set: setTask,
  clear: clearTask
};

},{"./_cof":41,"./_ctx":48,"./_dom-create":53,"./_global":64,"./_html":67,"./_invoke":70}],137:[function(require,module,exports){
var toInteger = require('./_to-integer');
var max = Math.max;
var min = Math.min;
module.exports = function (index, length) {
  index = toInteger(index);
  return index < 0 ? max(index + length, 0) : min(index, length);
};

},{"./_to-integer":139}],138:[function(require,module,exports){
// https://tc39.github.io/ecma262/#sec-toindex
var toInteger = require('./_to-integer');
var toLength = require('./_to-length');
module.exports = function (it) {
  if (it === undefined) return 0;
  var number = toInteger(it);
  var length = toLength(number);
  if (number !== length) throw RangeError('Wrong length!');
  return length;
};

},{"./_to-integer":139,"./_to-length":141}],139:[function(require,module,exports){
// 7.1.4 ToInteger
var ceil = Math.ceil;
var floor = Math.floor;
module.exports = function (it) {
  return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
};

},{}],140:[function(require,module,exports){
// to indexed object, toObject with fallback for non-array-like ES3 strings
var IObject = require('./_iobject');
var defined = require('./_defined');
module.exports = function (it) {
  return IObject(defined(it));
};

},{"./_defined":51,"./_iobject":71}],141:[function(require,module,exports){
// 7.1.15 ToLength
var toInteger = require('./_to-integer');
var min = Math.min;
module.exports = function (it) {
  return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0; // pow(2, 53) - 1 == 9007199254740991
};

},{"./_to-integer":139}],142:[function(require,module,exports){
// 7.1.13 ToObject(argument)
var defined = require('./_defined');
module.exports = function (it) {
  return Object(defined(it));
};

},{"./_defined":51}],143:[function(require,module,exports){
// 7.1.1 ToPrimitive(input [, PreferredType])
var isObject = require('./_is-object');
// instead of the ES6 spec version, we didn't implement @@toPrimitive case
// and the second argument - flag - preferred type is a string
module.exports = function (it, S) {
  if (!isObject(it)) return it;
  var fn, val;
  if (S && typeof (fn = it.toString) == 'function' && !isObject(val = fn.call(it))) return val;
  if (typeof (fn = it.valueOf) == 'function' && !isObject(val = fn.call(it))) return val;
  if (!S && typeof (fn = it.toString) == 'function' && !isObject(val = fn.call(it))) return val;
  throw TypeError("Can't convert object to primitive value");
};

},{"./_is-object":75}],144:[function(require,module,exports){
'use strict';
if (require('./_descriptors')) {
  var LIBRARY = require('./_library');
  var global = require('./_global');
  var fails = require('./_fails');
  var $export = require('./_export');
  var $typed = require('./_typed');
  var $buffer = require('./_typed-buffer');
  var ctx = require('./_ctx');
  var anInstance = require('./_an-instance');
  var propertyDesc = require('./_property-desc');
  var hide = require('./_hide');
  var redefineAll = require('./_redefine-all');
  var toInteger = require('./_to-integer');
  var toLength = require('./_to-length');
  var toIndex = require('./_to-index');
  var toAbsoluteIndex = require('./_to-absolute-index');
  var toPrimitive = require('./_to-primitive');
  var has = require('./_has');
  var classof = require('./_classof');
  var isObject = require('./_is-object');
  var toObject = require('./_to-object');
  var isArrayIter = require('./_is-array-iter');
  var create = require('./_object-create');
  var getPrototypeOf = require('./_object-gpo');
  var gOPN = require('./_object-gopn').f;
  var getIterFn = require('./core.get-iterator-method');
  var uid = require('./_uid');
  var wks = require('./_wks');
  var createArrayMethod = require('./_array-methods');
  var createArrayIncludes = require('./_array-includes');
  var speciesConstructor = require('./_species-constructor');
  var ArrayIterators = require('./es6.array.iterator');
  var Iterators = require('./_iterators');
  var $iterDetect = require('./_iter-detect');
  var setSpecies = require('./_set-species');
  var arrayFill = require('./_array-fill');
  var arrayCopyWithin = require('./_array-copy-within');
  var $DP = require('./_object-dp');
  var $GOPD = require('./_object-gopd');
  var dP = $DP.f;
  var gOPD = $GOPD.f;
  var RangeError = global.RangeError;
  var TypeError = global.TypeError;
  var Uint8Array = global.Uint8Array;
  var ARRAY_BUFFER = 'ArrayBuffer';
  var SHARED_BUFFER = 'Shared' + ARRAY_BUFFER;
  var BYTES_PER_ELEMENT = 'BYTES_PER_ELEMENT';
  var PROTOTYPE = 'prototype';
  var ArrayProto = Array[PROTOTYPE];
  var $ArrayBuffer = $buffer.ArrayBuffer;
  var $DataView = $buffer.DataView;
  var arrayForEach = createArrayMethod(0);
  var arrayFilter = createArrayMethod(2);
  var arraySome = createArrayMethod(3);
  var arrayEvery = createArrayMethod(4);
  var arrayFind = createArrayMethod(5);
  var arrayFindIndex = createArrayMethod(6);
  var arrayIncludes = createArrayIncludes(true);
  var arrayIndexOf = createArrayIncludes(false);
  var arrayValues = ArrayIterators.values;
  var arrayKeys = ArrayIterators.keys;
  var arrayEntries = ArrayIterators.entries;
  var arrayLastIndexOf = ArrayProto.lastIndexOf;
  var arrayReduce = ArrayProto.reduce;
  var arrayReduceRight = ArrayProto.reduceRight;
  var arrayJoin = ArrayProto.join;
  var arraySort = ArrayProto.sort;
  var arraySlice = ArrayProto.slice;
  var arrayToString = ArrayProto.toString;
  var arrayToLocaleString = ArrayProto.toLocaleString;
  var ITERATOR = wks('iterator');
  var TAG = wks('toStringTag');
  var TYPED_CONSTRUCTOR = uid('typed_constructor');
  var DEF_CONSTRUCTOR = uid('def_constructor');
  var ALL_CONSTRUCTORS = $typed.CONSTR;
  var TYPED_ARRAY = $typed.TYPED;
  var VIEW = $typed.VIEW;
  var WRONG_LENGTH = 'Wrong length!';

  var $map = createArrayMethod(1, function (O, length) {
    return allocate(speciesConstructor(O, O[DEF_CONSTRUCTOR]), length);
  });

  var LITTLE_ENDIAN = fails(function () {
    // eslint-disable-next-line no-undef
    return new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  });

  var FORCED_SET = !!Uint8Array && !!Uint8Array[PROTOTYPE].set && fails(function () {
    new Uint8Array(1).set({});
  });

  var toOffset = function (it, BYTES) {
    var offset = toInteger(it);
    if (offset < 0 || offset % BYTES) throw RangeError('Wrong offset!');
    return offset;
  };

  var validate = function (it) {
    if (isObject(it) && TYPED_ARRAY in it) return it;
    throw TypeError(it + ' is not a typed array!');
  };

  var allocate = function (C, length) {
    if (!(isObject(C) && TYPED_CONSTRUCTOR in C)) {
      throw TypeError('It is not a typed array constructor!');
    } return new C(length);
  };

  var speciesFromList = function (O, list) {
    return fromList(speciesConstructor(O, O[DEF_CONSTRUCTOR]), list);
  };

  var fromList = function (C, list) {
    var index = 0;
    var length = list.length;
    var result = allocate(C, length);
    while (length > index) result[index] = list[index++];
    return result;
  };

  var addGetter = function (it, key, internal) {
    dP(it, key, { get: function () { return this._d[internal]; } });
  };

  var $from = function from(source /* , mapfn, thisArg */) {
    var O = toObject(source);
    var aLen = arguments.length;
    var mapfn = aLen > 1 ? arguments[1] : undefined;
    var mapping = mapfn !== undefined;
    var iterFn = getIterFn(O);
    var i, length, values, result, step, iterator;
    if (iterFn != undefined && !isArrayIter(iterFn)) {
      for (iterator = iterFn.call(O), values = [], i = 0; !(step = iterator.next()).done; i++) {
        values.push(step.value);
      } O = values;
    }
    if (mapping && aLen > 2) mapfn = ctx(mapfn, arguments[2], 2);
    for (i = 0, length = toLength(O.length), result = allocate(this, length); length > i; i++) {
      result[i] = mapping ? mapfn(O[i], i) : O[i];
    }
    return result;
  };

  var $of = function of(/* ...items */) {
    var index = 0;
    var length = arguments.length;
    var result = allocate(this, length);
    while (length > index) result[index] = arguments[index++];
    return result;
  };

  // iOS Safari 6.x fails here
  var TO_LOCALE_BUG = !!Uint8Array && fails(function () { arrayToLocaleString.call(new Uint8Array(1)); });

  var $toLocaleString = function toLocaleString() {
    return arrayToLocaleString.apply(TO_LOCALE_BUG ? arraySlice.call(validate(this)) : validate(this), arguments);
  };

  var proto = {
    copyWithin: function copyWithin(target, start /* , end */) {
      return arrayCopyWithin.call(validate(this), target, start, arguments.length > 2 ? arguments[2] : undefined);
    },
    every: function every(callbackfn /* , thisArg */) {
      return arrayEvery(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    fill: function fill(value /* , start, end */) { // eslint-disable-line no-unused-vars
      return arrayFill.apply(validate(this), arguments);
    },
    filter: function filter(callbackfn /* , thisArg */) {
      return speciesFromList(this, arrayFilter(validate(this), callbackfn,
        arguments.length > 1 ? arguments[1] : undefined));
    },
    find: function find(predicate /* , thisArg */) {
      return arrayFind(validate(this), predicate, arguments.length > 1 ? arguments[1] : undefined);
    },
    findIndex: function findIndex(predicate /* , thisArg */) {
      return arrayFindIndex(validate(this), predicate, arguments.length > 1 ? arguments[1] : undefined);
    },
    forEach: function forEach(callbackfn /* , thisArg */) {
      arrayForEach(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    indexOf: function indexOf(searchElement /* , fromIndex */) {
      return arrayIndexOf(validate(this), searchElement, arguments.length > 1 ? arguments[1] : undefined);
    },
    includes: function includes(searchElement /* , fromIndex */) {
      return arrayIncludes(validate(this), searchElement, arguments.length > 1 ? arguments[1] : undefined);
    },
    join: function join(separator) { // eslint-disable-line no-unused-vars
      return arrayJoin.apply(validate(this), arguments);
    },
    lastIndexOf: function lastIndexOf(searchElement /* , fromIndex */) { // eslint-disable-line no-unused-vars
      return arrayLastIndexOf.apply(validate(this), arguments);
    },
    map: function map(mapfn /* , thisArg */) {
      return $map(validate(this), mapfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    reduce: function reduce(callbackfn /* , initialValue */) { // eslint-disable-line no-unused-vars
      return arrayReduce.apply(validate(this), arguments);
    },
    reduceRight: function reduceRight(callbackfn /* , initialValue */) { // eslint-disable-line no-unused-vars
      return arrayReduceRight.apply(validate(this), arguments);
    },
    reverse: function reverse() {
      var that = this;
      var length = validate(that).length;
      var middle = Math.floor(length / 2);
      var index = 0;
      var value;
      while (index < middle) {
        value = that[index];
        that[index++] = that[--length];
        that[length] = value;
      } return that;
    },
    some: function some(callbackfn /* , thisArg */) {
      return arraySome(validate(this), callbackfn, arguments.length > 1 ? arguments[1] : undefined);
    },
    sort: function sort(comparefn) {
      return arraySort.call(validate(this), comparefn);
    },
    subarray: function subarray(begin, end) {
      var O = validate(this);
      var length = O.length;
      var $begin = toAbsoluteIndex(begin, length);
      return new (speciesConstructor(O, O[DEF_CONSTRUCTOR]))(
        O.buffer,
        O.byteOffset + $begin * O.BYTES_PER_ELEMENT,
        toLength((end === undefined ? length : toAbsoluteIndex(end, length)) - $begin)
      );
    }
  };

  var $slice = function slice(start, end) {
    return speciesFromList(this, arraySlice.call(validate(this), start, end));
  };

  var $set = function set(arrayLike /* , offset */) {
    validate(this);
    var offset = toOffset(arguments[1], 1);
    var length = this.length;
    var src = toObject(arrayLike);
    var len = toLength(src.length);
    var index = 0;
    if (len + offset > length) throw RangeError(WRONG_LENGTH);
    while (index < len) this[offset + index] = src[index++];
  };

  var $iterators = {
    entries: function entries() {
      return arrayEntries.call(validate(this));
    },
    keys: function keys() {
      return arrayKeys.call(validate(this));
    },
    values: function values() {
      return arrayValues.call(validate(this));
    }
  };

  var isTAIndex = function (target, key) {
    return isObject(target)
      && target[TYPED_ARRAY]
      && typeof key != 'symbol'
      && key in target
      && String(+key) == String(key);
  };
  var $getDesc = function getOwnPropertyDescriptor(target, key) {
    return isTAIndex(target, key = toPrimitive(key, true))
      ? propertyDesc(2, target[key])
      : gOPD(target, key);
  };
  var $setDesc = function defineProperty(target, key, desc) {
    if (isTAIndex(target, key = toPrimitive(key, true))
      && isObject(desc)
      && has(desc, 'value')
      && !has(desc, 'get')
      && !has(desc, 'set')
      // TODO: add validation descriptor w/o calling accessors
      && !desc.configurable
      && (!has(desc, 'writable') || desc.writable)
      && (!has(desc, 'enumerable') || desc.enumerable)
    ) {
      target[key] = desc.value;
      return target;
    } return dP(target, key, desc);
  };

  if (!ALL_CONSTRUCTORS) {
    $GOPD.f = $getDesc;
    $DP.f = $setDesc;
  }

  $export($export.S + $export.F * !ALL_CONSTRUCTORS, 'Object', {
    getOwnPropertyDescriptor: $getDesc,
    defineProperty: $setDesc
  });

  if (fails(function () { arrayToString.call({}); })) {
    arrayToString = arrayToLocaleString = function toString() {
      return arrayJoin.call(this);
    };
  }

  var $TypedArrayPrototype$ = redefineAll({}, proto);
  redefineAll($TypedArrayPrototype$, $iterators);
  hide($TypedArrayPrototype$, ITERATOR, $iterators.values);
  redefineAll($TypedArrayPrototype$, {
    slice: $slice,
    set: $set,
    constructor: function () { /* noop */ },
    toString: arrayToString,
    toLocaleString: $toLocaleString
  });
  addGetter($TypedArrayPrototype$, 'buffer', 'b');
  addGetter($TypedArrayPrototype$, 'byteOffset', 'o');
  addGetter($TypedArrayPrototype$, 'byteLength', 'l');
  addGetter($TypedArrayPrototype$, 'length', 'e');
  dP($TypedArrayPrototype$, TAG, {
    get: function () { return this[TYPED_ARRAY]; }
  });

  // eslint-disable-next-line max-statements
  module.exports = function (KEY, BYTES, wrapper, CLAMPED) {
    CLAMPED = !!CLAMPED;
    var NAME = KEY + (CLAMPED ? 'Clamped' : '') + 'Array';
    var GETTER = 'get' + KEY;
    var SETTER = 'set' + KEY;
    var TypedArray = global[NAME];
    var Base = TypedArray || {};
    var TAC = TypedArray && getPrototypeOf(TypedArray);
    var FORCED = !TypedArray || !$typed.ABV;
    var O = {};
    var TypedArrayPrototype = TypedArray && TypedArray[PROTOTYPE];
    var getter = function (that, index) {
      var data = that._d;
      return data.v[GETTER](index * BYTES + data.o, LITTLE_ENDIAN);
    };
    var setter = function (that, index, value) {
      var data = that._d;
      if (CLAMPED) value = (value = Math.round(value)) < 0 ? 0 : value > 0xff ? 0xff : value & 0xff;
      data.v[SETTER](index * BYTES + data.o, value, LITTLE_ENDIAN);
    };
    var addElement = function (that, index) {
      dP(that, index, {
        get: function () {
          return getter(this, index);
        },
        set: function (value) {
          return setter(this, index, value);
        },
        enumerable: true
      });
    };
    if (FORCED) {
      TypedArray = wrapper(function (that, data, $offset, $length) {
        anInstance(that, TypedArray, NAME, '_d');
        var index = 0;
        var offset = 0;
        var buffer, byteLength, length, klass;
        if (!isObject(data)) {
          length = toIndex(data);
          byteLength = length * BYTES;
          buffer = new $ArrayBuffer(byteLength);
        } else if (data instanceof $ArrayBuffer || (klass = classof(data)) == ARRAY_BUFFER || klass == SHARED_BUFFER) {
          buffer = data;
          offset = toOffset($offset, BYTES);
          var $len = data.byteLength;
          if ($length === undefined) {
            if ($len % BYTES) throw RangeError(WRONG_LENGTH);
            byteLength = $len - offset;
            if (byteLength < 0) throw RangeError(WRONG_LENGTH);
          } else {
            byteLength = toLength($length) * BYTES;
            if (byteLength + offset > $len) throw RangeError(WRONG_LENGTH);
          }
          length = byteLength / BYTES;
        } else if (TYPED_ARRAY in data) {
          return fromList(TypedArray, data);
        } else {
          return $from.call(TypedArray, data);
        }
        hide(that, '_d', {
          b: buffer,
          o: offset,
          l: byteLength,
          e: length,
          v: new $DataView(buffer)
        });
        while (index < length) addElement(that, index++);
      });
      TypedArrayPrototype = TypedArray[PROTOTYPE] = create($TypedArrayPrototype$);
      hide(TypedArrayPrototype, 'constructor', TypedArray);
    } else if (!fails(function () {
      TypedArray(1);
    }) || !fails(function () {
      new TypedArray(-1); // eslint-disable-line no-new
    }) || !$iterDetect(function (iter) {
      new TypedArray(); // eslint-disable-line no-new
      new TypedArray(null); // eslint-disable-line no-new
      new TypedArray(1.5); // eslint-disable-line no-new
      new TypedArray(iter); // eslint-disable-line no-new
    }, true)) {
      TypedArray = wrapper(function (that, data, $offset, $length) {
        anInstance(that, TypedArray, NAME);
        var klass;
        // `ws` module bug, temporarily remove validation length for Uint8Array
        // https://github.com/websockets/ws/pull/645
        if (!isObject(data)) return new Base(toIndex(data));
        if (data instanceof $ArrayBuffer || (klass = classof(data)) == ARRAY_BUFFER || klass == SHARED_BUFFER) {
          return $length !== undefined
            ? new Base(data, toOffset($offset, BYTES), $length)
            : $offset !== undefined
              ? new Base(data, toOffset($offset, BYTES))
              : new Base(data);
        }
        if (TYPED_ARRAY in data) return fromList(TypedArray, data);
        return $from.call(TypedArray, data);
      });
      arrayForEach(TAC !== Function.prototype ? gOPN(Base).concat(gOPN(TAC)) : gOPN(Base), function (key) {
        if (!(key in TypedArray)) hide(TypedArray, key, Base[key]);
      });
      TypedArray[PROTOTYPE] = TypedArrayPrototype;
      if (!LIBRARY) TypedArrayPrototype.constructor = TypedArray;
    }
    var $nativeIterator = TypedArrayPrototype[ITERATOR];
    var CORRECT_ITER_NAME = !!$nativeIterator
      && ($nativeIterator.name == 'values' || $nativeIterator.name == undefined);
    var $iterator = $iterators.values;
    hide(TypedArray, TYPED_CONSTRUCTOR, true);
    hide(TypedArrayPrototype, TYPED_ARRAY, NAME);
    hide(TypedArrayPrototype, VIEW, true);
    hide(TypedArrayPrototype, DEF_CONSTRUCTOR, TypedArray);

    if (CLAMPED ? new TypedArray(1)[TAG] != NAME : !(TAG in TypedArrayPrototype)) {
      dP(TypedArrayPrototype, TAG, {
        get: function () { return NAME; }
      });
    }

    O[NAME] = TypedArray;

    $export($export.G + $export.W + $export.F * (TypedArray != Base), O);

    $export($export.S, NAME, {
      BYTES_PER_ELEMENT: BYTES
    });

    $export($export.S + $export.F * fails(function () { Base.of.call(TypedArray, 1); }), NAME, {
      from: $from,
      of: $of
    });

    if (!(BYTES_PER_ELEMENT in TypedArrayPrototype)) hide(TypedArrayPrototype, BYTES_PER_ELEMENT, BYTES);

    $export($export.P, NAME, proto);

    setSpecies(NAME);

    $export($export.P + $export.F * FORCED_SET, NAME, { set: $set });

    $export($export.P + $export.F * !CORRECT_ITER_NAME, NAME, $iterators);

    if (!LIBRARY && TypedArrayPrototype.toString != arrayToString) TypedArrayPrototype.toString = arrayToString;

    $export($export.P + $export.F * fails(function () {
      new TypedArray(1).slice();
    }), NAME, { slice: $slice });

    $export($export.P + $export.F * (fails(function () {
      return [1, 2].toLocaleString() != new TypedArray([1, 2]).toLocaleString();
    }) || !fails(function () {
      TypedArrayPrototype.toLocaleString.call([1, 2]);
    })), NAME, { toLocaleString: $toLocaleString });

    Iterators[NAME] = CORRECT_ITER_NAME ? $nativeIterator : $iterator;
    if (!LIBRARY && !CORRECT_ITER_NAME) hide(TypedArrayPrototype, ITERATOR, $iterator);
  };
} else module.exports = function () { /* empty */ };

},{"./_an-instance":29,"./_array-copy-within":31,"./_array-fill":32,"./_array-includes":34,"./_array-methods":35,"./_classof":40,"./_ctx":48,"./_descriptors":52,"./_export":56,"./_fails":58,"./_global":64,"./_has":65,"./_hide":66,"./_is-array-iter":72,"./_is-object":75,"./_iter-detect":80,"./_iterators":82,"./_library":83,"./_object-create":94,"./_object-dp":95,"./_object-gopd":98,"./_object-gopn":100,"./_object-gpo":102,"./_property-desc":113,"./_redefine-all":114,"./_set-species":123,"./_species-constructor":127,"./_to-absolute-index":137,"./_to-index":138,"./_to-integer":139,"./_to-length":141,"./_to-object":142,"./_to-primitive":143,"./_typed":146,"./_typed-buffer":145,"./_uid":147,"./_wks":152,"./core.get-iterator-method":153,"./es6.array.iterator":165}],145:[function(require,module,exports){
'use strict';
var global = require('./_global');
var DESCRIPTORS = require('./_descriptors');
var LIBRARY = require('./_library');
var $typed = require('./_typed');
var hide = require('./_hide');
var redefineAll = require('./_redefine-all');
var fails = require('./_fails');
var anInstance = require('./_an-instance');
var toInteger = require('./_to-integer');
var toLength = require('./_to-length');
var toIndex = require('./_to-index');
var gOPN = require('./_object-gopn').f;
var dP = require('./_object-dp').f;
var arrayFill = require('./_array-fill');
var setToStringTag = require('./_set-to-string-tag');
var ARRAY_BUFFER = 'ArrayBuffer';
var DATA_VIEW = 'DataView';
var PROTOTYPE = 'prototype';
var WRONG_LENGTH = 'Wrong length!';
var WRONG_INDEX = 'Wrong index!';
var $ArrayBuffer = global[ARRAY_BUFFER];
var $DataView = global[DATA_VIEW];
var Math = global.Math;
var RangeError = global.RangeError;
// eslint-disable-next-line no-shadow-restricted-names
var Infinity = global.Infinity;
var BaseBuffer = $ArrayBuffer;
var abs = Math.abs;
var pow = Math.pow;
var floor = Math.floor;
var log = Math.log;
var LN2 = Math.LN2;
var BUFFER = 'buffer';
var BYTE_LENGTH = 'byteLength';
var BYTE_OFFSET = 'byteOffset';
var $BUFFER = DESCRIPTORS ? '_b' : BUFFER;
var $LENGTH = DESCRIPTORS ? '_l' : BYTE_LENGTH;
var $OFFSET = DESCRIPTORS ? '_o' : BYTE_OFFSET;

// IEEE754 conversions based on https://github.com/feross/ieee754
function packIEEE754(value, mLen, nBytes) {
  var buffer = new Array(nBytes);
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = mLen === 23 ? pow(2, -24) - pow(2, -77) : 0;
  var i = 0;
  var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
  var e, m, c;
  value = abs(value);
  // eslint-disable-next-line no-self-compare
  if (value != value || value === Infinity) {
    // eslint-disable-next-line no-self-compare
    m = value != value ? 1 : 0;
    e = eMax;
  } else {
    e = floor(log(value) / LN2);
    if (value * (c = pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }
    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * pow(2, eBias - 1) * pow(2, mLen);
      e = 0;
    }
  }
  for (; mLen >= 8; buffer[i++] = m & 255, m /= 256, mLen -= 8);
  e = e << mLen | m;
  eLen += mLen;
  for (; eLen > 0; buffer[i++] = e & 255, e /= 256, eLen -= 8);
  buffer[--i] |= s * 128;
  return buffer;
}
function unpackIEEE754(buffer, mLen, nBytes) {
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = eLen - 7;
  var i = nBytes - 1;
  var s = buffer[i--];
  var e = s & 127;
  var m;
  s >>= 7;
  for (; nBits > 0; e = e * 256 + buffer[i], i--, nBits -= 8);
  m = e & (1 << -nBits) - 1;
  e >>= -nBits;
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[i], i--, nBits -= 8);
  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : s ? -Infinity : Infinity;
  } else {
    m = m + pow(2, mLen);
    e = e - eBias;
  } return (s ? -1 : 1) * m * pow(2, e - mLen);
}

function unpackI32(bytes) {
  return bytes[3] << 24 | bytes[2] << 16 | bytes[1] << 8 | bytes[0];
}
function packI8(it) {
  return [it & 0xff];
}
function packI16(it) {
  return [it & 0xff, it >> 8 & 0xff];
}
function packI32(it) {
  return [it & 0xff, it >> 8 & 0xff, it >> 16 & 0xff, it >> 24 & 0xff];
}
function packF64(it) {
  return packIEEE754(it, 52, 8);
}
function packF32(it) {
  return packIEEE754(it, 23, 4);
}

function addGetter(C, key, internal) {
  dP(C[PROTOTYPE], key, { get: function () { return this[internal]; } });
}

function get(view, bytes, index, isLittleEndian) {
  var numIndex = +index;
  var intIndex = toIndex(numIndex);
  if (intIndex + bytes > view[$LENGTH]) throw RangeError(WRONG_INDEX);
  var store = view[$BUFFER]._b;
  var start = intIndex + view[$OFFSET];
  var pack = store.slice(start, start + bytes);
  return isLittleEndian ? pack : pack.reverse();
}
function set(view, bytes, index, conversion, value, isLittleEndian) {
  var numIndex = +index;
  var intIndex = toIndex(numIndex);
  if (intIndex + bytes > view[$LENGTH]) throw RangeError(WRONG_INDEX);
  var store = view[$BUFFER]._b;
  var start = intIndex + view[$OFFSET];
  var pack = conversion(+value);
  for (var i = 0; i < bytes; i++) store[start + i] = pack[isLittleEndian ? i : bytes - i - 1];
}

if (!$typed.ABV) {
  $ArrayBuffer = function ArrayBuffer(length) {
    anInstance(this, $ArrayBuffer, ARRAY_BUFFER);
    var byteLength = toIndex(length);
    this._b = arrayFill.call(new Array(byteLength), 0);
    this[$LENGTH] = byteLength;
  };

  $DataView = function DataView(buffer, byteOffset, byteLength) {
    anInstance(this, $DataView, DATA_VIEW);
    anInstance(buffer, $ArrayBuffer, DATA_VIEW);
    var bufferLength = buffer[$LENGTH];
    var offset = toInteger(byteOffset);
    if (offset < 0 || offset > bufferLength) throw RangeError('Wrong offset!');
    byteLength = byteLength === undefined ? bufferLength - offset : toLength(byteLength);
    if (offset + byteLength > bufferLength) throw RangeError(WRONG_LENGTH);
    this[$BUFFER] = buffer;
    this[$OFFSET] = offset;
    this[$LENGTH] = byteLength;
  };

  if (DESCRIPTORS) {
    addGetter($ArrayBuffer, BYTE_LENGTH, '_l');
    addGetter($DataView, BUFFER, '_b');
    addGetter($DataView, BYTE_LENGTH, '_l');
    addGetter($DataView, BYTE_OFFSET, '_o');
  }

  redefineAll($DataView[PROTOTYPE], {
    getInt8: function getInt8(byteOffset) {
      return get(this, 1, byteOffset)[0] << 24 >> 24;
    },
    getUint8: function getUint8(byteOffset) {
      return get(this, 1, byteOffset)[0];
    },
    getInt16: function getInt16(byteOffset /* , littleEndian */) {
      var bytes = get(this, 2, byteOffset, arguments[1]);
      return (bytes[1] << 8 | bytes[0]) << 16 >> 16;
    },
    getUint16: function getUint16(byteOffset /* , littleEndian */) {
      var bytes = get(this, 2, byteOffset, arguments[1]);
      return bytes[1] << 8 | bytes[0];
    },
    getInt32: function getInt32(byteOffset /* , littleEndian */) {
      return unpackI32(get(this, 4, byteOffset, arguments[1]));
    },
    getUint32: function getUint32(byteOffset /* , littleEndian */) {
      return unpackI32(get(this, 4, byteOffset, arguments[1])) >>> 0;
    },
    getFloat32: function getFloat32(byteOffset /* , littleEndian */) {
      return unpackIEEE754(get(this, 4, byteOffset, arguments[1]), 23, 4);
    },
    getFloat64: function getFloat64(byteOffset /* , littleEndian */) {
      return unpackIEEE754(get(this, 8, byteOffset, arguments[1]), 52, 8);
    },
    setInt8: function setInt8(byteOffset, value) {
      set(this, 1, byteOffset, packI8, value);
    },
    setUint8: function setUint8(byteOffset, value) {
      set(this, 1, byteOffset, packI8, value);
    },
    setInt16: function setInt16(byteOffset, value /* , littleEndian */) {
      set(this, 2, byteOffset, packI16, value, arguments[2]);
    },
    setUint16: function setUint16(byteOffset, value /* , littleEndian */) {
      set(this, 2, byteOffset, packI16, value, arguments[2]);
    },
    setInt32: function setInt32(byteOffset, value /* , littleEndian */) {
      set(this, 4, byteOffset, packI32, value, arguments[2]);
    },
    setUint32: function setUint32(byteOffset, value /* , littleEndian */) {
      set(this, 4, byteOffset, packI32, value, arguments[2]);
    },
    setFloat32: function setFloat32(byteOffset, value /* , littleEndian */) {
      set(this, 4, byteOffset, packF32, value, arguments[2]);
    },
    setFloat64: function setFloat64(byteOffset, value /* , littleEndian */) {
      set(this, 8, byteOffset, packF64, value, arguments[2]);
    }
  });
} else {
  if (!fails(function () {
    $ArrayBuffer(1);
  }) || !fails(function () {
    new $ArrayBuffer(-1); // eslint-disable-line no-new
  }) || fails(function () {
    new $ArrayBuffer(); // eslint-disable-line no-new
    new $ArrayBuffer(1.5); // eslint-disable-line no-new
    new $ArrayBuffer(NaN); // eslint-disable-line no-new
    return $ArrayBuffer.name != ARRAY_BUFFER;
  })) {
    $ArrayBuffer = function ArrayBuffer(length) {
      anInstance(this, $ArrayBuffer);
      return new BaseBuffer(toIndex(length));
    };
    var ArrayBufferProto = $ArrayBuffer[PROTOTYPE] = BaseBuffer[PROTOTYPE];
    for (var keys = gOPN(BaseBuffer), j = 0, key; keys.length > j;) {
      if (!((key = keys[j++]) in $ArrayBuffer)) hide($ArrayBuffer, key, BaseBuffer[key]);
    }
    if (!LIBRARY) ArrayBufferProto.constructor = $ArrayBuffer;
  }
  // iOS Safari 7.x bug
  var view = new $DataView(new $ArrayBuffer(2));
  var $setInt8 = $DataView[PROTOTYPE].setInt8;
  view.setInt8(0, 2147483648);
  view.setInt8(1, 2147483649);
  if (view.getInt8(0) || !view.getInt8(1)) redefineAll($DataView[PROTOTYPE], {
    setInt8: function setInt8(byteOffset, value) {
      $setInt8.call(this, byteOffset, value << 24 >> 24);
    },
    setUint8: function setUint8(byteOffset, value) {
      $setInt8.call(this, byteOffset, value << 24 >> 24);
    }
  }, true);
}
setToStringTag($ArrayBuffer, ARRAY_BUFFER);
setToStringTag($DataView, DATA_VIEW);
hide($DataView[PROTOTYPE], $typed.VIEW, true);
exports[ARRAY_BUFFER] = $ArrayBuffer;
exports[DATA_VIEW] = $DataView;

},{"./_an-instance":29,"./_array-fill":32,"./_descriptors":52,"./_fails":58,"./_global":64,"./_hide":66,"./_library":83,"./_object-dp":95,"./_object-gopn":100,"./_redefine-all":114,"./_set-to-string-tag":124,"./_to-index":138,"./_to-integer":139,"./_to-length":141,"./_typed":146}],146:[function(require,module,exports){
var global = require('./_global');
var hide = require('./_hide');
var uid = require('./_uid');
var TYPED = uid('typed_array');
var VIEW = uid('view');
var ABV = !!(global.ArrayBuffer && global.DataView);
var CONSTR = ABV;
var i = 0;
var l = 9;
var Typed;

var TypedArrayConstructors = (
  'Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array'
).split(',');

while (i < l) {
  if (Typed = global[TypedArrayConstructors[i++]]) {
    hide(Typed.prototype, TYPED, true);
    hide(Typed.prototype, VIEW, true);
  } else CONSTR = false;
}

module.exports = {
  ABV: ABV,
  CONSTR: CONSTR,
  TYPED: TYPED,
  VIEW: VIEW
};

},{"./_global":64,"./_hide":66,"./_uid":147}],147:[function(require,module,exports){
var id = 0;
var px = Math.random();
module.exports = function (key) {
  return 'Symbol('.concat(key === undefined ? '' : key, ')_', (++id + px).toString(36));
};

},{}],148:[function(require,module,exports){
var global = require('./_global');
var navigator = global.navigator;

module.exports = navigator && navigator.userAgent || '';

},{"./_global":64}],149:[function(require,module,exports){
var isObject = require('./_is-object');
module.exports = function (it, TYPE) {
  if (!isObject(it) || it._t !== TYPE) throw TypeError('Incompatible receiver, ' + TYPE + ' required!');
  return it;
};

},{"./_is-object":75}],150:[function(require,module,exports){
var global = require('./_global');
var core = require('./_core');
var LIBRARY = require('./_library');
var wksExt = require('./_wks-ext');
var defineProperty = require('./_object-dp').f;
module.exports = function (name) {
  var $Symbol = core.Symbol || (core.Symbol = LIBRARY ? {} : global.Symbol || {});
  if (name.charAt(0) != '_' && !(name in $Symbol)) defineProperty($Symbol, name, { value: wksExt.f(name) });
};

},{"./_core":46,"./_global":64,"./_library":83,"./_object-dp":95,"./_wks-ext":151}],151:[function(require,module,exports){
exports.f = require('./_wks');

},{"./_wks":152}],152:[function(require,module,exports){
var store = require('./_shared')('wks');
var uid = require('./_uid');
var Symbol = require('./_global').Symbol;
var USE_SYMBOL = typeof Symbol == 'function';

var $exports = module.exports = function (name) {
  return store[name] || (store[name] =
    USE_SYMBOL && Symbol[name] || (USE_SYMBOL ? Symbol : uid)('Symbol.' + name));
};

$exports.store = store;

},{"./_global":64,"./_shared":126,"./_uid":147}],153:[function(require,module,exports){
var classof = require('./_classof');
var ITERATOR = require('./_wks')('iterator');
var Iterators = require('./_iterators');
module.exports = require('./_core').getIteratorMethod = function (it) {
  if (it != undefined) return it[ITERATOR]
    || it['@@iterator']
    || Iterators[classof(it)];
};

},{"./_classof":40,"./_core":46,"./_iterators":82,"./_wks":152}],154:[function(require,module,exports){
// https://github.com/benjamingr/RexExp.escape
var $export = require('./_export');
var $re = require('./_replacer')(/[\\^$*+?.()|[\]{}]/g, '\\$&');

$export($export.S, 'RegExp', { escape: function escape(it) { return $re(it); } });

},{"./_export":56,"./_replacer":118}],155:[function(require,module,exports){
// 22.1.3.3 Array.prototype.copyWithin(target, start, end = this.length)
var $export = require('./_export');

$export($export.P, 'Array', { copyWithin: require('./_array-copy-within') });

require('./_add-to-unscopables')('copyWithin');

},{"./_add-to-unscopables":27,"./_array-copy-within":31,"./_export":56}],156:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $every = require('./_array-methods')(4);

$export($export.P + $export.F * !require('./_strict-method')([].every, true), 'Array', {
  // 22.1.3.5 / 15.4.4.16 Array.prototype.every(callbackfn [, thisArg])
  every: function every(callbackfn /* , thisArg */) {
    return $every(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":35,"./_export":56,"./_strict-method":128}],157:[function(require,module,exports){
// 22.1.3.6 Array.prototype.fill(value, start = 0, end = this.length)
var $export = require('./_export');

$export($export.P, 'Array', { fill: require('./_array-fill') });

require('./_add-to-unscopables')('fill');

},{"./_add-to-unscopables":27,"./_array-fill":32,"./_export":56}],158:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $filter = require('./_array-methods')(2);

$export($export.P + $export.F * !require('./_strict-method')([].filter, true), 'Array', {
  // 22.1.3.7 / 15.4.4.20 Array.prototype.filter(callbackfn [, thisArg])
  filter: function filter(callbackfn /* , thisArg */) {
    return $filter(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":35,"./_export":56,"./_strict-method":128}],159:[function(require,module,exports){
'use strict';
// 22.1.3.9 Array.prototype.findIndex(predicate, thisArg = undefined)
var $export = require('./_export');
var $find = require('./_array-methods')(6);
var KEY = 'findIndex';
var forced = true;
// Shouldn't skip holes
if (KEY in []) Array(1)[KEY](function () { forced = false; });
$export($export.P + $export.F * forced, 'Array', {
  findIndex: function findIndex(callbackfn /* , that = undefined */) {
    return $find(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
  }
});
require('./_add-to-unscopables')(KEY);

},{"./_add-to-unscopables":27,"./_array-methods":35,"./_export":56}],160:[function(require,module,exports){
'use strict';
// 22.1.3.8 Array.prototype.find(predicate, thisArg = undefined)
var $export = require('./_export');
var $find = require('./_array-methods')(5);
var KEY = 'find';
var forced = true;
// Shouldn't skip holes
if (KEY in []) Array(1)[KEY](function () { forced = false; });
$export($export.P + $export.F * forced, 'Array', {
  find: function find(callbackfn /* , that = undefined */) {
    return $find(this, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
  }
});
require('./_add-to-unscopables')(KEY);

},{"./_add-to-unscopables":27,"./_array-methods":35,"./_export":56}],161:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $forEach = require('./_array-methods')(0);
var STRICT = require('./_strict-method')([].forEach, true);

$export($export.P + $export.F * !STRICT, 'Array', {
  // 22.1.3.10 / 15.4.4.18 Array.prototype.forEach(callbackfn [, thisArg])
  forEach: function forEach(callbackfn /* , thisArg */) {
    return $forEach(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":35,"./_export":56,"./_strict-method":128}],162:[function(require,module,exports){
'use strict';
var ctx = require('./_ctx');
var $export = require('./_export');
var toObject = require('./_to-object');
var call = require('./_iter-call');
var isArrayIter = require('./_is-array-iter');
var toLength = require('./_to-length');
var createProperty = require('./_create-property');
var getIterFn = require('./core.get-iterator-method');

$export($export.S + $export.F * !require('./_iter-detect')(function (iter) { Array.from(iter); }), 'Array', {
  // 22.1.2.1 Array.from(arrayLike, mapfn = undefined, thisArg = undefined)
  from: function from(arrayLike /* , mapfn = undefined, thisArg = undefined */) {
    var O = toObject(arrayLike);
    var C = typeof this == 'function' ? this : Array;
    var aLen = arguments.length;
    var mapfn = aLen > 1 ? arguments[1] : undefined;
    var mapping = mapfn !== undefined;
    var index = 0;
    var iterFn = getIterFn(O);
    var length, result, step, iterator;
    if (mapping) mapfn = ctx(mapfn, aLen > 2 ? arguments[2] : undefined, 2);
    // if object isn't iterable or it's array with default iterator - use simple case
    if (iterFn != undefined && !(C == Array && isArrayIter(iterFn))) {
      for (iterator = iterFn.call(O), result = new C(); !(step = iterator.next()).done; index++) {
        createProperty(result, index, mapping ? call(iterator, mapfn, [step.value, index], true) : step.value);
      }
    } else {
      length = toLength(O.length);
      for (result = new C(length); length > index; index++) {
        createProperty(result, index, mapping ? mapfn(O[index], index) : O[index]);
      }
    }
    result.length = index;
    return result;
  }
});

},{"./_create-property":47,"./_ctx":48,"./_export":56,"./_is-array-iter":72,"./_iter-call":77,"./_iter-detect":80,"./_to-length":141,"./_to-object":142,"./core.get-iterator-method":153}],163:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $indexOf = require('./_array-includes')(false);
var $native = [].indexOf;
var NEGATIVE_ZERO = !!$native && 1 / [1].indexOf(1, -0) < 0;

$export($export.P + $export.F * (NEGATIVE_ZERO || !require('./_strict-method')($native)), 'Array', {
  // 22.1.3.11 / 15.4.4.14 Array.prototype.indexOf(searchElement [, fromIndex])
  indexOf: function indexOf(searchElement /* , fromIndex = 0 */) {
    return NEGATIVE_ZERO
      // convert -0 to +0
      ? $native.apply(this, arguments) || 0
      : $indexOf(this, searchElement, arguments[1]);
  }
});

},{"./_array-includes":34,"./_export":56,"./_strict-method":128}],164:[function(require,module,exports){
// 22.1.2.2 / 15.4.3.2 Array.isArray(arg)
var $export = require('./_export');

$export($export.S, 'Array', { isArray: require('./_is-array') });

},{"./_export":56,"./_is-array":73}],165:[function(require,module,exports){
'use strict';
var addToUnscopables = require('./_add-to-unscopables');
var step = require('./_iter-step');
var Iterators = require('./_iterators');
var toIObject = require('./_to-iobject');

// 22.1.3.4 Array.prototype.entries()
// 22.1.3.13 Array.prototype.keys()
// 22.1.3.29 Array.prototype.values()
// 22.1.3.30 Array.prototype[@@iterator]()
module.exports = require('./_iter-define')(Array, 'Array', function (iterated, kind) {
  this._t = toIObject(iterated); // target
  this._i = 0;                   // next index
  this._k = kind;                // kind
// 22.1.5.2.1 %ArrayIteratorPrototype%.next()
}, function () {
  var O = this._t;
  var kind = this._k;
  var index = this._i++;
  if (!O || index >= O.length) {
    this._t = undefined;
    return step(1);
  }
  if (kind == 'keys') return step(0, index);
  if (kind == 'values') return step(0, O[index]);
  return step(0, [index, O[index]]);
}, 'values');

// argumentsList[@@iterator] is %ArrayProto_values% (9.4.4.6, 9.4.4.7)
Iterators.Arguments = Iterators.Array;

addToUnscopables('keys');
addToUnscopables('values');
addToUnscopables('entries');

},{"./_add-to-unscopables":27,"./_iter-define":79,"./_iter-step":81,"./_iterators":82,"./_to-iobject":140}],166:[function(require,module,exports){
'use strict';
// 22.1.3.13 Array.prototype.join(separator)
var $export = require('./_export');
var toIObject = require('./_to-iobject');
var arrayJoin = [].join;

// fallback for not array-like strings
$export($export.P + $export.F * (require('./_iobject') != Object || !require('./_strict-method')(arrayJoin)), 'Array', {
  join: function join(separator) {
    return arrayJoin.call(toIObject(this), separator === undefined ? ',' : separator);
  }
});

},{"./_export":56,"./_iobject":71,"./_strict-method":128,"./_to-iobject":140}],167:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var toIObject = require('./_to-iobject');
var toInteger = require('./_to-integer');
var toLength = require('./_to-length');
var $native = [].lastIndexOf;
var NEGATIVE_ZERO = !!$native && 1 / [1].lastIndexOf(1, -0) < 0;

$export($export.P + $export.F * (NEGATIVE_ZERO || !require('./_strict-method')($native)), 'Array', {
  // 22.1.3.14 / 15.4.4.15 Array.prototype.lastIndexOf(searchElement [, fromIndex])
  lastIndexOf: function lastIndexOf(searchElement /* , fromIndex = @[*-1] */) {
    // convert -0 to +0
    if (NEGATIVE_ZERO) return $native.apply(this, arguments) || 0;
    var O = toIObject(this);
    var length = toLength(O.length);
    var index = length - 1;
    if (arguments.length > 1) index = Math.min(index, toInteger(arguments[1]));
    if (index < 0) index = length + index;
    for (;index >= 0; index--) if (index in O) if (O[index] === searchElement) return index || 0;
    return -1;
  }
});

},{"./_export":56,"./_strict-method":128,"./_to-integer":139,"./_to-iobject":140,"./_to-length":141}],168:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $map = require('./_array-methods')(1);

$export($export.P + $export.F * !require('./_strict-method')([].map, true), 'Array', {
  // 22.1.3.15 / 15.4.4.19 Array.prototype.map(callbackfn [, thisArg])
  map: function map(callbackfn /* , thisArg */) {
    return $map(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":35,"./_export":56,"./_strict-method":128}],169:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var createProperty = require('./_create-property');

// WebKit Array.of isn't generic
$export($export.S + $export.F * require('./_fails')(function () {
  function F() { /* empty */ }
  return !(Array.of.call(F) instanceof F);
}), 'Array', {
  // 22.1.2.3 Array.of( ...items)
  of: function of(/* ...args */) {
    var index = 0;
    var aLen = arguments.length;
    var result = new (typeof this == 'function' ? this : Array)(aLen);
    while (aLen > index) createProperty(result, index, arguments[index++]);
    result.length = aLen;
    return result;
  }
});

},{"./_create-property":47,"./_export":56,"./_fails":58}],170:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $reduce = require('./_array-reduce');

$export($export.P + $export.F * !require('./_strict-method')([].reduceRight, true), 'Array', {
  // 22.1.3.19 / 15.4.4.22 Array.prototype.reduceRight(callbackfn [, initialValue])
  reduceRight: function reduceRight(callbackfn /* , initialValue */) {
    return $reduce(this, callbackfn, arguments.length, arguments[1], true);
  }
});

},{"./_array-reduce":36,"./_export":56,"./_strict-method":128}],171:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $reduce = require('./_array-reduce');

$export($export.P + $export.F * !require('./_strict-method')([].reduce, true), 'Array', {
  // 22.1.3.18 / 15.4.4.21 Array.prototype.reduce(callbackfn [, initialValue])
  reduce: function reduce(callbackfn /* , initialValue */) {
    return $reduce(this, callbackfn, arguments.length, arguments[1], false);
  }
});

},{"./_array-reduce":36,"./_export":56,"./_strict-method":128}],172:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var html = require('./_html');
var cof = require('./_cof');
var toAbsoluteIndex = require('./_to-absolute-index');
var toLength = require('./_to-length');
var arraySlice = [].slice;

// fallback for not array-like ES3 strings and DOM objects
$export($export.P + $export.F * require('./_fails')(function () {
  if (html) arraySlice.call(html);
}), 'Array', {
  slice: function slice(begin, end) {
    var len = toLength(this.length);
    var klass = cof(this);
    end = end === undefined ? len : end;
    if (klass == 'Array') return arraySlice.call(this, begin, end);
    var start = toAbsoluteIndex(begin, len);
    var upTo = toAbsoluteIndex(end, len);
    var size = toLength(upTo - start);
    var cloned = new Array(size);
    var i = 0;
    for (; i < size; i++) cloned[i] = klass == 'String'
      ? this.charAt(start + i)
      : this[start + i];
    return cloned;
  }
});

},{"./_cof":41,"./_export":56,"./_fails":58,"./_html":67,"./_to-absolute-index":137,"./_to-length":141}],173:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $some = require('./_array-methods')(3);

$export($export.P + $export.F * !require('./_strict-method')([].some, true), 'Array', {
  // 22.1.3.23 / 15.4.4.17 Array.prototype.some(callbackfn [, thisArg])
  some: function some(callbackfn /* , thisArg */) {
    return $some(this, callbackfn, arguments[1]);
  }
});

},{"./_array-methods":35,"./_export":56,"./_strict-method":128}],174:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var aFunction = require('./_a-function');
var toObject = require('./_to-object');
var fails = require('./_fails');
var $sort = [].sort;
var test = [1, 2, 3];

$export($export.P + $export.F * (fails(function () {
  // IE8-
  test.sort(undefined);
}) || !fails(function () {
  // V8 bug
  test.sort(null);
  // Old WebKit
}) || !require('./_strict-method')($sort)), 'Array', {
  // 22.1.3.25 Array.prototype.sort(comparefn)
  sort: function sort(comparefn) {
    return comparefn === undefined
      ? $sort.call(toObject(this))
      : $sort.call(toObject(this), aFunction(comparefn));
  }
});

},{"./_a-function":25,"./_export":56,"./_fails":58,"./_strict-method":128,"./_to-object":142}],175:[function(require,module,exports){
require('./_set-species')('Array');

},{"./_set-species":123}],176:[function(require,module,exports){
// 20.3.3.1 / 15.9.4.4 Date.now()
var $export = require('./_export');

$export($export.S, 'Date', { now: function () { return new Date().getTime(); } });

},{"./_export":56}],177:[function(require,module,exports){
// 20.3.4.36 / 15.9.5.43 Date.prototype.toISOString()
var $export = require('./_export');
var toISOString = require('./_date-to-iso-string');

// PhantomJS / old WebKit has a broken implementations
$export($export.P + $export.F * (Date.prototype.toISOString !== toISOString), 'Date', {
  toISOString: toISOString
});

},{"./_date-to-iso-string":49,"./_export":56}],178:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var toObject = require('./_to-object');
var toPrimitive = require('./_to-primitive');

$export($export.P + $export.F * require('./_fails')(function () {
  return new Date(NaN).toJSON() !== null
    || Date.prototype.toJSON.call({ toISOString: function () { return 1; } }) !== 1;
}), 'Date', {
  // eslint-disable-next-line no-unused-vars
  toJSON: function toJSON(key) {
    var O = toObject(this);
    var pv = toPrimitive(O);
    return typeof pv == 'number' && !isFinite(pv) ? null : O.toISOString();
  }
});

},{"./_export":56,"./_fails":58,"./_to-object":142,"./_to-primitive":143}],179:[function(require,module,exports){
var TO_PRIMITIVE = require('./_wks')('toPrimitive');
var proto = Date.prototype;

if (!(TO_PRIMITIVE in proto)) require('./_hide')(proto, TO_PRIMITIVE, require('./_date-to-primitive'));

},{"./_date-to-primitive":50,"./_hide":66,"./_wks":152}],180:[function(require,module,exports){
var DateProto = Date.prototype;
var INVALID_DATE = 'Invalid Date';
var TO_STRING = 'toString';
var $toString = DateProto[TO_STRING];
var getTime = DateProto.getTime;
if (new Date(NaN) + '' != INVALID_DATE) {
  require('./_redefine')(DateProto, TO_STRING, function toString() {
    var value = getTime.call(this);
    // eslint-disable-next-line no-self-compare
    return value === value ? $toString.call(this) : INVALID_DATE;
  });
}

},{"./_redefine":115}],181:[function(require,module,exports){
// 19.2.3.2 / 15.3.4.5 Function.prototype.bind(thisArg, args...)
var $export = require('./_export');

$export($export.P, 'Function', { bind: require('./_bind') });

},{"./_bind":39,"./_export":56}],182:[function(require,module,exports){
'use strict';
var isObject = require('./_is-object');
var getPrototypeOf = require('./_object-gpo');
var HAS_INSTANCE = require('./_wks')('hasInstance');
var FunctionProto = Function.prototype;
// 19.2.3.6 Function.prototype[@@hasInstance](V)
if (!(HAS_INSTANCE in FunctionProto)) require('./_object-dp').f(FunctionProto, HAS_INSTANCE, { value: function (O) {
  if (typeof this != 'function' || !isObject(O)) return false;
  if (!isObject(this.prototype)) return O instanceof this;
  // for environment w/o native `@@hasInstance` logic enough `instanceof`, but add this:
  while (O = getPrototypeOf(O)) if (this.prototype === O) return true;
  return false;
} });

},{"./_is-object":75,"./_object-dp":95,"./_object-gpo":102,"./_wks":152}],183:[function(require,module,exports){
var dP = require('./_object-dp').f;
var FProto = Function.prototype;
var nameRE = /^\s*function ([^ (]*)/;
var NAME = 'name';

// 19.2.4.2 name
NAME in FProto || require('./_descriptors') && dP(FProto, NAME, {
  configurable: true,
  get: function () {
    try {
      return ('' + this).match(nameRE)[1];
    } catch (e) {
      return '';
    }
  }
});

},{"./_descriptors":52,"./_object-dp":95}],184:[function(require,module,exports){
'use strict';
var strong = require('./_collection-strong');
var validate = require('./_validate-collection');
var MAP = 'Map';

// 23.1 Map Objects
module.exports = require('./_collection')(MAP, function (get) {
  return function Map() { return get(this, arguments.length > 0 ? arguments[0] : undefined); };
}, {
  // 23.1.3.6 Map.prototype.get(key)
  get: function get(key) {
    var entry = strong.getEntry(validate(this, MAP), key);
    return entry && entry.v;
  },
  // 23.1.3.9 Map.prototype.set(key, value)
  set: function set(key, value) {
    return strong.def(validate(this, MAP), key === 0 ? 0 : key, value);
  }
}, strong, true);

},{"./_collection":45,"./_collection-strong":42,"./_validate-collection":149}],185:[function(require,module,exports){
// 20.2.2.3 Math.acosh(x)
var $export = require('./_export');
var log1p = require('./_math-log1p');
var sqrt = Math.sqrt;
var $acosh = Math.acosh;

$export($export.S + $export.F * !($acosh
  // V8 bug: https://code.google.com/p/v8/issues/detail?id=3509
  && Math.floor($acosh(Number.MAX_VALUE)) == 710
  // Tor Browser bug: Math.acosh(Infinity) -> NaN
  && $acosh(Infinity) == Infinity
), 'Math', {
  acosh: function acosh(x) {
    return (x = +x) < 1 ? NaN : x > 94906265.62425156
      ? Math.log(x) + Math.LN2
      : log1p(x - 1 + sqrt(x - 1) * sqrt(x + 1));
  }
});

},{"./_export":56,"./_math-log1p":86}],186:[function(require,module,exports){
// 20.2.2.5 Math.asinh(x)
var $export = require('./_export');
var $asinh = Math.asinh;

function asinh(x) {
  return !isFinite(x = +x) || x == 0 ? x : x < 0 ? -asinh(-x) : Math.log(x + Math.sqrt(x * x + 1));
}

// Tor Browser bug: Math.asinh(0) -> -0
$export($export.S + $export.F * !($asinh && 1 / $asinh(0) > 0), 'Math', { asinh: asinh });

},{"./_export":56}],187:[function(require,module,exports){
// 20.2.2.7 Math.atanh(x)
var $export = require('./_export');
var $atanh = Math.atanh;

// Tor Browser bug: Math.atanh(-0) -> 0
$export($export.S + $export.F * !($atanh && 1 / $atanh(-0) < 0), 'Math', {
  atanh: function atanh(x) {
    return (x = +x) == 0 ? x : Math.log((1 + x) / (1 - x)) / 2;
  }
});

},{"./_export":56}],188:[function(require,module,exports){
// 20.2.2.9 Math.cbrt(x)
var $export = require('./_export');
var sign = require('./_math-sign');

$export($export.S, 'Math', {
  cbrt: function cbrt(x) {
    return sign(x = +x) * Math.pow(Math.abs(x), 1 / 3);
  }
});

},{"./_export":56,"./_math-sign":88}],189:[function(require,module,exports){
// 20.2.2.11 Math.clz32(x)
var $export = require('./_export');

$export($export.S, 'Math', {
  clz32: function clz32(x) {
    return (x >>>= 0) ? 31 - Math.floor(Math.log(x + 0.5) * Math.LOG2E) : 32;
  }
});

},{"./_export":56}],190:[function(require,module,exports){
// 20.2.2.12 Math.cosh(x)
var $export = require('./_export');
var exp = Math.exp;

$export($export.S, 'Math', {
  cosh: function cosh(x) {
    return (exp(x = +x) + exp(-x)) / 2;
  }
});

},{"./_export":56}],191:[function(require,module,exports){
// 20.2.2.14 Math.expm1(x)
var $export = require('./_export');
var $expm1 = require('./_math-expm1');

$export($export.S + $export.F * ($expm1 != Math.expm1), 'Math', { expm1: $expm1 });

},{"./_export":56,"./_math-expm1":84}],192:[function(require,module,exports){
// 20.2.2.16 Math.fround(x)
var $export = require('./_export');

$export($export.S, 'Math', { fround: require('./_math-fround') });

},{"./_export":56,"./_math-fround":85}],193:[function(require,module,exports){
// 20.2.2.17 Math.hypot([value1[, value2[, … ]]])
var $export = require('./_export');
var abs = Math.abs;

$export($export.S, 'Math', {
  hypot: function hypot(value1, value2) { // eslint-disable-line no-unused-vars
    var sum = 0;
    var i = 0;
    var aLen = arguments.length;
    var larg = 0;
    var arg, div;
    while (i < aLen) {
      arg = abs(arguments[i++]);
      if (larg < arg) {
        div = larg / arg;
        sum = sum * div * div + 1;
        larg = arg;
      } else if (arg > 0) {
        div = arg / larg;
        sum += div * div;
      } else sum += arg;
    }
    return larg === Infinity ? Infinity : larg * Math.sqrt(sum);
  }
});

},{"./_export":56}],194:[function(require,module,exports){
// 20.2.2.18 Math.imul(x, y)
var $export = require('./_export');
var $imul = Math.imul;

// some WebKit versions fails with big numbers, some has wrong arity
$export($export.S + $export.F * require('./_fails')(function () {
  return $imul(0xffffffff, 5) != -5 || $imul.length != 2;
}), 'Math', {
  imul: function imul(x, y) {
    var UINT16 = 0xffff;
    var xn = +x;
    var yn = +y;
    var xl = UINT16 & xn;
    var yl = UINT16 & yn;
    return 0 | xl * yl + ((UINT16 & xn >>> 16) * yl + xl * (UINT16 & yn >>> 16) << 16 >>> 0);
  }
});

},{"./_export":56,"./_fails":58}],195:[function(require,module,exports){
// 20.2.2.21 Math.log10(x)
var $export = require('./_export');

$export($export.S, 'Math', {
  log10: function log10(x) {
    return Math.log(x) * Math.LOG10E;
  }
});

},{"./_export":56}],196:[function(require,module,exports){
// 20.2.2.20 Math.log1p(x)
var $export = require('./_export');

$export($export.S, 'Math', { log1p: require('./_math-log1p') });

},{"./_export":56,"./_math-log1p":86}],197:[function(require,module,exports){
// 20.2.2.22 Math.log2(x)
var $export = require('./_export');

$export($export.S, 'Math', {
  log2: function log2(x) {
    return Math.log(x) / Math.LN2;
  }
});

},{"./_export":56}],198:[function(require,module,exports){
// 20.2.2.28 Math.sign(x)
var $export = require('./_export');

$export($export.S, 'Math', { sign: require('./_math-sign') });

},{"./_export":56,"./_math-sign":88}],199:[function(require,module,exports){
// 20.2.2.30 Math.sinh(x)
var $export = require('./_export');
var expm1 = require('./_math-expm1');
var exp = Math.exp;

// V8 near Chromium 38 has a problem with very small numbers
$export($export.S + $export.F * require('./_fails')(function () {
  return !Math.sinh(-2e-17) != -2e-17;
}), 'Math', {
  sinh: function sinh(x) {
    return Math.abs(x = +x) < 1
      ? (expm1(x) - expm1(-x)) / 2
      : (exp(x - 1) - exp(-x - 1)) * (Math.E / 2);
  }
});

},{"./_export":56,"./_fails":58,"./_math-expm1":84}],200:[function(require,module,exports){
// 20.2.2.33 Math.tanh(x)
var $export = require('./_export');
var expm1 = require('./_math-expm1');
var exp = Math.exp;

$export($export.S, 'Math', {
  tanh: function tanh(x) {
    var a = expm1(x = +x);
    var b = expm1(-x);
    return a == Infinity ? 1 : b == Infinity ? -1 : (a - b) / (exp(x) + exp(-x));
  }
});

},{"./_export":56,"./_math-expm1":84}],201:[function(require,module,exports){
// 20.2.2.34 Math.trunc(x)
var $export = require('./_export');

$export($export.S, 'Math', {
  trunc: function trunc(it) {
    return (it > 0 ? Math.floor : Math.ceil)(it);
  }
});

},{"./_export":56}],202:[function(require,module,exports){
'use strict';
var global = require('./_global');
var has = require('./_has');
var cof = require('./_cof');
var inheritIfRequired = require('./_inherit-if-required');
var toPrimitive = require('./_to-primitive');
var fails = require('./_fails');
var gOPN = require('./_object-gopn').f;
var gOPD = require('./_object-gopd').f;
var dP = require('./_object-dp').f;
var $trim = require('./_string-trim').trim;
var NUMBER = 'Number';
var $Number = global[NUMBER];
var Base = $Number;
var proto = $Number.prototype;
// Opera ~12 has broken Object#toString
var BROKEN_COF = cof(require('./_object-create')(proto)) == NUMBER;
var TRIM = 'trim' in String.prototype;

// 7.1.3 ToNumber(argument)
var toNumber = function (argument) {
  var it = toPrimitive(argument, false);
  if (typeof it == 'string' && it.length > 2) {
    it = TRIM ? it.trim() : $trim(it, 3);
    var first = it.charCodeAt(0);
    var third, radix, maxCode;
    if (first === 43 || first === 45) {
      third = it.charCodeAt(2);
      if (third === 88 || third === 120) return NaN; // Number('+0x1') should be NaN, old V8 fix
    } else if (first === 48) {
      switch (it.charCodeAt(1)) {
        case 66: case 98: radix = 2; maxCode = 49; break; // fast equal /^0b[01]+$/i
        case 79: case 111: radix = 8; maxCode = 55; break; // fast equal /^0o[0-7]+$/i
        default: return +it;
      }
      for (var digits = it.slice(2), i = 0, l = digits.length, code; i < l; i++) {
        code = digits.charCodeAt(i);
        // parseInt parses a string to a first unavailable symbol
        // but ToNumber should return NaN if a string contains unavailable symbols
        if (code < 48 || code > maxCode) return NaN;
      } return parseInt(digits, radix);
    }
  } return +it;
};

if (!$Number(' 0o1') || !$Number('0b1') || $Number('+0x1')) {
  $Number = function Number(value) {
    var it = arguments.length < 1 ? 0 : value;
    var that = this;
    return that instanceof $Number
      // check on 1..constructor(foo) case
      && (BROKEN_COF ? fails(function () { proto.valueOf.call(that); }) : cof(that) != NUMBER)
        ? inheritIfRequired(new Base(toNumber(it)), that, $Number) : toNumber(it);
  };
  for (var keys = require('./_descriptors') ? gOPN(Base) : (
    // ES3:
    'MAX_VALUE,MIN_VALUE,NaN,NEGATIVE_INFINITY,POSITIVE_INFINITY,' +
    // ES6 (in case, if modules with ES6 Number statics required before):
    'EPSILON,isFinite,isInteger,isNaN,isSafeInteger,MAX_SAFE_INTEGER,' +
    'MIN_SAFE_INTEGER,parseFloat,parseInt,isInteger'
  ).split(','), j = 0, key; keys.length > j; j++) {
    if (has(Base, key = keys[j]) && !has($Number, key)) {
      dP($Number, key, gOPD(Base, key));
    }
  }
  $Number.prototype = proto;
  proto.constructor = $Number;
  require('./_redefine')(global, NUMBER, $Number);
}

},{"./_cof":41,"./_descriptors":52,"./_fails":58,"./_global":64,"./_has":65,"./_inherit-if-required":69,"./_object-create":94,"./_object-dp":95,"./_object-gopd":98,"./_object-gopn":100,"./_redefine":115,"./_string-trim":134,"./_to-primitive":143}],203:[function(require,module,exports){
// 20.1.2.1 Number.EPSILON
var $export = require('./_export');

$export($export.S, 'Number', { EPSILON: Math.pow(2, -52) });

},{"./_export":56}],204:[function(require,module,exports){
// 20.1.2.2 Number.isFinite(number)
var $export = require('./_export');
var _isFinite = require('./_global').isFinite;

$export($export.S, 'Number', {
  isFinite: function isFinite(it) {
    return typeof it == 'number' && _isFinite(it);
  }
});

},{"./_export":56,"./_global":64}],205:[function(require,module,exports){
// 20.1.2.3 Number.isInteger(number)
var $export = require('./_export');

$export($export.S, 'Number', { isInteger: require('./_is-integer') });

},{"./_export":56,"./_is-integer":74}],206:[function(require,module,exports){
// 20.1.2.4 Number.isNaN(number)
var $export = require('./_export');

$export($export.S, 'Number', {
  isNaN: function isNaN(number) {
    // eslint-disable-next-line no-self-compare
    return number != number;
  }
});

},{"./_export":56}],207:[function(require,module,exports){
// 20.1.2.5 Number.isSafeInteger(number)
var $export = require('./_export');
var isInteger = require('./_is-integer');
var abs = Math.abs;

$export($export.S, 'Number', {
  isSafeInteger: function isSafeInteger(number) {
    return isInteger(number) && abs(number) <= 0x1fffffffffffff;
  }
});

},{"./_export":56,"./_is-integer":74}],208:[function(require,module,exports){
// 20.1.2.6 Number.MAX_SAFE_INTEGER
var $export = require('./_export');

$export($export.S, 'Number', { MAX_SAFE_INTEGER: 0x1fffffffffffff });

},{"./_export":56}],209:[function(require,module,exports){
// 20.1.2.10 Number.MIN_SAFE_INTEGER
var $export = require('./_export');

$export($export.S, 'Number', { MIN_SAFE_INTEGER: -0x1fffffffffffff });

},{"./_export":56}],210:[function(require,module,exports){
var $export = require('./_export');
var $parseFloat = require('./_parse-float');
// 20.1.2.12 Number.parseFloat(string)
$export($export.S + $export.F * (Number.parseFloat != $parseFloat), 'Number', { parseFloat: $parseFloat });

},{"./_export":56,"./_parse-float":109}],211:[function(require,module,exports){
var $export = require('./_export');
var $parseInt = require('./_parse-int');
// 20.1.2.13 Number.parseInt(string, radix)
$export($export.S + $export.F * (Number.parseInt != $parseInt), 'Number', { parseInt: $parseInt });

},{"./_export":56,"./_parse-int":110}],212:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var toInteger = require('./_to-integer');
var aNumberValue = require('./_a-number-value');
var repeat = require('./_string-repeat');
var $toFixed = 1.0.toFixed;
var floor = Math.floor;
var data = [0, 0, 0, 0, 0, 0];
var ERROR = 'Number.toFixed: incorrect invocation!';
var ZERO = '0';

var multiply = function (n, c) {
  var i = -1;
  var c2 = c;
  while (++i < 6) {
    c2 += n * data[i];
    data[i] = c2 % 1e7;
    c2 = floor(c2 / 1e7);
  }
};
var divide = function (n) {
  var i = 6;
  var c = 0;
  while (--i >= 0) {
    c += data[i];
    data[i] = floor(c / n);
    c = (c % n) * 1e7;
  }
};
var numToString = function () {
  var i = 6;
  var s = '';
  while (--i >= 0) {
    if (s !== '' || i === 0 || data[i] !== 0) {
      var t = String(data[i]);
      s = s === '' ? t : s + repeat.call(ZERO, 7 - t.length) + t;
    }
  } return s;
};
var pow = function (x, n, acc) {
  return n === 0 ? acc : n % 2 === 1 ? pow(x, n - 1, acc * x) : pow(x * x, n / 2, acc);
};
var log = function (x) {
  var n = 0;
  var x2 = x;
  while (x2 >= 4096) {
    n += 12;
    x2 /= 4096;
  }
  while (x2 >= 2) {
    n += 1;
    x2 /= 2;
  } return n;
};

$export($export.P + $export.F * (!!$toFixed && (
  0.00008.toFixed(3) !== '0.000' ||
  0.9.toFixed(0) !== '1' ||
  1.255.toFixed(2) !== '1.25' ||
  1000000000000000128.0.toFixed(0) !== '1000000000000000128'
) || !require('./_fails')(function () {
  // V8 ~ Android 4.3-
  $toFixed.call({});
})), 'Number', {
  toFixed: function toFixed(fractionDigits) {
    var x = aNumberValue(this, ERROR);
    var f = toInteger(fractionDigits);
    var s = '';
    var m = ZERO;
    var e, z, j, k;
    if (f < 0 || f > 20) throw RangeError(ERROR);
    // eslint-disable-next-line no-self-compare
    if (x != x) return 'NaN';
    if (x <= -1e21 || x >= 1e21) return String(x);
    if (x < 0) {
      s = '-';
      x = -x;
    }
    if (x > 1e-21) {
      e = log(x * pow(2, 69, 1)) - 69;
      z = e < 0 ? x * pow(2, -e, 1) : x / pow(2, e, 1);
      z *= 0x10000000000000;
      e = 52 - e;
      if (e > 0) {
        multiply(0, z);
        j = f;
        while (j >= 7) {
          multiply(1e7, 0);
          j -= 7;
        }
        multiply(pow(10, j, 1), 0);
        j = e - 1;
        while (j >= 23) {
          divide(1 << 23);
          j -= 23;
        }
        divide(1 << j);
        multiply(1, 1);
        divide(2);
        m = numToString();
      } else {
        multiply(0, z);
        multiply(1 << -e, 0);
        m = numToString() + repeat.call(ZERO, f);
      }
    }
    if (f > 0) {
      k = m.length;
      m = s + (k <= f ? '0.' + repeat.call(ZERO, f - k) + m : m.slice(0, k - f) + '.' + m.slice(k - f));
    } else {
      m = s + m;
    } return m;
  }
});

},{"./_a-number-value":26,"./_export":56,"./_fails":58,"./_string-repeat":133,"./_to-integer":139}],213:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $fails = require('./_fails');
var aNumberValue = require('./_a-number-value');
var $toPrecision = 1.0.toPrecision;

$export($export.P + $export.F * ($fails(function () {
  // IE7-
  return $toPrecision.call(1, undefined) !== '1';
}) || !$fails(function () {
  // V8 ~ Android 4.3-
  $toPrecision.call({});
})), 'Number', {
  toPrecision: function toPrecision(precision) {
    var that = aNumberValue(this, 'Number#toPrecision: incorrect invocation!');
    return precision === undefined ? $toPrecision.call(that) : $toPrecision.call(that, precision);
  }
});

},{"./_a-number-value":26,"./_export":56,"./_fails":58}],214:[function(require,module,exports){
// 19.1.3.1 Object.assign(target, source)
var $export = require('./_export');

$export($export.S + $export.F, 'Object', { assign: require('./_object-assign') });

},{"./_export":56,"./_object-assign":93}],215:[function(require,module,exports){
var $export = require('./_export');
// 19.1.2.2 / 15.2.3.5 Object.create(O [, Properties])
$export($export.S, 'Object', { create: require('./_object-create') });

},{"./_export":56,"./_object-create":94}],216:[function(require,module,exports){
var $export = require('./_export');
// 19.1.2.3 / 15.2.3.7 Object.defineProperties(O, Properties)
$export($export.S + $export.F * !require('./_descriptors'), 'Object', { defineProperties: require('./_object-dps') });

},{"./_descriptors":52,"./_export":56,"./_object-dps":96}],217:[function(require,module,exports){
var $export = require('./_export');
// 19.1.2.4 / 15.2.3.6 Object.defineProperty(O, P, Attributes)
$export($export.S + $export.F * !require('./_descriptors'), 'Object', { defineProperty: require('./_object-dp').f });

},{"./_descriptors":52,"./_export":56,"./_object-dp":95}],218:[function(require,module,exports){
// 19.1.2.5 Object.freeze(O)
var isObject = require('./_is-object');
var meta = require('./_meta').onFreeze;

require('./_object-sap')('freeze', function ($freeze) {
  return function freeze(it) {
    return $freeze && isObject(it) ? $freeze(meta(it)) : it;
  };
});

},{"./_is-object":75,"./_meta":89,"./_object-sap":106}],219:[function(require,module,exports){
// 19.1.2.6 Object.getOwnPropertyDescriptor(O, P)
var toIObject = require('./_to-iobject');
var $getOwnPropertyDescriptor = require('./_object-gopd').f;

require('./_object-sap')('getOwnPropertyDescriptor', function () {
  return function getOwnPropertyDescriptor(it, key) {
    return $getOwnPropertyDescriptor(toIObject(it), key);
  };
});

},{"./_object-gopd":98,"./_object-sap":106,"./_to-iobject":140}],220:[function(require,module,exports){
// 19.1.2.7 Object.getOwnPropertyNames(O)
require('./_object-sap')('getOwnPropertyNames', function () {
  return require('./_object-gopn-ext').f;
});

},{"./_object-gopn-ext":99,"./_object-sap":106}],221:[function(require,module,exports){
// 19.1.2.9 Object.getPrototypeOf(O)
var toObject = require('./_to-object');
var $getPrototypeOf = require('./_object-gpo');

require('./_object-sap')('getPrototypeOf', function () {
  return function getPrototypeOf(it) {
    return $getPrototypeOf(toObject(it));
  };
});

},{"./_object-gpo":102,"./_object-sap":106,"./_to-object":142}],222:[function(require,module,exports){
// 19.1.2.11 Object.isExtensible(O)
var isObject = require('./_is-object');

require('./_object-sap')('isExtensible', function ($isExtensible) {
  return function isExtensible(it) {
    return isObject(it) ? $isExtensible ? $isExtensible(it) : true : false;
  };
});

},{"./_is-object":75,"./_object-sap":106}],223:[function(require,module,exports){
// 19.1.2.12 Object.isFrozen(O)
var isObject = require('./_is-object');

require('./_object-sap')('isFrozen', function ($isFrozen) {
  return function isFrozen(it) {
    return isObject(it) ? $isFrozen ? $isFrozen(it) : false : true;
  };
});

},{"./_is-object":75,"./_object-sap":106}],224:[function(require,module,exports){
// 19.1.2.13 Object.isSealed(O)
var isObject = require('./_is-object');

require('./_object-sap')('isSealed', function ($isSealed) {
  return function isSealed(it) {
    return isObject(it) ? $isSealed ? $isSealed(it) : false : true;
  };
});

},{"./_is-object":75,"./_object-sap":106}],225:[function(require,module,exports){
// 19.1.3.10 Object.is(value1, value2)
var $export = require('./_export');
$export($export.S, 'Object', { is: require('./_same-value') });

},{"./_export":56,"./_same-value":119}],226:[function(require,module,exports){
// 19.1.2.14 Object.keys(O)
var toObject = require('./_to-object');
var $keys = require('./_object-keys');

require('./_object-sap')('keys', function () {
  return function keys(it) {
    return $keys(toObject(it));
  };
});

},{"./_object-keys":104,"./_object-sap":106,"./_to-object":142}],227:[function(require,module,exports){
// 19.1.2.15 Object.preventExtensions(O)
var isObject = require('./_is-object');
var meta = require('./_meta').onFreeze;

require('./_object-sap')('preventExtensions', function ($preventExtensions) {
  return function preventExtensions(it) {
    return $preventExtensions && isObject(it) ? $preventExtensions(meta(it)) : it;
  };
});

},{"./_is-object":75,"./_meta":89,"./_object-sap":106}],228:[function(require,module,exports){
// 19.1.2.17 Object.seal(O)
var isObject = require('./_is-object');
var meta = require('./_meta').onFreeze;

require('./_object-sap')('seal', function ($seal) {
  return function seal(it) {
    return $seal && isObject(it) ? $seal(meta(it)) : it;
  };
});

},{"./_is-object":75,"./_meta":89,"./_object-sap":106}],229:[function(require,module,exports){
// 19.1.3.19 Object.setPrototypeOf(O, proto)
var $export = require('./_export');
$export($export.S, 'Object', { setPrototypeOf: require('./_set-proto').set });

},{"./_export":56,"./_set-proto":122}],230:[function(require,module,exports){
'use strict';
// 19.1.3.6 Object.prototype.toString()
var classof = require('./_classof');
var test = {};
test[require('./_wks')('toStringTag')] = 'z';
if (test + '' != '[object z]') {
  require('./_redefine')(Object.prototype, 'toString', function toString() {
    return '[object ' + classof(this) + ']';
  }, true);
}

},{"./_classof":40,"./_redefine":115,"./_wks":152}],231:[function(require,module,exports){
var $export = require('./_export');
var $parseFloat = require('./_parse-float');
// 18.2.4 parseFloat(string)
$export($export.G + $export.F * (parseFloat != $parseFloat), { parseFloat: $parseFloat });

},{"./_export":56,"./_parse-float":109}],232:[function(require,module,exports){
var $export = require('./_export');
var $parseInt = require('./_parse-int');
// 18.2.5 parseInt(string, radix)
$export($export.G + $export.F * (parseInt != $parseInt), { parseInt: $parseInt });

},{"./_export":56,"./_parse-int":110}],233:[function(require,module,exports){
'use strict';
var LIBRARY = require('./_library');
var global = require('./_global');
var ctx = require('./_ctx');
var classof = require('./_classof');
var $export = require('./_export');
var isObject = require('./_is-object');
var aFunction = require('./_a-function');
var anInstance = require('./_an-instance');
var forOf = require('./_for-of');
var speciesConstructor = require('./_species-constructor');
var task = require('./_task').set;
var microtask = require('./_microtask')();
var newPromiseCapabilityModule = require('./_new-promise-capability');
var perform = require('./_perform');
var userAgent = require('./_user-agent');
var promiseResolve = require('./_promise-resolve');
var PROMISE = 'Promise';
var TypeError = global.TypeError;
var process = global.process;
var versions = process && process.versions;
var v8 = versions && versions.v8 || '';
var $Promise = global[PROMISE];
var isNode = classof(process) == 'process';
var empty = function () { /* empty */ };
var Internal, newGenericPromiseCapability, OwnPromiseCapability, Wrapper;
var newPromiseCapability = newGenericPromiseCapability = newPromiseCapabilityModule.f;

var USE_NATIVE = !!function () {
  try {
    // correct subclassing with @@species support
    var promise = $Promise.resolve(1);
    var FakePromise = (promise.constructor = {})[require('./_wks')('species')] = function (exec) {
      exec(empty, empty);
    };
    // unhandled rejections tracking support, NodeJS Promise without it fails @@species test
    return (isNode || typeof PromiseRejectionEvent == 'function')
      && promise.then(empty) instanceof FakePromise
      // v8 6.6 (Node 10 and Chrome 66) have a bug with resolving custom thenables
      // https://bugs.chromium.org/p/chromium/issues/detail?id=830565
      // we can't detect it synchronously, so just check versions
      && v8.indexOf('6.6') !== 0
      && userAgent.indexOf('Chrome/66') === -1;
  } catch (e) { /* empty */ }
}();

// helpers
var isThenable = function (it) {
  var then;
  return isObject(it) && typeof (then = it.then) == 'function' ? then : false;
};
var notify = function (promise, isReject) {
  if (promise._n) return;
  promise._n = true;
  var chain = promise._c;
  microtask(function () {
    var value = promise._v;
    var ok = promise._s == 1;
    var i = 0;
    var run = function (reaction) {
      var handler = ok ? reaction.ok : reaction.fail;
      var resolve = reaction.resolve;
      var reject = reaction.reject;
      var domain = reaction.domain;
      var result, then, exited;
      try {
        if (handler) {
          if (!ok) {
            if (promise._h == 2) onHandleUnhandled(promise);
            promise._h = 1;
          }
          if (handler === true) result = value;
          else {
            if (domain) domain.enter();
            result = handler(value); // may throw
            if (domain) {
              domain.exit();
              exited = true;
            }
          }
          if (result === reaction.promise) {
            reject(TypeError('Promise-chain cycle'));
          } else if (then = isThenable(result)) {
            then.call(result, resolve, reject);
          } else resolve(result);
        } else reject(value);
      } catch (e) {
        if (domain && !exited) domain.exit();
        reject(e);
      }
    };
    while (chain.length > i) run(chain[i++]); // variable length - can't use forEach
    promise._c = [];
    promise._n = false;
    if (isReject && !promise._h) onUnhandled(promise);
  });
};
var onUnhandled = function (promise) {
  task.call(global, function () {
    var value = promise._v;
    var unhandled = isUnhandled(promise);
    var result, handler, console;
    if (unhandled) {
      result = perform(function () {
        if (isNode) {
          process.emit('unhandledRejection', value, promise);
        } else if (handler = global.onunhandledrejection) {
          handler({ promise: promise, reason: value });
        } else if ((console = global.console) && console.error) {
          console.error('Unhandled promise rejection', value);
        }
      });
      // Browsers should not trigger `rejectionHandled` event if it was handled here, NodeJS - should
      promise._h = isNode || isUnhandled(promise) ? 2 : 1;
    } promise._a = undefined;
    if (unhandled && result.e) throw result.v;
  });
};
var isUnhandled = function (promise) {
  return promise._h !== 1 && (promise._a || promise._c).length === 0;
};
var onHandleUnhandled = function (promise) {
  task.call(global, function () {
    var handler;
    if (isNode) {
      process.emit('rejectionHandled', promise);
    } else if (handler = global.onrejectionhandled) {
      handler({ promise: promise, reason: promise._v });
    }
  });
};
var $reject = function (value) {
  var promise = this;
  if (promise._d) return;
  promise._d = true;
  promise = promise._w || promise; // unwrap
  promise._v = value;
  promise._s = 2;
  if (!promise._a) promise._a = promise._c.slice();
  notify(promise, true);
};
var $resolve = function (value) {
  var promise = this;
  var then;
  if (promise._d) return;
  promise._d = true;
  promise = promise._w || promise; // unwrap
  try {
    if (promise === value) throw TypeError("Promise can't be resolved itself");
    if (then = isThenable(value)) {
      microtask(function () {
        var wrapper = { _w: promise, _d: false }; // wrap
        try {
          then.call(value, ctx($resolve, wrapper, 1), ctx($reject, wrapper, 1));
        } catch (e) {
          $reject.call(wrapper, e);
        }
      });
    } else {
      promise._v = value;
      promise._s = 1;
      notify(promise, false);
    }
  } catch (e) {
    $reject.call({ _w: promise, _d: false }, e); // wrap
  }
};

// constructor polyfill
if (!USE_NATIVE) {
  // 25.4.3.1 Promise(executor)
  $Promise = function Promise(executor) {
    anInstance(this, $Promise, PROMISE, '_h');
    aFunction(executor);
    Internal.call(this);
    try {
      executor(ctx($resolve, this, 1), ctx($reject, this, 1));
    } catch (err) {
      $reject.call(this, err);
    }
  };
  // eslint-disable-next-line no-unused-vars
  Internal = function Promise(executor) {
    this._c = [];             // <- awaiting reactions
    this._a = undefined;      // <- checked in isUnhandled reactions
    this._s = 0;              // <- state
    this._d = false;          // <- done
    this._v = undefined;      // <- value
    this._h = 0;              // <- rejection state, 0 - default, 1 - handled, 2 - unhandled
    this._n = false;          // <- notify
  };
  Internal.prototype = require('./_redefine-all')($Promise.prototype, {
    // 25.4.5.3 Promise.prototype.then(onFulfilled, onRejected)
    then: function then(onFulfilled, onRejected) {
      var reaction = newPromiseCapability(speciesConstructor(this, $Promise));
      reaction.ok = typeof onFulfilled == 'function' ? onFulfilled : true;
      reaction.fail = typeof onRejected == 'function' && onRejected;
      reaction.domain = isNode ? process.domain : undefined;
      this._c.push(reaction);
      if (this._a) this._a.push(reaction);
      if (this._s) notify(this, false);
      return reaction.promise;
    },
    // 25.4.5.1 Promise.prototype.catch(onRejected)
    'catch': function (onRejected) {
      return this.then(undefined, onRejected);
    }
  });
  OwnPromiseCapability = function () {
    var promise = new Internal();
    this.promise = promise;
    this.resolve = ctx($resolve, promise, 1);
    this.reject = ctx($reject, promise, 1);
  };
  newPromiseCapabilityModule.f = newPromiseCapability = function (C) {
    return C === $Promise || C === Wrapper
      ? new OwnPromiseCapability(C)
      : newGenericPromiseCapability(C);
  };
}

$export($export.G + $export.W + $export.F * !USE_NATIVE, { Promise: $Promise });
require('./_set-to-string-tag')($Promise, PROMISE);
require('./_set-species')(PROMISE);
Wrapper = require('./_core')[PROMISE];

// statics
$export($export.S + $export.F * !USE_NATIVE, PROMISE, {
  // 25.4.4.5 Promise.reject(r)
  reject: function reject(r) {
    var capability = newPromiseCapability(this);
    var $$reject = capability.reject;
    $$reject(r);
    return capability.promise;
  }
});
$export($export.S + $export.F * (LIBRARY || !USE_NATIVE), PROMISE, {
  // 25.4.4.6 Promise.resolve(x)
  resolve: function resolve(x) {
    return promiseResolve(LIBRARY && this === Wrapper ? $Promise : this, x);
  }
});
$export($export.S + $export.F * !(USE_NATIVE && require('./_iter-detect')(function (iter) {
  $Promise.all(iter)['catch'](empty);
})), PROMISE, {
  // 25.4.4.1 Promise.all(iterable)
  all: function all(iterable) {
    var C = this;
    var capability = newPromiseCapability(C);
    var resolve = capability.resolve;
    var reject = capability.reject;
    var result = perform(function () {
      var values = [];
      var index = 0;
      var remaining = 1;
      forOf(iterable, false, function (promise) {
        var $index = index++;
        var alreadyCalled = false;
        values.push(undefined);
        remaining++;
        C.resolve(promise).then(function (value) {
          if (alreadyCalled) return;
          alreadyCalled = true;
          values[$index] = value;
          --remaining || resolve(values);
        }, reject);
      });
      --remaining || resolve(values);
    });
    if (result.e) reject(result.v);
    return capability.promise;
  },
  // 25.4.4.4 Promise.race(iterable)
  race: function race(iterable) {
    var C = this;
    var capability = newPromiseCapability(C);
    var reject = capability.reject;
    var result = perform(function () {
      forOf(iterable, false, function (promise) {
        C.resolve(promise).then(capability.resolve, reject);
      });
    });
    if (result.e) reject(result.v);
    return capability.promise;
  }
});

},{"./_a-function":25,"./_an-instance":29,"./_classof":40,"./_core":46,"./_ctx":48,"./_export":56,"./_for-of":62,"./_global":64,"./_is-object":75,"./_iter-detect":80,"./_library":83,"./_microtask":91,"./_new-promise-capability":92,"./_perform":111,"./_promise-resolve":112,"./_redefine-all":114,"./_set-species":123,"./_set-to-string-tag":124,"./_species-constructor":127,"./_task":136,"./_user-agent":148,"./_wks":152}],234:[function(require,module,exports){
// 26.1.1 Reflect.apply(target, thisArgument, argumentsList)
var $export = require('./_export');
var aFunction = require('./_a-function');
var anObject = require('./_an-object');
var rApply = (require('./_global').Reflect || {}).apply;
var fApply = Function.apply;
// MS Edge argumentsList argument is optional
$export($export.S + $export.F * !require('./_fails')(function () {
  rApply(function () { /* empty */ });
}), 'Reflect', {
  apply: function apply(target, thisArgument, argumentsList) {
    var T = aFunction(target);
    var L = anObject(argumentsList);
    return rApply ? rApply(T, thisArgument, L) : fApply.call(T, thisArgument, L);
  }
});

},{"./_a-function":25,"./_an-object":30,"./_export":56,"./_fails":58,"./_global":64}],235:[function(require,module,exports){
// 26.1.2 Reflect.construct(target, argumentsList [, newTarget])
var $export = require('./_export');
var create = require('./_object-create');
var aFunction = require('./_a-function');
var anObject = require('./_an-object');
var isObject = require('./_is-object');
var fails = require('./_fails');
var bind = require('./_bind');
var rConstruct = (require('./_global').Reflect || {}).construct;

// MS Edge supports only 2 arguments and argumentsList argument is optional
// FF Nightly sets third argument as `new.target`, but does not create `this` from it
var NEW_TARGET_BUG = fails(function () {
  function F() { /* empty */ }
  return !(rConstruct(function () { /* empty */ }, [], F) instanceof F);
});
var ARGS_BUG = !fails(function () {
  rConstruct(function () { /* empty */ });
});

$export($export.S + $export.F * (NEW_TARGET_BUG || ARGS_BUG), 'Reflect', {
  construct: function construct(Target, args /* , newTarget */) {
    aFunction(Target);
    anObject(args);
    var newTarget = arguments.length < 3 ? Target : aFunction(arguments[2]);
    if (ARGS_BUG && !NEW_TARGET_BUG) return rConstruct(Target, args, newTarget);
    if (Target == newTarget) {
      // w/o altered newTarget, optimization for 0-4 arguments
      switch (args.length) {
        case 0: return new Target();
        case 1: return new Target(args[0]);
        case 2: return new Target(args[0], args[1]);
        case 3: return new Target(args[0], args[1], args[2]);
        case 4: return new Target(args[0], args[1], args[2], args[3]);
      }
      // w/o altered newTarget, lot of arguments case
      var $args = [null];
      $args.push.apply($args, args);
      return new (bind.apply(Target, $args))();
    }
    // with altered newTarget, not support built-in constructors
    var proto = newTarget.prototype;
    var instance = create(isObject(proto) ? proto : Object.prototype);
    var result = Function.apply.call(Target, instance, args);
    return isObject(result) ? result : instance;
  }
});

},{"./_a-function":25,"./_an-object":30,"./_bind":39,"./_export":56,"./_fails":58,"./_global":64,"./_is-object":75,"./_object-create":94}],236:[function(require,module,exports){
// 26.1.3 Reflect.defineProperty(target, propertyKey, attributes)
var dP = require('./_object-dp');
var $export = require('./_export');
var anObject = require('./_an-object');
var toPrimitive = require('./_to-primitive');

// MS Edge has broken Reflect.defineProperty - throwing instead of returning false
$export($export.S + $export.F * require('./_fails')(function () {
  // eslint-disable-next-line no-undef
  Reflect.defineProperty(dP.f({}, 1, { value: 1 }), 1, { value: 2 });
}), 'Reflect', {
  defineProperty: function defineProperty(target, propertyKey, attributes) {
    anObject(target);
    propertyKey = toPrimitive(propertyKey, true);
    anObject(attributes);
    try {
      dP.f(target, propertyKey, attributes);
      return true;
    } catch (e) {
      return false;
    }
  }
});

},{"./_an-object":30,"./_export":56,"./_fails":58,"./_object-dp":95,"./_to-primitive":143}],237:[function(require,module,exports){
// 26.1.4 Reflect.deleteProperty(target, propertyKey)
var $export = require('./_export');
var gOPD = require('./_object-gopd').f;
var anObject = require('./_an-object');

$export($export.S, 'Reflect', {
  deleteProperty: function deleteProperty(target, propertyKey) {
    var desc = gOPD(anObject(target), propertyKey);
    return desc && !desc.configurable ? false : delete target[propertyKey];
  }
});

},{"./_an-object":30,"./_export":56,"./_object-gopd":98}],238:[function(require,module,exports){
'use strict';
// 26.1.5 Reflect.enumerate(target)
var $export = require('./_export');
var anObject = require('./_an-object');
var Enumerate = function (iterated) {
  this._t = anObject(iterated); // target
  this._i = 0;                  // next index
  var keys = this._k = [];      // keys
  var key;
  for (key in iterated) keys.push(key);
};
require('./_iter-create')(Enumerate, 'Object', function () {
  var that = this;
  var keys = that._k;
  var key;
  do {
    if (that._i >= keys.length) return { value: undefined, done: true };
  } while (!((key = keys[that._i++]) in that._t));
  return { value: key, done: false };
});

$export($export.S, 'Reflect', {
  enumerate: function enumerate(target) {
    return new Enumerate(target);
  }
});

},{"./_an-object":30,"./_export":56,"./_iter-create":78}],239:[function(require,module,exports){
// 26.1.7 Reflect.getOwnPropertyDescriptor(target, propertyKey)
var gOPD = require('./_object-gopd');
var $export = require('./_export');
var anObject = require('./_an-object');

$export($export.S, 'Reflect', {
  getOwnPropertyDescriptor: function getOwnPropertyDescriptor(target, propertyKey) {
    return gOPD.f(anObject(target), propertyKey);
  }
});

},{"./_an-object":30,"./_export":56,"./_object-gopd":98}],240:[function(require,module,exports){
// 26.1.8 Reflect.getPrototypeOf(target)
var $export = require('./_export');
var getProto = require('./_object-gpo');
var anObject = require('./_an-object');

$export($export.S, 'Reflect', {
  getPrototypeOf: function getPrototypeOf(target) {
    return getProto(anObject(target));
  }
});

},{"./_an-object":30,"./_export":56,"./_object-gpo":102}],241:[function(require,module,exports){
// 26.1.6 Reflect.get(target, propertyKey [, receiver])
var gOPD = require('./_object-gopd');
var getPrototypeOf = require('./_object-gpo');
var has = require('./_has');
var $export = require('./_export');
var isObject = require('./_is-object');
var anObject = require('./_an-object');

function get(target, propertyKey /* , receiver */) {
  var receiver = arguments.length < 3 ? target : arguments[2];
  var desc, proto;
  if (anObject(target) === receiver) return target[propertyKey];
  if (desc = gOPD.f(target, propertyKey)) return has(desc, 'value')
    ? desc.value
    : desc.get !== undefined
      ? desc.get.call(receiver)
      : undefined;
  if (isObject(proto = getPrototypeOf(target))) return get(proto, propertyKey, receiver);
}

$export($export.S, 'Reflect', { get: get });

},{"./_an-object":30,"./_export":56,"./_has":65,"./_is-object":75,"./_object-gopd":98,"./_object-gpo":102}],242:[function(require,module,exports){
// 26.1.9 Reflect.has(target, propertyKey)
var $export = require('./_export');

$export($export.S, 'Reflect', {
  has: function has(target, propertyKey) {
    return propertyKey in target;
  }
});

},{"./_export":56}],243:[function(require,module,exports){
// 26.1.10 Reflect.isExtensible(target)
var $export = require('./_export');
var anObject = require('./_an-object');
var $isExtensible = Object.isExtensible;

$export($export.S, 'Reflect', {
  isExtensible: function isExtensible(target) {
    anObject(target);
    return $isExtensible ? $isExtensible(target) : true;
  }
});

},{"./_an-object":30,"./_export":56}],244:[function(require,module,exports){
// 26.1.11 Reflect.ownKeys(target)
var $export = require('./_export');

$export($export.S, 'Reflect', { ownKeys: require('./_own-keys') });

},{"./_export":56,"./_own-keys":108}],245:[function(require,module,exports){
// 26.1.12 Reflect.preventExtensions(target)
var $export = require('./_export');
var anObject = require('./_an-object');
var $preventExtensions = Object.preventExtensions;

$export($export.S, 'Reflect', {
  preventExtensions: function preventExtensions(target) {
    anObject(target);
    try {
      if ($preventExtensions) $preventExtensions(target);
      return true;
    } catch (e) {
      return false;
    }
  }
});

},{"./_an-object":30,"./_export":56}],246:[function(require,module,exports){
// 26.1.14 Reflect.setPrototypeOf(target, proto)
var $export = require('./_export');
var setProto = require('./_set-proto');

if (setProto) $export($export.S, 'Reflect', {
  setPrototypeOf: function setPrototypeOf(target, proto) {
    setProto.check(target, proto);
    try {
      setProto.set(target, proto);
      return true;
    } catch (e) {
      return false;
    }
  }
});

},{"./_export":56,"./_set-proto":122}],247:[function(require,module,exports){
// 26.1.13 Reflect.set(target, propertyKey, V [, receiver])
var dP = require('./_object-dp');
var gOPD = require('./_object-gopd');
var getPrototypeOf = require('./_object-gpo');
var has = require('./_has');
var $export = require('./_export');
var createDesc = require('./_property-desc');
var anObject = require('./_an-object');
var isObject = require('./_is-object');

function set(target, propertyKey, V /* , receiver */) {
  var receiver = arguments.length < 4 ? target : arguments[3];
  var ownDesc = gOPD.f(anObject(target), propertyKey);
  var existingDescriptor, proto;
  if (!ownDesc) {
    if (isObject(proto = getPrototypeOf(target))) {
      return set(proto, propertyKey, V, receiver);
    }
    ownDesc = createDesc(0);
  }
  if (has(ownDesc, 'value')) {
    if (ownDesc.writable === false || !isObject(receiver)) return false;
    if (existingDescriptor = gOPD.f(receiver, propertyKey)) {
      if (existingDescriptor.get || existingDescriptor.set || existingDescriptor.writable === false) return false;
      existingDescriptor.value = V;
      dP.f(receiver, propertyKey, existingDescriptor);
    } else dP.f(receiver, propertyKey, createDesc(0, V));
    return true;
  }
  return ownDesc.set === undefined ? false : (ownDesc.set.call(receiver, V), true);
}

$export($export.S, 'Reflect', { set: set });

},{"./_an-object":30,"./_export":56,"./_has":65,"./_is-object":75,"./_object-dp":95,"./_object-gopd":98,"./_object-gpo":102,"./_property-desc":113}],248:[function(require,module,exports){
var global = require('./_global');
var inheritIfRequired = require('./_inherit-if-required');
var dP = require('./_object-dp').f;
var gOPN = require('./_object-gopn').f;
var isRegExp = require('./_is-regexp');
var $flags = require('./_flags');
var $RegExp = global.RegExp;
var Base = $RegExp;
var proto = $RegExp.prototype;
var re1 = /a/g;
var re2 = /a/g;
// "new" creates a new object, old webkit buggy here
var CORRECT_NEW = new $RegExp(re1) !== re1;

if (require('./_descriptors') && (!CORRECT_NEW || require('./_fails')(function () {
  re2[require('./_wks')('match')] = false;
  // RegExp constructor can alter flags and IsRegExp works correct with @@match
  return $RegExp(re1) != re1 || $RegExp(re2) == re2 || $RegExp(re1, 'i') != '/a/i';
}))) {
  $RegExp = function RegExp(p, f) {
    var tiRE = this instanceof $RegExp;
    var piRE = isRegExp(p);
    var fiU = f === undefined;
    return !tiRE && piRE && p.constructor === $RegExp && fiU ? p
      : inheritIfRequired(CORRECT_NEW
        ? new Base(piRE && !fiU ? p.source : p, f)
        : Base((piRE = p instanceof $RegExp) ? p.source : p, piRE && fiU ? $flags.call(p) : f)
      , tiRE ? this : proto, $RegExp);
  };
  var proxy = function (key) {
    key in $RegExp || dP($RegExp, key, {
      configurable: true,
      get: function () { return Base[key]; },
      set: function (it) { Base[key] = it; }
    });
  };
  for (var keys = gOPN(Base), i = 0; keys.length > i;) proxy(keys[i++]);
  proto.constructor = $RegExp;
  $RegExp.prototype = proto;
  require('./_redefine')(global, 'RegExp', $RegExp);
}

require('./_set-species')('RegExp');

},{"./_descriptors":52,"./_fails":58,"./_flags":60,"./_global":64,"./_inherit-if-required":69,"./_is-regexp":76,"./_object-dp":95,"./_object-gopn":100,"./_redefine":115,"./_set-species":123,"./_wks":152}],249:[function(require,module,exports){
'use strict';
var regexpExec = require('./_regexp-exec');
require('./_export')({
  target: 'RegExp',
  proto: true,
  forced: regexpExec !== /./.exec
}, {
  exec: regexpExec
});

},{"./_export":56,"./_regexp-exec":117}],250:[function(require,module,exports){
// 21.2.5.3 get RegExp.prototype.flags()
if (require('./_descriptors') && /./g.flags != 'g') require('./_object-dp').f(RegExp.prototype, 'flags', {
  configurable: true,
  get: require('./_flags')
});

},{"./_descriptors":52,"./_flags":60,"./_object-dp":95}],251:[function(require,module,exports){
'use strict';

var anObject = require('./_an-object');
var toLength = require('./_to-length');
var advanceStringIndex = require('./_advance-string-index');
var regExpExec = require('./_regexp-exec-abstract');

// @@match logic
require('./_fix-re-wks')('match', 1, function (defined, MATCH, $match, maybeCallNative) {
  return [
    // `String.prototype.match` method
    // https://tc39.github.io/ecma262/#sec-string.prototype.match
    function match(regexp) {
      var O = defined(this);
      var fn = regexp == undefined ? undefined : regexp[MATCH];
      return fn !== undefined ? fn.call(regexp, O) : new RegExp(regexp)[MATCH](String(O));
    },
    // `RegExp.prototype[@@match]` method
    // https://tc39.github.io/ecma262/#sec-regexp.prototype-@@match
    function (regexp) {
      var res = maybeCallNative($match, regexp, this);
      if (res.done) return res.value;
      var rx = anObject(regexp);
      var S = String(this);
      if (!rx.global) return regExpExec(rx, S);
      var fullUnicode = rx.unicode;
      rx.lastIndex = 0;
      var A = [];
      var n = 0;
      var result;
      while ((result = regExpExec(rx, S)) !== null) {
        var matchStr = String(result[0]);
        A[n] = matchStr;
        if (matchStr === '') rx.lastIndex = advanceStringIndex(S, toLength(rx.lastIndex), fullUnicode);
        n++;
      }
      return n === 0 ? null : A;
    }
  ];
});

},{"./_advance-string-index":28,"./_an-object":30,"./_fix-re-wks":59,"./_regexp-exec-abstract":116,"./_to-length":141}],252:[function(require,module,exports){
'use strict';

var anObject = require('./_an-object');
var toObject = require('./_to-object');
var toLength = require('./_to-length');
var toInteger = require('./_to-integer');
var advanceStringIndex = require('./_advance-string-index');
var regExpExec = require('./_regexp-exec-abstract');
var max = Math.max;
var min = Math.min;
var floor = Math.floor;
var SUBSTITUTION_SYMBOLS = /\$([$&`']|\d\d?|<[^>]*>)/g;
var SUBSTITUTION_SYMBOLS_NO_NAMED = /\$([$&`']|\d\d?)/g;

var maybeToString = function (it) {
  return it === undefined ? it : String(it);
};

// @@replace logic
require('./_fix-re-wks')('replace', 2, function (defined, REPLACE, $replace, maybeCallNative) {
  return [
    // `String.prototype.replace` method
    // https://tc39.github.io/ecma262/#sec-string.prototype.replace
    function replace(searchValue, replaceValue) {
      var O = defined(this);
      var fn = searchValue == undefined ? undefined : searchValue[REPLACE];
      return fn !== undefined
        ? fn.call(searchValue, O, replaceValue)
        : $replace.call(String(O), searchValue, replaceValue);
    },
    // `RegExp.prototype[@@replace]` method
    // https://tc39.github.io/ecma262/#sec-regexp.prototype-@@replace
    function (regexp, replaceValue) {
      var res = maybeCallNative($replace, regexp, this, replaceValue);
      if (res.done) return res.value;

      var rx = anObject(regexp);
      var S = String(this);
      var functionalReplace = typeof replaceValue === 'function';
      if (!functionalReplace) replaceValue = String(replaceValue);
      var global = rx.global;
      if (global) {
        var fullUnicode = rx.unicode;
        rx.lastIndex = 0;
      }
      var results = [];
      while (true) {
        var result = regExpExec(rx, S);
        if (result === null) break;
        results.push(result);
        if (!global) break;
        var matchStr = String(result[0]);
        if (matchStr === '') rx.lastIndex = advanceStringIndex(S, toLength(rx.lastIndex), fullUnicode);
      }
      var accumulatedResult = '';
      var nextSourcePosition = 0;
      for (var i = 0; i < results.length; i++) {
        result = results[i];
        var matched = String(result[0]);
        var position = max(min(toInteger(result.index), S.length), 0);
        var captures = [];
        // NOTE: This is equivalent to
        //   captures = result.slice(1).map(maybeToString)
        // but for some reason `nativeSlice.call(result, 1, result.length)` (called in
        // the slice polyfill when slicing native arrays) "doesn't work" in safari 9 and
        // causes a crash (https://pastebin.com/N21QzeQA) when trying to debug it.
        for (var j = 1; j < result.length; j++) captures.push(maybeToString(result[j]));
        var namedCaptures = result.groups;
        if (functionalReplace) {
          var replacerArgs = [matched].concat(captures, position, S);
          if (namedCaptures !== undefined) replacerArgs.push(namedCaptures);
          var replacement = String(replaceValue.apply(undefined, replacerArgs));
        } else {
          replacement = getSubstitution(matched, S, position, captures, namedCaptures, replaceValue);
        }
        if (position >= nextSourcePosition) {
          accumulatedResult += S.slice(nextSourcePosition, position) + replacement;
          nextSourcePosition = position + matched.length;
        }
      }
      return accumulatedResult + S.slice(nextSourcePosition);
    }
  ];

    // https://tc39.github.io/ecma262/#sec-getsubstitution
  function getSubstitution(matched, str, position, captures, namedCaptures, replacement) {
    var tailPos = position + matched.length;
    var m = captures.length;
    var symbols = SUBSTITUTION_SYMBOLS_NO_NAMED;
    if (namedCaptures !== undefined) {
      namedCaptures = toObject(namedCaptures);
      symbols = SUBSTITUTION_SYMBOLS;
    }
    return $replace.call(replacement, symbols, function (match, ch) {
      var capture;
      switch (ch.charAt(0)) {
        case '$': return '$';
        case '&': return matched;
        case '`': return str.slice(0, position);
        case "'": return str.slice(tailPos);
        case '<':
          capture = namedCaptures[ch.slice(1, -1)];
          break;
        default: // \d\d?
          var n = +ch;
          if (n === 0) return match;
          if (n > m) {
            var f = floor(n / 10);
            if (f === 0) return match;
            if (f <= m) return captures[f - 1] === undefined ? ch.charAt(1) : captures[f - 1] + ch.charAt(1);
            return match;
          }
          capture = captures[n - 1];
      }
      return capture === undefined ? '' : capture;
    });
  }
});

},{"./_advance-string-index":28,"./_an-object":30,"./_fix-re-wks":59,"./_regexp-exec-abstract":116,"./_to-integer":139,"./_to-length":141,"./_to-object":142}],253:[function(require,module,exports){
'use strict';

var anObject = require('./_an-object');
var sameValue = require('./_same-value');
var regExpExec = require('./_regexp-exec-abstract');

// @@search logic
require('./_fix-re-wks')('search', 1, function (defined, SEARCH, $search, maybeCallNative) {
  return [
    // `String.prototype.search` method
    // https://tc39.github.io/ecma262/#sec-string.prototype.search
    function search(regexp) {
      var O = defined(this);
      var fn = regexp == undefined ? undefined : regexp[SEARCH];
      return fn !== undefined ? fn.call(regexp, O) : new RegExp(regexp)[SEARCH](String(O));
    },
    // `RegExp.prototype[@@search]` method
    // https://tc39.github.io/ecma262/#sec-regexp.prototype-@@search
    function (regexp) {
      var res = maybeCallNative($search, regexp, this);
      if (res.done) return res.value;
      var rx = anObject(regexp);
      var S = String(this);
      var previousLastIndex = rx.lastIndex;
      if (!sameValue(previousLastIndex, 0)) rx.lastIndex = 0;
      var result = regExpExec(rx, S);
      if (!sameValue(rx.lastIndex, previousLastIndex)) rx.lastIndex = previousLastIndex;
      return result === null ? -1 : result.index;
    }
  ];
});

},{"./_an-object":30,"./_fix-re-wks":59,"./_regexp-exec-abstract":116,"./_same-value":119}],254:[function(require,module,exports){
'use strict';

var isRegExp = require('./_is-regexp');
var anObject = require('./_an-object');
var speciesConstructor = require('./_species-constructor');
var advanceStringIndex = require('./_advance-string-index');
var toLength = require('./_to-length');
var callRegExpExec = require('./_regexp-exec-abstract');
var regexpExec = require('./_regexp-exec');
var fails = require('./_fails');
var $min = Math.min;
var $push = [].push;
var $SPLIT = 'split';
var LENGTH = 'length';
var LAST_INDEX = 'lastIndex';
var MAX_UINT32 = 0xffffffff;

// babel-minify transpiles RegExp('x', 'y') -> /x/y and it causes SyntaxError
var SUPPORTS_Y = !fails(function () { RegExp(MAX_UINT32, 'y'); });

// @@split logic
require('./_fix-re-wks')('split', 2, function (defined, SPLIT, $split, maybeCallNative) {
  var internalSplit;
  if (
    'abbc'[$SPLIT](/(b)*/)[1] == 'c' ||
    'test'[$SPLIT](/(?:)/, -1)[LENGTH] != 4 ||
    'ab'[$SPLIT](/(?:ab)*/)[LENGTH] != 2 ||
    '.'[$SPLIT](/(.?)(.?)/)[LENGTH] != 4 ||
    '.'[$SPLIT](/()()/)[LENGTH] > 1 ||
    ''[$SPLIT](/.?/)[LENGTH]
  ) {
    // based on es5-shim implementation, need to rework it
    internalSplit = function (separator, limit) {
      var string = String(this);
      if (separator === undefined && limit === 0) return [];
      // If `separator` is not a regex, use native split
      if (!isRegExp(separator)) return $split.call(string, separator, limit);
      var output = [];
      var flags = (separator.ignoreCase ? 'i' : '') +
                  (separator.multiline ? 'm' : '') +
                  (separator.unicode ? 'u' : '') +
                  (separator.sticky ? 'y' : '');
      var lastLastIndex = 0;
      var splitLimit = limit === undefined ? MAX_UINT32 : limit >>> 0;
      // Make `global` and avoid `lastIndex` issues by working with a copy
      var separatorCopy = new RegExp(separator.source, flags + 'g');
      var match, lastIndex, lastLength;
      while (match = regexpExec.call(separatorCopy, string)) {
        lastIndex = separatorCopy[LAST_INDEX];
        if (lastIndex > lastLastIndex) {
          output.push(string.slice(lastLastIndex, match.index));
          if (match[LENGTH] > 1 && match.index < string[LENGTH]) $push.apply(output, match.slice(1));
          lastLength = match[0][LENGTH];
          lastLastIndex = lastIndex;
          if (output[LENGTH] >= splitLimit) break;
        }
        if (separatorCopy[LAST_INDEX] === match.index) separatorCopy[LAST_INDEX]++; // Avoid an infinite loop
      }
      if (lastLastIndex === string[LENGTH]) {
        if (lastLength || !separatorCopy.test('')) output.push('');
      } else output.push(string.slice(lastLastIndex));
      return output[LENGTH] > splitLimit ? output.slice(0, splitLimit) : output;
    };
  // Chakra, V8
  } else if ('0'[$SPLIT](undefined, 0)[LENGTH]) {
    internalSplit = function (separator, limit) {
      return separator === undefined && limit === 0 ? [] : $split.call(this, separator, limit);
    };
  } else {
    internalSplit = $split;
  }

  return [
    // `String.prototype.split` method
    // https://tc39.github.io/ecma262/#sec-string.prototype.split
    function split(separator, limit) {
      var O = defined(this);
      var splitter = separator == undefined ? undefined : separator[SPLIT];
      return splitter !== undefined
        ? splitter.call(separator, O, limit)
        : internalSplit.call(String(O), separator, limit);
    },
    // `RegExp.prototype[@@split]` method
    // https://tc39.github.io/ecma262/#sec-regexp.prototype-@@split
    //
    // NOTE: This cannot be properly polyfilled in engines that don't support
    // the 'y' flag.
    function (regexp, limit) {
      var res = maybeCallNative(internalSplit, regexp, this, limit, internalSplit !== $split);
      if (res.done) return res.value;

      var rx = anObject(regexp);
      var S = String(this);
      var C = speciesConstructor(rx, RegExp);

      var unicodeMatching = rx.unicode;
      var flags = (rx.ignoreCase ? 'i' : '') +
                  (rx.multiline ? 'm' : '') +
                  (rx.unicode ? 'u' : '') +
                  (SUPPORTS_Y ? 'y' : 'g');

      // ^(? + rx + ) is needed, in combination with some S slicing, to
      // simulate the 'y' flag.
      var splitter = new C(SUPPORTS_Y ? rx : '^(?:' + rx.source + ')', flags);
      var lim = limit === undefined ? MAX_UINT32 : limit >>> 0;
      if (lim === 0) return [];
      if (S.length === 0) return callRegExpExec(splitter, S) === null ? [S] : [];
      var p = 0;
      var q = 0;
      var A = [];
      while (q < S.length) {
        splitter.lastIndex = SUPPORTS_Y ? q : 0;
        var z = callRegExpExec(splitter, SUPPORTS_Y ? S : S.slice(q));
        var e;
        if (
          z === null ||
          (e = $min(toLength(splitter.lastIndex + (SUPPORTS_Y ? 0 : q)), S.length)) === p
        ) {
          q = advanceStringIndex(S, q, unicodeMatching);
        } else {
          A.push(S.slice(p, q));
          if (A.length === lim) return A;
          for (var i = 1; i <= z.length - 1; i++) {
            A.push(z[i]);
            if (A.length === lim) return A;
          }
          q = p = e;
        }
      }
      A.push(S.slice(p));
      return A;
    }
  ];
});

},{"./_advance-string-index":28,"./_an-object":30,"./_fails":58,"./_fix-re-wks":59,"./_is-regexp":76,"./_regexp-exec":117,"./_regexp-exec-abstract":116,"./_species-constructor":127,"./_to-length":141}],255:[function(require,module,exports){
'use strict';
require('./es6.regexp.flags');
var anObject = require('./_an-object');
var $flags = require('./_flags');
var DESCRIPTORS = require('./_descriptors');
var TO_STRING = 'toString';
var $toString = /./[TO_STRING];

var define = function (fn) {
  require('./_redefine')(RegExp.prototype, TO_STRING, fn, true);
};

// 21.2.5.14 RegExp.prototype.toString()
if (require('./_fails')(function () { return $toString.call({ source: 'a', flags: 'b' }) != '/a/b'; })) {
  define(function toString() {
    var R = anObject(this);
    return '/'.concat(R.source, '/',
      'flags' in R ? R.flags : !DESCRIPTORS && R instanceof RegExp ? $flags.call(R) : undefined);
  });
// FF44- RegExp#toString has a wrong name
} else if ($toString.name != TO_STRING) {
  define(function toString() {
    return $toString.call(this);
  });
}

},{"./_an-object":30,"./_descriptors":52,"./_fails":58,"./_flags":60,"./_redefine":115,"./es6.regexp.flags":250}],256:[function(require,module,exports){
'use strict';
var strong = require('./_collection-strong');
var validate = require('./_validate-collection');
var SET = 'Set';

// 23.2 Set Objects
module.exports = require('./_collection')(SET, function (get) {
  return function Set() { return get(this, arguments.length > 0 ? arguments[0] : undefined); };
}, {
  // 23.2.3.1 Set.prototype.add(value)
  add: function add(value) {
    return strong.def(validate(this, SET), value = value === 0 ? 0 : value, value);
  }
}, strong);

},{"./_collection":45,"./_collection-strong":42,"./_validate-collection":149}],257:[function(require,module,exports){
'use strict';
// B.2.3.2 String.prototype.anchor(name)
require('./_string-html')('anchor', function (createHTML) {
  return function anchor(name) {
    return createHTML(this, 'a', 'name', name);
  };
});

},{"./_string-html":131}],258:[function(require,module,exports){
'use strict';
// B.2.3.3 String.prototype.big()
require('./_string-html')('big', function (createHTML) {
  return function big() {
    return createHTML(this, 'big', '', '');
  };
});

},{"./_string-html":131}],259:[function(require,module,exports){
'use strict';
// B.2.3.4 String.prototype.blink()
require('./_string-html')('blink', function (createHTML) {
  return function blink() {
    return createHTML(this, 'blink', '', '');
  };
});

},{"./_string-html":131}],260:[function(require,module,exports){
'use strict';
// B.2.3.5 String.prototype.bold()
require('./_string-html')('bold', function (createHTML) {
  return function bold() {
    return createHTML(this, 'b', '', '');
  };
});

},{"./_string-html":131}],261:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $at = require('./_string-at')(false);
$export($export.P, 'String', {
  // 21.1.3.3 String.prototype.codePointAt(pos)
  codePointAt: function codePointAt(pos) {
    return $at(this, pos);
  }
});

},{"./_export":56,"./_string-at":129}],262:[function(require,module,exports){
// 21.1.3.6 String.prototype.endsWith(searchString [, endPosition])
'use strict';
var $export = require('./_export');
var toLength = require('./_to-length');
var context = require('./_string-context');
var ENDS_WITH = 'endsWith';
var $endsWith = ''[ENDS_WITH];

$export($export.P + $export.F * require('./_fails-is-regexp')(ENDS_WITH), 'String', {
  endsWith: function endsWith(searchString /* , endPosition = @length */) {
    var that = context(this, searchString, ENDS_WITH);
    var endPosition = arguments.length > 1 ? arguments[1] : undefined;
    var len = toLength(that.length);
    var end = endPosition === undefined ? len : Math.min(toLength(endPosition), len);
    var search = String(searchString);
    return $endsWith
      ? $endsWith.call(that, search, end)
      : that.slice(end - search.length, end) === search;
  }
});

},{"./_export":56,"./_fails-is-regexp":57,"./_string-context":130,"./_to-length":141}],263:[function(require,module,exports){
'use strict';
// B.2.3.6 String.prototype.fixed()
require('./_string-html')('fixed', function (createHTML) {
  return function fixed() {
    return createHTML(this, 'tt', '', '');
  };
});

},{"./_string-html":131}],264:[function(require,module,exports){
'use strict';
// B.2.3.7 String.prototype.fontcolor(color)
require('./_string-html')('fontcolor', function (createHTML) {
  return function fontcolor(color) {
    return createHTML(this, 'font', 'color', color);
  };
});

},{"./_string-html":131}],265:[function(require,module,exports){
'use strict';
// B.2.3.8 String.prototype.fontsize(size)
require('./_string-html')('fontsize', function (createHTML) {
  return function fontsize(size) {
    return createHTML(this, 'font', 'size', size);
  };
});

},{"./_string-html":131}],266:[function(require,module,exports){
var $export = require('./_export');
var toAbsoluteIndex = require('./_to-absolute-index');
var fromCharCode = String.fromCharCode;
var $fromCodePoint = String.fromCodePoint;

// length should be 1, old FF problem
$export($export.S + $export.F * (!!$fromCodePoint && $fromCodePoint.length != 1), 'String', {
  // 21.1.2.2 String.fromCodePoint(...codePoints)
  fromCodePoint: function fromCodePoint(x) { // eslint-disable-line no-unused-vars
    var res = [];
    var aLen = arguments.length;
    var i = 0;
    var code;
    while (aLen > i) {
      code = +arguments[i++];
      if (toAbsoluteIndex(code, 0x10ffff) !== code) throw RangeError(code + ' is not a valid code point');
      res.push(code < 0x10000
        ? fromCharCode(code)
        : fromCharCode(((code -= 0x10000) >> 10) + 0xd800, code % 0x400 + 0xdc00)
      );
    } return res.join('');
  }
});

},{"./_export":56,"./_to-absolute-index":137}],267:[function(require,module,exports){
// 21.1.3.7 String.prototype.includes(searchString, position = 0)
'use strict';
var $export = require('./_export');
var context = require('./_string-context');
var INCLUDES = 'includes';

$export($export.P + $export.F * require('./_fails-is-regexp')(INCLUDES), 'String', {
  includes: function includes(searchString /* , position = 0 */) {
    return !!~context(this, searchString, INCLUDES)
      .indexOf(searchString, arguments.length > 1 ? arguments[1] : undefined);
  }
});

},{"./_export":56,"./_fails-is-regexp":57,"./_string-context":130}],268:[function(require,module,exports){
'use strict';
// B.2.3.9 String.prototype.italics()
require('./_string-html')('italics', function (createHTML) {
  return function italics() {
    return createHTML(this, 'i', '', '');
  };
});

},{"./_string-html":131}],269:[function(require,module,exports){
'use strict';
var $at = require('./_string-at')(true);

// 21.1.3.27 String.prototype[@@iterator]()
require('./_iter-define')(String, 'String', function (iterated) {
  this._t = String(iterated); // target
  this._i = 0;                // next index
// 21.1.5.2.1 %StringIteratorPrototype%.next()
}, function () {
  var O = this._t;
  var index = this._i;
  var point;
  if (index >= O.length) return { value: undefined, done: true };
  point = $at(O, index);
  this._i += point.length;
  return { value: point, done: false };
});

},{"./_iter-define":79,"./_string-at":129}],270:[function(require,module,exports){
'use strict';
// B.2.3.10 String.prototype.link(url)
require('./_string-html')('link', function (createHTML) {
  return function link(url) {
    return createHTML(this, 'a', 'href', url);
  };
});

},{"./_string-html":131}],271:[function(require,module,exports){
var $export = require('./_export');
var toIObject = require('./_to-iobject');
var toLength = require('./_to-length');

$export($export.S, 'String', {
  // 21.1.2.4 String.raw(callSite, ...substitutions)
  raw: function raw(callSite) {
    var tpl = toIObject(callSite.raw);
    var len = toLength(tpl.length);
    var aLen = arguments.length;
    var res = [];
    var i = 0;
    while (len > i) {
      res.push(String(tpl[i++]));
      if (i < aLen) res.push(String(arguments[i]));
    } return res.join('');
  }
});

},{"./_export":56,"./_to-iobject":140,"./_to-length":141}],272:[function(require,module,exports){
var $export = require('./_export');

$export($export.P, 'String', {
  // 21.1.3.13 String.prototype.repeat(count)
  repeat: require('./_string-repeat')
});

},{"./_export":56,"./_string-repeat":133}],273:[function(require,module,exports){
'use strict';
// B.2.3.11 String.prototype.small()
require('./_string-html')('small', function (createHTML) {
  return function small() {
    return createHTML(this, 'small', '', '');
  };
});

},{"./_string-html":131}],274:[function(require,module,exports){
// 21.1.3.18 String.prototype.startsWith(searchString [, position ])
'use strict';
var $export = require('./_export');
var toLength = require('./_to-length');
var context = require('./_string-context');
var STARTS_WITH = 'startsWith';
var $startsWith = ''[STARTS_WITH];

$export($export.P + $export.F * require('./_fails-is-regexp')(STARTS_WITH), 'String', {
  startsWith: function startsWith(searchString /* , position = 0 */) {
    var that = context(this, searchString, STARTS_WITH);
    var index = toLength(Math.min(arguments.length > 1 ? arguments[1] : undefined, that.length));
    var search = String(searchString);
    return $startsWith
      ? $startsWith.call(that, search, index)
      : that.slice(index, index + search.length) === search;
  }
});

},{"./_export":56,"./_fails-is-regexp":57,"./_string-context":130,"./_to-length":141}],275:[function(require,module,exports){
'use strict';
// B.2.3.12 String.prototype.strike()
require('./_string-html')('strike', function (createHTML) {
  return function strike() {
    return createHTML(this, 'strike', '', '');
  };
});

},{"./_string-html":131}],276:[function(require,module,exports){
'use strict';
// B.2.3.13 String.prototype.sub()
require('./_string-html')('sub', function (createHTML) {
  return function sub() {
    return createHTML(this, 'sub', '', '');
  };
});

},{"./_string-html":131}],277:[function(require,module,exports){
'use strict';
// B.2.3.14 String.prototype.sup()
require('./_string-html')('sup', function (createHTML) {
  return function sup() {
    return createHTML(this, 'sup', '', '');
  };
});

},{"./_string-html":131}],278:[function(require,module,exports){
'use strict';
// 21.1.3.25 String.prototype.trim()
require('./_string-trim')('trim', function ($trim) {
  return function trim() {
    return $trim(this, 3);
  };
});

},{"./_string-trim":134}],279:[function(require,module,exports){
'use strict';
// ECMAScript 6 symbols shim
var global = require('./_global');
var has = require('./_has');
var DESCRIPTORS = require('./_descriptors');
var $export = require('./_export');
var redefine = require('./_redefine');
var META = require('./_meta').KEY;
var $fails = require('./_fails');
var shared = require('./_shared');
var setToStringTag = require('./_set-to-string-tag');
var uid = require('./_uid');
var wks = require('./_wks');
var wksExt = require('./_wks-ext');
var wksDefine = require('./_wks-define');
var enumKeys = require('./_enum-keys');
var isArray = require('./_is-array');
var anObject = require('./_an-object');
var isObject = require('./_is-object');
var toIObject = require('./_to-iobject');
var toPrimitive = require('./_to-primitive');
var createDesc = require('./_property-desc');
var _create = require('./_object-create');
var gOPNExt = require('./_object-gopn-ext');
var $GOPD = require('./_object-gopd');
var $DP = require('./_object-dp');
var $keys = require('./_object-keys');
var gOPD = $GOPD.f;
var dP = $DP.f;
var gOPN = gOPNExt.f;
var $Symbol = global.Symbol;
var $JSON = global.JSON;
var _stringify = $JSON && $JSON.stringify;
var PROTOTYPE = 'prototype';
var HIDDEN = wks('_hidden');
var TO_PRIMITIVE = wks('toPrimitive');
var isEnum = {}.propertyIsEnumerable;
var SymbolRegistry = shared('symbol-registry');
var AllSymbols = shared('symbols');
var OPSymbols = shared('op-symbols');
var ObjectProto = Object[PROTOTYPE];
var USE_NATIVE = typeof $Symbol == 'function';
var QObject = global.QObject;
// Don't use setters in Qt Script, https://github.com/zloirock/core-js/issues/173
var setter = !QObject || !QObject[PROTOTYPE] || !QObject[PROTOTYPE].findChild;

// fallback for old Android, https://code.google.com/p/v8/issues/detail?id=687
var setSymbolDesc = DESCRIPTORS && $fails(function () {
  return _create(dP({}, 'a', {
    get: function () { return dP(this, 'a', { value: 7 }).a; }
  })).a != 7;
}) ? function (it, key, D) {
  var protoDesc = gOPD(ObjectProto, key);
  if (protoDesc) delete ObjectProto[key];
  dP(it, key, D);
  if (protoDesc && it !== ObjectProto) dP(ObjectProto, key, protoDesc);
} : dP;

var wrap = function (tag) {
  var sym = AllSymbols[tag] = _create($Symbol[PROTOTYPE]);
  sym._k = tag;
  return sym;
};

var isSymbol = USE_NATIVE && typeof $Symbol.iterator == 'symbol' ? function (it) {
  return typeof it == 'symbol';
} : function (it) {
  return it instanceof $Symbol;
};

var $defineProperty = function defineProperty(it, key, D) {
  if (it === ObjectProto) $defineProperty(OPSymbols, key, D);
  anObject(it);
  key = toPrimitive(key, true);
  anObject(D);
  if (has(AllSymbols, key)) {
    if (!D.enumerable) {
      if (!has(it, HIDDEN)) dP(it, HIDDEN, createDesc(1, {}));
      it[HIDDEN][key] = true;
    } else {
      if (has(it, HIDDEN) && it[HIDDEN][key]) it[HIDDEN][key] = false;
      D = _create(D, { enumerable: createDesc(0, false) });
    } return setSymbolDesc(it, key, D);
  } return dP(it, key, D);
};
var $defineProperties = function defineProperties(it, P) {
  anObject(it);
  var keys = enumKeys(P = toIObject(P));
  var i = 0;
  var l = keys.length;
  var key;
  while (l > i) $defineProperty(it, key = keys[i++], P[key]);
  return it;
};
var $create = function create(it, P) {
  return P === undefined ? _create(it) : $defineProperties(_create(it), P);
};
var $propertyIsEnumerable = function propertyIsEnumerable(key) {
  var E = isEnum.call(this, key = toPrimitive(key, true));
  if (this === ObjectProto && has(AllSymbols, key) && !has(OPSymbols, key)) return false;
  return E || !has(this, key) || !has(AllSymbols, key) || has(this, HIDDEN) && this[HIDDEN][key] ? E : true;
};
var $getOwnPropertyDescriptor = function getOwnPropertyDescriptor(it, key) {
  it = toIObject(it);
  key = toPrimitive(key, true);
  if (it === ObjectProto && has(AllSymbols, key) && !has(OPSymbols, key)) return;
  var D = gOPD(it, key);
  if (D && has(AllSymbols, key) && !(has(it, HIDDEN) && it[HIDDEN][key])) D.enumerable = true;
  return D;
};
var $getOwnPropertyNames = function getOwnPropertyNames(it) {
  var names = gOPN(toIObject(it));
  var result = [];
  var i = 0;
  var key;
  while (names.length > i) {
    if (!has(AllSymbols, key = names[i++]) && key != HIDDEN && key != META) result.push(key);
  } return result;
};
var $getOwnPropertySymbols = function getOwnPropertySymbols(it) {
  var IS_OP = it === ObjectProto;
  var names = gOPN(IS_OP ? OPSymbols : toIObject(it));
  var result = [];
  var i = 0;
  var key;
  while (names.length > i) {
    if (has(AllSymbols, key = names[i++]) && (IS_OP ? has(ObjectProto, key) : true)) result.push(AllSymbols[key]);
  } return result;
};

// 19.4.1.1 Symbol([description])
if (!USE_NATIVE) {
  $Symbol = function Symbol() {
    if (this instanceof $Symbol) throw TypeError('Symbol is not a constructor!');
    var tag = uid(arguments.length > 0 ? arguments[0] : undefined);
    var $set = function (value) {
      if (this === ObjectProto) $set.call(OPSymbols, value);
      if (has(this, HIDDEN) && has(this[HIDDEN], tag)) this[HIDDEN][tag] = false;
      setSymbolDesc(this, tag, createDesc(1, value));
    };
    if (DESCRIPTORS && setter) setSymbolDesc(ObjectProto, tag, { configurable: true, set: $set });
    return wrap(tag);
  };
  redefine($Symbol[PROTOTYPE], 'toString', function toString() {
    return this._k;
  });

  $GOPD.f = $getOwnPropertyDescriptor;
  $DP.f = $defineProperty;
  require('./_object-gopn').f = gOPNExt.f = $getOwnPropertyNames;
  require('./_object-pie').f = $propertyIsEnumerable;
  require('./_object-gops').f = $getOwnPropertySymbols;

  if (DESCRIPTORS && !require('./_library')) {
    redefine(ObjectProto, 'propertyIsEnumerable', $propertyIsEnumerable, true);
  }

  wksExt.f = function (name) {
    return wrap(wks(name));
  };
}

$export($export.G + $export.W + $export.F * !USE_NATIVE, { Symbol: $Symbol });

for (var es6Symbols = (
  // 19.4.2.2, 19.4.2.3, 19.4.2.4, 19.4.2.6, 19.4.2.8, 19.4.2.9, 19.4.2.10, 19.4.2.11, 19.4.2.12, 19.4.2.13, 19.4.2.14
  'hasInstance,isConcatSpreadable,iterator,match,replace,search,species,split,toPrimitive,toStringTag,unscopables'
).split(','), j = 0; es6Symbols.length > j;)wks(es6Symbols[j++]);

for (var wellKnownSymbols = $keys(wks.store), k = 0; wellKnownSymbols.length > k;) wksDefine(wellKnownSymbols[k++]);

$export($export.S + $export.F * !USE_NATIVE, 'Symbol', {
  // 19.4.2.1 Symbol.for(key)
  'for': function (key) {
    return has(SymbolRegistry, key += '')
      ? SymbolRegistry[key]
      : SymbolRegistry[key] = $Symbol(key);
  },
  // 19.4.2.5 Symbol.keyFor(sym)
  keyFor: function keyFor(sym) {
    if (!isSymbol(sym)) throw TypeError(sym + ' is not a symbol!');
    for (var key in SymbolRegistry) if (SymbolRegistry[key] === sym) return key;
  },
  useSetter: function () { setter = true; },
  useSimple: function () { setter = false; }
});

$export($export.S + $export.F * !USE_NATIVE, 'Object', {
  // 19.1.2.2 Object.create(O [, Properties])
  create: $create,
  // 19.1.2.4 Object.defineProperty(O, P, Attributes)
  defineProperty: $defineProperty,
  // 19.1.2.3 Object.defineProperties(O, Properties)
  defineProperties: $defineProperties,
  // 19.1.2.6 Object.getOwnPropertyDescriptor(O, P)
  getOwnPropertyDescriptor: $getOwnPropertyDescriptor,
  // 19.1.2.7 Object.getOwnPropertyNames(O)
  getOwnPropertyNames: $getOwnPropertyNames,
  // 19.1.2.8 Object.getOwnPropertySymbols(O)
  getOwnPropertySymbols: $getOwnPropertySymbols
});

// 24.3.2 JSON.stringify(value [, replacer [, space]])
$JSON && $export($export.S + $export.F * (!USE_NATIVE || $fails(function () {
  var S = $Symbol();
  // MS Edge converts symbol values to JSON as {}
  // WebKit converts symbol values to JSON as null
  // V8 throws on boxed symbols
  return _stringify([S]) != '[null]' || _stringify({ a: S }) != '{}' || _stringify(Object(S)) != '{}';
})), 'JSON', {
  stringify: function stringify(it) {
    var args = [it];
    var i = 1;
    var replacer, $replacer;
    while (arguments.length > i) args.push(arguments[i++]);
    $replacer = replacer = args[1];
    if (!isObject(replacer) && it === undefined || isSymbol(it)) return; // IE8 returns string on undefined
    if (!isArray(replacer)) replacer = function (key, value) {
      if (typeof $replacer == 'function') value = $replacer.call(this, key, value);
      if (!isSymbol(value)) return value;
    };
    args[1] = replacer;
    return _stringify.apply($JSON, args);
  }
});

// 19.4.3.4 Symbol.prototype[@@toPrimitive](hint)
$Symbol[PROTOTYPE][TO_PRIMITIVE] || require('./_hide')($Symbol[PROTOTYPE], TO_PRIMITIVE, $Symbol[PROTOTYPE].valueOf);
// 19.4.3.5 Symbol.prototype[@@toStringTag]
setToStringTag($Symbol, 'Symbol');
// 20.2.1.9 Math[@@toStringTag]
setToStringTag(Math, 'Math', true);
// 24.3.3 JSON[@@toStringTag]
setToStringTag(global.JSON, 'JSON', true);

},{"./_an-object":30,"./_descriptors":52,"./_enum-keys":55,"./_export":56,"./_fails":58,"./_global":64,"./_has":65,"./_hide":66,"./_is-array":73,"./_is-object":75,"./_library":83,"./_meta":89,"./_object-create":94,"./_object-dp":95,"./_object-gopd":98,"./_object-gopn":100,"./_object-gopn-ext":99,"./_object-gops":101,"./_object-keys":104,"./_object-pie":105,"./_property-desc":113,"./_redefine":115,"./_set-to-string-tag":124,"./_shared":126,"./_to-iobject":140,"./_to-primitive":143,"./_uid":147,"./_wks":152,"./_wks-define":150,"./_wks-ext":151}],280:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var $typed = require('./_typed');
var buffer = require('./_typed-buffer');
var anObject = require('./_an-object');
var toAbsoluteIndex = require('./_to-absolute-index');
var toLength = require('./_to-length');
var isObject = require('./_is-object');
var ArrayBuffer = require('./_global').ArrayBuffer;
var speciesConstructor = require('./_species-constructor');
var $ArrayBuffer = buffer.ArrayBuffer;
var $DataView = buffer.DataView;
var $isView = $typed.ABV && ArrayBuffer.isView;
var $slice = $ArrayBuffer.prototype.slice;
var VIEW = $typed.VIEW;
var ARRAY_BUFFER = 'ArrayBuffer';

$export($export.G + $export.W + $export.F * (ArrayBuffer !== $ArrayBuffer), { ArrayBuffer: $ArrayBuffer });

$export($export.S + $export.F * !$typed.CONSTR, ARRAY_BUFFER, {
  // 24.1.3.1 ArrayBuffer.isView(arg)
  isView: function isView(it) {
    return $isView && $isView(it) || isObject(it) && VIEW in it;
  }
});

$export($export.P + $export.U + $export.F * require('./_fails')(function () {
  return !new $ArrayBuffer(2).slice(1, undefined).byteLength;
}), ARRAY_BUFFER, {
  // 24.1.4.3 ArrayBuffer.prototype.slice(start, end)
  slice: function slice(start, end) {
    if ($slice !== undefined && end === undefined) return $slice.call(anObject(this), start); // FF fix
    var len = anObject(this).byteLength;
    var first = toAbsoluteIndex(start, len);
    var fin = toAbsoluteIndex(end === undefined ? len : end, len);
    var result = new (speciesConstructor(this, $ArrayBuffer))(toLength(fin - first));
    var viewS = new $DataView(this);
    var viewT = new $DataView(result);
    var index = 0;
    while (first < fin) {
      viewT.setUint8(index++, viewS.getUint8(first++));
    } return result;
  }
});

require('./_set-species')(ARRAY_BUFFER);

},{"./_an-object":30,"./_export":56,"./_fails":58,"./_global":64,"./_is-object":75,"./_set-species":123,"./_species-constructor":127,"./_to-absolute-index":137,"./_to-length":141,"./_typed":146,"./_typed-buffer":145}],281:[function(require,module,exports){
var $export = require('./_export');
$export($export.G + $export.W + $export.F * !require('./_typed').ABV, {
  DataView: require('./_typed-buffer').DataView
});

},{"./_export":56,"./_typed":146,"./_typed-buffer":145}],282:[function(require,module,exports){
require('./_typed-array')('Float32', 4, function (init) {
  return function Float32Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":144}],283:[function(require,module,exports){
require('./_typed-array')('Float64', 8, function (init) {
  return function Float64Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":144}],284:[function(require,module,exports){
require('./_typed-array')('Int16', 2, function (init) {
  return function Int16Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":144}],285:[function(require,module,exports){
require('./_typed-array')('Int32', 4, function (init) {
  return function Int32Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":144}],286:[function(require,module,exports){
require('./_typed-array')('Int8', 1, function (init) {
  return function Int8Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":144}],287:[function(require,module,exports){
require('./_typed-array')('Uint16', 2, function (init) {
  return function Uint16Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":144}],288:[function(require,module,exports){
require('./_typed-array')('Uint32', 4, function (init) {
  return function Uint32Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":144}],289:[function(require,module,exports){
require('./_typed-array')('Uint8', 1, function (init) {
  return function Uint8Array(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
});

},{"./_typed-array":144}],290:[function(require,module,exports){
require('./_typed-array')('Uint8', 1, function (init) {
  return function Uint8ClampedArray(data, byteOffset, length) {
    return init(this, data, byteOffset, length);
  };
}, true);

},{"./_typed-array":144}],291:[function(require,module,exports){
'use strict';
var global = require('./_global');
var each = require('./_array-methods')(0);
var redefine = require('./_redefine');
var meta = require('./_meta');
var assign = require('./_object-assign');
var weak = require('./_collection-weak');
var isObject = require('./_is-object');
var validate = require('./_validate-collection');
var NATIVE_WEAK_MAP = require('./_validate-collection');
var IS_IE11 = !global.ActiveXObject && 'ActiveXObject' in global;
var WEAK_MAP = 'WeakMap';
var getWeak = meta.getWeak;
var isExtensible = Object.isExtensible;
var uncaughtFrozenStore = weak.ufstore;
var InternalMap;

var wrapper = function (get) {
  return function WeakMap() {
    return get(this, arguments.length > 0 ? arguments[0] : undefined);
  };
};

var methods = {
  // 23.3.3.3 WeakMap.prototype.get(key)
  get: function get(key) {
    if (isObject(key)) {
      var data = getWeak(key);
      if (data === true) return uncaughtFrozenStore(validate(this, WEAK_MAP)).get(key);
      return data ? data[this._i] : undefined;
    }
  },
  // 23.3.3.5 WeakMap.prototype.set(key, value)
  set: function set(key, value) {
    return weak.def(validate(this, WEAK_MAP), key, value);
  }
};

// 23.3 WeakMap Objects
var $WeakMap = module.exports = require('./_collection')(WEAK_MAP, wrapper, methods, weak, true, true);

// IE11 WeakMap frozen keys fix
if (NATIVE_WEAK_MAP && IS_IE11) {
  InternalMap = weak.getConstructor(wrapper, WEAK_MAP);
  assign(InternalMap.prototype, methods);
  meta.NEED = true;
  each(['delete', 'has', 'get', 'set'], function (key) {
    var proto = $WeakMap.prototype;
    var method = proto[key];
    redefine(proto, key, function (a, b) {
      // store frozen objects on internal weakmap shim
      if (isObject(a) && !isExtensible(a)) {
        if (!this._f) this._f = new InternalMap();
        var result = this._f[key](a, b);
        return key == 'set' ? this : result;
      // store all the rest on native weakmap
      } return method.call(this, a, b);
    });
  });
}

},{"./_array-methods":35,"./_collection":45,"./_collection-weak":44,"./_global":64,"./_is-object":75,"./_meta":89,"./_object-assign":93,"./_redefine":115,"./_validate-collection":149}],292:[function(require,module,exports){
'use strict';
var weak = require('./_collection-weak');
var validate = require('./_validate-collection');
var WEAK_SET = 'WeakSet';

// 23.4 WeakSet Objects
require('./_collection')(WEAK_SET, function (get) {
  return function WeakSet() { return get(this, arguments.length > 0 ? arguments[0] : undefined); };
}, {
  // 23.4.3.1 WeakSet.prototype.add(value)
  add: function add(value) {
    return weak.def(validate(this, WEAK_SET), value, true);
  }
}, weak, false, true);

},{"./_collection":45,"./_collection-weak":44,"./_validate-collection":149}],293:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-flatMap/#sec-Array.prototype.flatMap
var $export = require('./_export');
var flattenIntoArray = require('./_flatten-into-array');
var toObject = require('./_to-object');
var toLength = require('./_to-length');
var aFunction = require('./_a-function');
var arraySpeciesCreate = require('./_array-species-create');

$export($export.P, 'Array', {
  flatMap: function flatMap(callbackfn /* , thisArg */) {
    var O = toObject(this);
    var sourceLen, A;
    aFunction(callbackfn);
    sourceLen = toLength(O.length);
    A = arraySpeciesCreate(O, 0);
    flattenIntoArray(A, O, O, sourceLen, 0, 1, callbackfn, arguments[1]);
    return A;
  }
});

require('./_add-to-unscopables')('flatMap');

},{"./_a-function":25,"./_add-to-unscopables":27,"./_array-species-create":38,"./_export":56,"./_flatten-into-array":61,"./_to-length":141,"./_to-object":142}],294:[function(require,module,exports){
'use strict';
// https://tc39.github.io/proposal-flatMap/#sec-Array.prototype.flatten
var $export = require('./_export');
var flattenIntoArray = require('./_flatten-into-array');
var toObject = require('./_to-object');
var toLength = require('./_to-length');
var toInteger = require('./_to-integer');
var arraySpeciesCreate = require('./_array-species-create');

$export($export.P, 'Array', {
  flatten: function flatten(/* depthArg = 1 */) {
    var depthArg = arguments[0];
    var O = toObject(this);
    var sourceLen = toLength(O.length);
    var A = arraySpeciesCreate(O, 0);
    flattenIntoArray(A, O, O, sourceLen, 0, depthArg === undefined ? 1 : toInteger(depthArg));
    return A;
  }
});

require('./_add-to-unscopables')('flatten');

},{"./_add-to-unscopables":27,"./_array-species-create":38,"./_export":56,"./_flatten-into-array":61,"./_to-integer":139,"./_to-length":141,"./_to-object":142}],295:[function(require,module,exports){
'use strict';
// https://github.com/tc39/Array.prototype.includes
var $export = require('./_export');
var $includes = require('./_array-includes')(true);

$export($export.P, 'Array', {
  includes: function includes(el /* , fromIndex = 0 */) {
    return $includes(this, el, arguments.length > 1 ? arguments[1] : undefined);
  }
});

require('./_add-to-unscopables')('includes');

},{"./_add-to-unscopables":27,"./_array-includes":34,"./_export":56}],296:[function(require,module,exports){
// https://github.com/rwaldron/tc39-notes/blob/master/es6/2014-09/sept-25.md#510-globalasap-for-enqueuing-a-microtask
var $export = require('./_export');
var microtask = require('./_microtask')();
var process = require('./_global').process;
var isNode = require('./_cof')(process) == 'process';

$export($export.G, {
  asap: function asap(fn) {
    var domain = isNode && process.domain;
    microtask(domain ? domain.bind(fn) : fn);
  }
});

},{"./_cof":41,"./_export":56,"./_global":64,"./_microtask":91}],297:[function(require,module,exports){
// https://github.com/ljharb/proposal-is-error
var $export = require('./_export');
var cof = require('./_cof');

$export($export.S, 'Error', {
  isError: function isError(it) {
    return cof(it) === 'Error';
  }
});

},{"./_cof":41,"./_export":56}],298:[function(require,module,exports){
// https://github.com/tc39/proposal-global
var $export = require('./_export');

$export($export.G, { global: require('./_global') });

},{"./_export":56,"./_global":64}],299:[function(require,module,exports){
// https://tc39.github.io/proposal-setmap-offrom/#sec-map.from
require('./_set-collection-from')('Map');

},{"./_set-collection-from":120}],300:[function(require,module,exports){
// https://tc39.github.io/proposal-setmap-offrom/#sec-map.of
require('./_set-collection-of')('Map');

},{"./_set-collection-of":121}],301:[function(require,module,exports){
// https://github.com/DavidBruant/Map-Set.prototype.toJSON
var $export = require('./_export');

$export($export.P + $export.R, 'Map', { toJSON: require('./_collection-to-json')('Map') });

},{"./_collection-to-json":43,"./_export":56}],302:[function(require,module,exports){
// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');

$export($export.S, 'Math', {
  clamp: function clamp(x, lower, upper) {
    return Math.min(upper, Math.max(lower, x));
  }
});

},{"./_export":56}],303:[function(require,module,exports){
// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');

$export($export.S, 'Math', { DEG_PER_RAD: Math.PI / 180 });

},{"./_export":56}],304:[function(require,module,exports){
// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');
var RAD_PER_DEG = 180 / Math.PI;

$export($export.S, 'Math', {
  degrees: function degrees(radians) {
    return radians * RAD_PER_DEG;
  }
});

},{"./_export":56}],305:[function(require,module,exports){
// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');
var scale = require('./_math-scale');
var fround = require('./_math-fround');

$export($export.S, 'Math', {
  fscale: function fscale(x, inLow, inHigh, outLow, outHigh) {
    return fround(scale(x, inLow, inHigh, outLow, outHigh));
  }
});

},{"./_export":56,"./_math-fround":85,"./_math-scale":87}],306:[function(require,module,exports){
// https://gist.github.com/BrendanEich/4294d5c212a6d2254703
var $export = require('./_export');

$export($export.S, 'Math', {
  iaddh: function iaddh(x0, x1, y0, y1) {
    var $x0 = x0 >>> 0;
    var $x1 = x1 >>> 0;
    var $y0 = y0 >>> 0;
    return $x1 + (y1 >>> 0) + (($x0 & $y0 | ($x0 | $y0) & ~($x0 + $y0 >>> 0)) >>> 31) | 0;
  }
});

},{"./_export":56}],307:[function(require,module,exports){
// https://gist.github.com/BrendanEich/4294d5c212a6d2254703
var $export = require('./_export');

$export($export.S, 'Math', {
  imulh: function imulh(u, v) {
    var UINT16 = 0xffff;
    var $u = +u;
    var $v = +v;
    var u0 = $u & UINT16;
    var v0 = $v & UINT16;
    var u1 = $u >> 16;
    var v1 = $v >> 16;
    var t = (u1 * v0 >>> 0) + (u0 * v0 >>> 16);
    return u1 * v1 + (t >> 16) + ((u0 * v1 >>> 0) + (t & UINT16) >> 16);
  }
});

},{"./_export":56}],308:[function(require,module,exports){
// https://gist.github.com/BrendanEich/4294d5c212a6d2254703
var $export = require('./_export');

$export($export.S, 'Math', {
  isubh: function isubh(x0, x1, y0, y1) {
    var $x0 = x0 >>> 0;
    var $x1 = x1 >>> 0;
    var $y0 = y0 >>> 0;
    return $x1 - (y1 >>> 0) - ((~$x0 & $y0 | ~($x0 ^ $y0) & $x0 - $y0 >>> 0) >>> 31) | 0;
  }
});

},{"./_export":56}],309:[function(require,module,exports){
// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');

$export($export.S, 'Math', { RAD_PER_DEG: 180 / Math.PI });

},{"./_export":56}],310:[function(require,module,exports){
// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');
var DEG_PER_RAD = Math.PI / 180;

$export($export.S, 'Math', {
  radians: function radians(degrees) {
    return degrees * DEG_PER_RAD;
  }
});

},{"./_export":56}],311:[function(require,module,exports){
// https://rwaldron.github.io/proposal-math-extensions/
var $export = require('./_export');

$export($export.S, 'Math', { scale: require('./_math-scale') });

},{"./_export":56,"./_math-scale":87}],312:[function(require,module,exports){
// http://jfbastien.github.io/papers/Math.signbit.html
var $export = require('./_export');

$export($export.S, 'Math', { signbit: function signbit(x) {
  // eslint-disable-next-line no-self-compare
  return (x = +x) != x ? x : x == 0 ? 1 / x == Infinity : x > 0;
} });

},{"./_export":56}],313:[function(require,module,exports){
// https://gist.github.com/BrendanEich/4294d5c212a6d2254703
var $export = require('./_export');

$export($export.S, 'Math', {
  umulh: function umulh(u, v) {
    var UINT16 = 0xffff;
    var $u = +u;
    var $v = +v;
    var u0 = $u & UINT16;
    var v0 = $v & UINT16;
    var u1 = $u >>> 16;
    var v1 = $v >>> 16;
    var t = (u1 * v0 >>> 0) + (u0 * v0 >>> 16);
    return u1 * v1 + (t >>> 16) + ((u0 * v1 >>> 0) + (t & UINT16) >>> 16);
  }
});

},{"./_export":56}],314:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var toObject = require('./_to-object');
var aFunction = require('./_a-function');
var $defineProperty = require('./_object-dp');

// B.2.2.2 Object.prototype.__defineGetter__(P, getter)
require('./_descriptors') && $export($export.P + require('./_object-forced-pam'), 'Object', {
  __defineGetter__: function __defineGetter__(P, getter) {
    $defineProperty.f(toObject(this), P, { get: aFunction(getter), enumerable: true, configurable: true });
  }
});

},{"./_a-function":25,"./_descriptors":52,"./_export":56,"./_object-dp":95,"./_object-forced-pam":97,"./_to-object":142}],315:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var toObject = require('./_to-object');
var aFunction = require('./_a-function');
var $defineProperty = require('./_object-dp');

// B.2.2.3 Object.prototype.__defineSetter__(P, setter)
require('./_descriptors') && $export($export.P + require('./_object-forced-pam'), 'Object', {
  __defineSetter__: function __defineSetter__(P, setter) {
    $defineProperty.f(toObject(this), P, { set: aFunction(setter), enumerable: true, configurable: true });
  }
});

},{"./_a-function":25,"./_descriptors":52,"./_export":56,"./_object-dp":95,"./_object-forced-pam":97,"./_to-object":142}],316:[function(require,module,exports){
// https://github.com/tc39/proposal-object-values-entries
var $export = require('./_export');
var $entries = require('./_object-to-array')(true);

$export($export.S, 'Object', {
  entries: function entries(it) {
    return $entries(it);
  }
});

},{"./_export":56,"./_object-to-array":107}],317:[function(require,module,exports){
// https://github.com/tc39/proposal-object-getownpropertydescriptors
var $export = require('./_export');
var ownKeys = require('./_own-keys');
var toIObject = require('./_to-iobject');
var gOPD = require('./_object-gopd');
var createProperty = require('./_create-property');

$export($export.S, 'Object', {
  getOwnPropertyDescriptors: function getOwnPropertyDescriptors(object) {
    var O = toIObject(object);
    var getDesc = gOPD.f;
    var keys = ownKeys(O);
    var result = {};
    var i = 0;
    var key, desc;
    while (keys.length > i) {
      desc = getDesc(O, key = keys[i++]);
      if (desc !== undefined) createProperty(result, key, desc);
    }
    return result;
  }
});

},{"./_create-property":47,"./_export":56,"./_object-gopd":98,"./_own-keys":108,"./_to-iobject":140}],318:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var toObject = require('./_to-object');
var toPrimitive = require('./_to-primitive');
var getPrototypeOf = require('./_object-gpo');
var getOwnPropertyDescriptor = require('./_object-gopd').f;

// B.2.2.4 Object.prototype.__lookupGetter__(P)
require('./_descriptors') && $export($export.P + require('./_object-forced-pam'), 'Object', {
  __lookupGetter__: function __lookupGetter__(P) {
    var O = toObject(this);
    var K = toPrimitive(P, true);
    var D;
    do {
      if (D = getOwnPropertyDescriptor(O, K)) return D.get;
    } while (O = getPrototypeOf(O));
  }
});

},{"./_descriptors":52,"./_export":56,"./_object-forced-pam":97,"./_object-gopd":98,"./_object-gpo":102,"./_to-object":142,"./_to-primitive":143}],319:[function(require,module,exports){
'use strict';
var $export = require('./_export');
var toObject = require('./_to-object');
var toPrimitive = require('./_to-primitive');
var getPrototypeOf = require('./_object-gpo');
var getOwnPropertyDescriptor = require('./_object-gopd').f;

// B.2.2.5 Object.prototype.__lookupSetter__(P)
require('./_descriptors') && $export($export.P + require('./_object-forced-pam'), 'Object', {
  __lookupSetter__: function __lookupSetter__(P) {
    var O = toObject(this);
    var K = toPrimitive(P, true);
    var D;
    do {
      if (D = getOwnPropertyDescriptor(O, K)) return D.set;
    } while (O = getPrototypeOf(O));
  }
});

},{"./_descriptors":52,"./_export":56,"./_object-forced-pam":97,"./_object-gopd":98,"./_object-gpo":102,"./_to-object":142,"./_to-primitive":143}],320:[function(require,module,exports){
// https://github.com/tc39/proposal-object-values-entries
var $export = require('./_export');
var $values = require('./_object-to-array')(false);

$export($export.S, 'Object', {
  values: function values(it) {
    return $values(it);
  }
});

},{"./_export":56,"./_object-to-array":107}],321:[function(require,module,exports){
'use strict';
// https://github.com/zenparsing/es-observable
var $export = require('./_export');
var global = require('./_global');
var core = require('./_core');
var microtask = require('./_microtask')();
var OBSERVABLE = require('./_wks')('observable');
var aFunction = require('./_a-function');
var anObject = require('./_an-object');
var anInstance = require('./_an-instance');
var redefineAll = require('./_redefine-all');
var hide = require('./_hide');
var forOf = require('./_for-of');
var RETURN = forOf.RETURN;

var getMethod = function (fn) {
  return fn == null ? undefined : aFunction(fn);
};

var cleanupSubscription = function (subscription) {
  var cleanup = subscription._c;
  if (cleanup) {
    subscription._c = undefined;
    cleanup();
  }
};

var subscriptionClosed = function (subscription) {
  return subscription._o === undefined;
};

var closeSubscription = function (subscription) {
  if (!subscriptionClosed(subscription)) {
    subscription._o = undefined;
    cleanupSubscription(subscription);
  }
};

var Subscription = function (observer, subscriber) {
  anObject(observer);
  this._c = undefined;
  this._o = observer;
  observer = new SubscriptionObserver(this);
  try {
    var cleanup = subscriber(observer);
    var subscription = cleanup;
    if (cleanup != null) {
      if (typeof cleanup.unsubscribe === 'function') cleanup = function () { subscription.unsubscribe(); };
      else aFunction(cleanup);
      this._c = cleanup;
    }
  } catch (e) {
    observer.error(e);
    return;
  } if (subscriptionClosed(this)) cleanupSubscription(this);
};

Subscription.prototype = redefineAll({}, {
  unsubscribe: function unsubscribe() { closeSubscription(this); }
});

var SubscriptionObserver = function (subscription) {
  this._s = subscription;
};

SubscriptionObserver.prototype = redefineAll({}, {
  next: function next(value) {
    var subscription = this._s;
    if (!subscriptionClosed(subscription)) {
      var observer = subscription._o;
      try {
        var m = getMethod(observer.next);
        if (m) return m.call(observer, value);
      } catch (e) {
        try {
          closeSubscription(subscription);
        } finally {
          throw e;
        }
      }
    }
  },
  error: function error(value) {
    var subscription = this._s;
    if (subscriptionClosed(subscription)) throw value;
    var observer = subscription._o;
    subscription._o = undefined;
    try {
      var m = getMethod(observer.error);
      if (!m) throw value;
      value = m.call(observer, value);
    } catch (e) {
      try {
        cleanupSubscription(subscription);
      } finally {
        throw e;
      }
    } cleanupSubscription(subscription);
    return value;
  },
  complete: function complete(value) {
    var subscription = this._s;
    if (!subscriptionClosed(subscription)) {
      var observer = subscription._o;
      subscription._o = undefined;
      try {
        var m = getMethod(observer.complete);
        value = m ? m.call(observer, value) : undefined;
      } catch (e) {
        try {
          cleanupSubscription(subscription);
        } finally {
          throw e;
        }
      } cleanupSubscription(subscription);
      return value;
    }
  }
});

var $Observable = function Observable(subscriber) {
  anInstance(this, $Observable, 'Observable', '_f')._f = aFunction(subscriber);
};

redefineAll($Observable.prototype, {
  subscribe: function subscribe(observer) {
    return new Subscription(observer, this._f);
  },
  forEach: function forEach(fn) {
    var that = this;
    return new (core.Promise || global.Promise)(function (resolve, reject) {
      aFunction(fn);
      var subscription = that.subscribe({
        next: function (value) {
          try {
            return fn(value);
          } catch (e) {
            reject(e);
            subscription.unsubscribe();
          }
        },
        error: reject,
        complete: resolve
      });
    });
  }
});

redefineAll($Observable, {
  from: function from(x) {
    var C = typeof this === 'function' ? this : $Observable;
    var method = getMethod(anObject(x)[OBSERVABLE]);
    if (method) {
      var observable = anObject(method.call(x));
      return observable.constructor === C ? observable : new C(function (observer) {
        return observable.subscribe(observer);
      });
    }
    return new C(function (observer) {
      var done = false;
      microtask(function () {
        if (!done) {
          try {
            if (forOf(x, false, function (it) {
              observer.next(it);
              if (done) return RETURN;
            }) === RETURN) return;
          } catch (e) {
            if (done) throw e;
            observer.error(e);
            return;
          } observer.complete();
        }
      });
      return function () { done = true; };
    });
  },
  of: function of() {
    for (var i = 0, l = arguments.length, items = new Array(l); i < l;) items[i] = arguments[i++];
    return new (typeof this === 'function' ? this : $Observable)(function (observer) {
      var done = false;
      microtask(function () {
        if (!done) {
          for (var j = 0; j < items.length; ++j) {
            observer.next(items[j]);
            if (done) return;
          } observer.complete();
        }
      });
      return function () { done = true; };
    });
  }
});

hide($Observable.prototype, OBSERVABLE, function () { return this; });

$export($export.G, { Observable: $Observable });

require('./_set-species')('Observable');

},{"./_a-function":25,"./_an-instance":29,"./_an-object":30,"./_core":46,"./_export":56,"./_for-of":62,"./_global":64,"./_hide":66,"./_microtask":91,"./_redefine-all":114,"./_set-species":123,"./_wks":152}],322:[function(require,module,exports){
// https://github.com/tc39/proposal-promise-finally
'use strict';
var $export = require('./_export');
var core = require('./_core');
var global = require('./_global');
var speciesConstructor = require('./_species-constructor');
var promiseResolve = require('./_promise-resolve');

$export($export.P + $export.R, 'Promise', { 'finally': function (onFinally) {
  var C = speciesConstructor(this, core.Promise || global.Promise);
  var isFunction = typeof onFinally == 'function';
  return this.then(
    isFunction ? function (x) {
      return promiseResolve(C, onFinally()).then(function () { return x; });
    } : onFinally,
    isFunction ? function (e) {
      return promiseResolve(C, onFinally()).then(function () { throw e; });
    } : onFinally
  );
} });

},{"./_core":46,"./_export":56,"./_global":64,"./_promise-resolve":112,"./_species-constructor":127}],323:[function(require,module,exports){
'use strict';
// https://github.com/tc39/proposal-promise-try
var $export = require('./_export');
var newPromiseCapability = require('./_new-promise-capability');
var perform = require('./_perform');

$export($export.S, 'Promise', { 'try': function (callbackfn) {
  var promiseCapability = newPromiseCapability.f(this);
  var result = perform(callbackfn);
  (result.e ? promiseCapability.reject : promiseCapability.resolve)(result.v);
  return promiseCapability.promise;
} });

},{"./_export":56,"./_new-promise-capability":92,"./_perform":111}],324:[function(require,module,exports){
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var toMetaKey = metadata.key;
var ordinaryDefineOwnMetadata = metadata.set;

metadata.exp({ defineMetadata: function defineMetadata(metadataKey, metadataValue, target, targetKey) {
  ordinaryDefineOwnMetadata(metadataKey, metadataValue, anObject(target), toMetaKey(targetKey));
} });

},{"./_an-object":30,"./_metadata":90}],325:[function(require,module,exports){
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var toMetaKey = metadata.key;
var getOrCreateMetadataMap = metadata.map;
var store = metadata.store;

metadata.exp({ deleteMetadata: function deleteMetadata(metadataKey, target /* , targetKey */) {
  var targetKey = arguments.length < 3 ? undefined : toMetaKey(arguments[2]);
  var metadataMap = getOrCreateMetadataMap(anObject(target), targetKey, false);
  if (metadataMap === undefined || !metadataMap['delete'](metadataKey)) return false;
  if (metadataMap.size) return true;
  var targetMetadata = store.get(target);
  targetMetadata['delete'](targetKey);
  return !!targetMetadata.size || store['delete'](target);
} });

},{"./_an-object":30,"./_metadata":90}],326:[function(require,module,exports){
var Set = require('./es6.set');
var from = require('./_array-from-iterable');
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var getPrototypeOf = require('./_object-gpo');
var ordinaryOwnMetadataKeys = metadata.keys;
var toMetaKey = metadata.key;

var ordinaryMetadataKeys = function (O, P) {
  var oKeys = ordinaryOwnMetadataKeys(O, P);
  var parent = getPrototypeOf(O);
  if (parent === null) return oKeys;
  var pKeys = ordinaryMetadataKeys(parent, P);
  return pKeys.length ? oKeys.length ? from(new Set(oKeys.concat(pKeys))) : pKeys : oKeys;
};

metadata.exp({ getMetadataKeys: function getMetadataKeys(target /* , targetKey */) {
  return ordinaryMetadataKeys(anObject(target), arguments.length < 2 ? undefined : toMetaKey(arguments[1]));
} });

},{"./_an-object":30,"./_array-from-iterable":33,"./_metadata":90,"./_object-gpo":102,"./es6.set":256}],327:[function(require,module,exports){
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var getPrototypeOf = require('./_object-gpo');
var ordinaryHasOwnMetadata = metadata.has;
var ordinaryGetOwnMetadata = metadata.get;
var toMetaKey = metadata.key;

var ordinaryGetMetadata = function (MetadataKey, O, P) {
  var hasOwn = ordinaryHasOwnMetadata(MetadataKey, O, P);
  if (hasOwn) return ordinaryGetOwnMetadata(MetadataKey, O, P);
  var parent = getPrototypeOf(O);
  return parent !== null ? ordinaryGetMetadata(MetadataKey, parent, P) : undefined;
};

metadata.exp({ getMetadata: function getMetadata(metadataKey, target /* , targetKey */) {
  return ordinaryGetMetadata(metadataKey, anObject(target), arguments.length < 3 ? undefined : toMetaKey(arguments[2]));
} });

},{"./_an-object":30,"./_metadata":90,"./_object-gpo":102}],328:[function(require,module,exports){
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var ordinaryOwnMetadataKeys = metadata.keys;
var toMetaKey = metadata.key;

metadata.exp({ getOwnMetadataKeys: function getOwnMetadataKeys(target /* , targetKey */) {
  return ordinaryOwnMetadataKeys(anObject(target), arguments.length < 2 ? undefined : toMetaKey(arguments[1]));
} });

},{"./_an-object":30,"./_metadata":90}],329:[function(require,module,exports){
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var ordinaryGetOwnMetadata = metadata.get;
var toMetaKey = metadata.key;

metadata.exp({ getOwnMetadata: function getOwnMetadata(metadataKey, target /* , targetKey */) {
  return ordinaryGetOwnMetadata(metadataKey, anObject(target)
    , arguments.length < 3 ? undefined : toMetaKey(arguments[2]));
} });

},{"./_an-object":30,"./_metadata":90}],330:[function(require,module,exports){
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var getPrototypeOf = require('./_object-gpo');
var ordinaryHasOwnMetadata = metadata.has;
var toMetaKey = metadata.key;

var ordinaryHasMetadata = function (MetadataKey, O, P) {
  var hasOwn = ordinaryHasOwnMetadata(MetadataKey, O, P);
  if (hasOwn) return true;
  var parent = getPrototypeOf(O);
  return parent !== null ? ordinaryHasMetadata(MetadataKey, parent, P) : false;
};

metadata.exp({ hasMetadata: function hasMetadata(metadataKey, target /* , targetKey */) {
  return ordinaryHasMetadata(metadataKey, anObject(target), arguments.length < 3 ? undefined : toMetaKey(arguments[2]));
} });

},{"./_an-object":30,"./_metadata":90,"./_object-gpo":102}],331:[function(require,module,exports){
var metadata = require('./_metadata');
var anObject = require('./_an-object');
var ordinaryHasOwnMetadata = metadata.has;
var toMetaKey = metadata.key;

metadata.exp({ hasOwnMetadata: function hasOwnMetadata(metadataKey, target /* , targetKey */) {
  return ordinaryHasOwnMetadata(metadataKey, anObject(target)
    , arguments.length < 3 ? undefined : toMetaKey(arguments[2]));
} });

},{"./_an-object":30,"./_metadata":90}],332:[function(require,module,exports){
var $metadata = require('./_metadata');
var anObject = require('./_an-object');
var aFunction = require('./_a-function');
var toMetaKey = $metadata.key;
var ordinaryDefineOwnMetadata = $metadata.set;

$metadata.exp({ metadata: function metadata(metadataKey, metadataValue) {
  return function decorator(target, targetKey) {
    ordinaryDefineOwnMetadata(
      metadataKey, metadataValue,
      (targetKey !== undefined ? anObject : aFunction)(target),
      toMetaKey(targetKey)
    );
  };
} });

},{"./_a-function":25,"./_an-object":30,"./_metadata":90}],333:[function(require,module,exports){
// https://tc39.github.io/proposal-setmap-offrom/#sec-set.from
require('./_set-collection-from')('Set');

},{"./_set-collection-from":120}],334:[function(require,module,exports){
// https://tc39.github.io/proposal-setmap-offrom/#sec-set.of
require('./_set-collection-of')('Set');

},{"./_set-collection-of":121}],335:[function(require,module,exports){
// https://github.com/DavidBruant/Map-Set.prototype.toJSON
var $export = require('./_export');

$export($export.P + $export.R, 'Set', { toJSON: require('./_collection-to-json')('Set') });

},{"./_collection-to-json":43,"./_export":56}],336:[function(require,module,exports){
'use strict';
// https://github.com/mathiasbynens/String.prototype.at
var $export = require('./_export');
var $at = require('./_string-at')(true);

$export($export.P, 'String', {
  at: function at(pos) {
    return $at(this, pos);
  }
});

},{"./_export":56,"./_string-at":129}],337:[function(require,module,exports){
'use strict';
// https://tc39.github.io/String.prototype.matchAll/
var $export = require('./_export');
var defined = require('./_defined');
var toLength = require('./_to-length');
var isRegExp = require('./_is-regexp');
var getFlags = require('./_flags');
var RegExpProto = RegExp.prototype;

var $RegExpStringIterator = function (regexp, string) {
  this._r = regexp;
  this._s = string;
};

require('./_iter-create')($RegExpStringIterator, 'RegExp String', function next() {
  var match = this._r.exec(this._s);
  return { value: match, done: match === null };
});

$export($export.P, 'String', {
  matchAll: function matchAll(regexp) {
    defined(this);
    if (!isRegExp(regexp)) throw TypeError(regexp + ' is not a regexp!');
    var S = String(this);
    var flags = 'flags' in RegExpProto ? String(regexp.flags) : getFlags.call(regexp);
    var rx = new RegExp(regexp.source, ~flags.indexOf('g') ? flags : 'g' + flags);
    rx.lastIndex = toLength(regexp.lastIndex);
    return new $RegExpStringIterator(rx, S);
  }
});

},{"./_defined":51,"./_export":56,"./_flags":60,"./_is-regexp":76,"./_iter-create":78,"./_to-length":141}],338:[function(require,module,exports){
'use strict';
// https://github.com/tc39/proposal-string-pad-start-end
var $export = require('./_export');
var $pad = require('./_string-pad');
var userAgent = require('./_user-agent');

// https://github.com/zloirock/core-js/issues/280
var WEBKIT_BUG = /Version\/10\.\d+(\.\d+)?( Mobile\/\w+)? Safari\//.test(userAgent);

$export($export.P + $export.F * WEBKIT_BUG, 'String', {
  padEnd: function padEnd(maxLength /* , fillString = ' ' */) {
    return $pad(this, maxLength, arguments.length > 1 ? arguments[1] : undefined, false);
  }
});

},{"./_export":56,"./_string-pad":132,"./_user-agent":148}],339:[function(require,module,exports){
'use strict';
// https://github.com/tc39/proposal-string-pad-start-end
var $export = require('./_export');
var $pad = require('./_string-pad');
var userAgent = require('./_user-agent');

// https://github.com/zloirock/core-js/issues/280
var WEBKIT_BUG = /Version\/10\.\d+(\.\d+)?( Mobile\/\w+)? Safari\//.test(userAgent);

$export($export.P + $export.F * WEBKIT_BUG, 'String', {
  padStart: function padStart(maxLength /* , fillString = ' ' */) {
    return $pad(this, maxLength, arguments.length > 1 ? arguments[1] : undefined, true);
  }
});

},{"./_export":56,"./_string-pad":132,"./_user-agent":148}],340:[function(require,module,exports){
'use strict';
// https://github.com/sebmarkbage/ecmascript-string-left-right-trim
require('./_string-trim')('trimLeft', function ($trim) {
  return function trimLeft() {
    return $trim(this, 1);
  };
}, 'trimStart');

},{"./_string-trim":134}],341:[function(require,module,exports){
'use strict';
// https://github.com/sebmarkbage/ecmascript-string-left-right-trim
require('./_string-trim')('trimRight', function ($trim) {
  return function trimRight() {
    return $trim(this, 2);
  };
}, 'trimEnd');

},{"./_string-trim":134}],342:[function(require,module,exports){
require('./_wks-define')('asyncIterator');

},{"./_wks-define":150}],343:[function(require,module,exports){
require('./_wks-define')('observable');

},{"./_wks-define":150}],344:[function(require,module,exports){
// https://github.com/tc39/proposal-global
var $export = require('./_export');

$export($export.S, 'System', { global: require('./_global') });

},{"./_export":56,"./_global":64}],345:[function(require,module,exports){
// https://tc39.github.io/proposal-setmap-offrom/#sec-weakmap.from
require('./_set-collection-from')('WeakMap');

},{"./_set-collection-from":120}],346:[function(require,module,exports){
// https://tc39.github.io/proposal-setmap-offrom/#sec-weakmap.of
require('./_set-collection-of')('WeakMap');

},{"./_set-collection-of":121}],347:[function(require,module,exports){
// https://tc39.github.io/proposal-setmap-offrom/#sec-weakset.from
require('./_set-collection-from')('WeakSet');

},{"./_set-collection-from":120}],348:[function(require,module,exports){
// https://tc39.github.io/proposal-setmap-offrom/#sec-weakset.of
require('./_set-collection-of')('WeakSet');

},{"./_set-collection-of":121}],349:[function(require,module,exports){
var $iterators = require('./es6.array.iterator');
var getKeys = require('./_object-keys');
var redefine = require('./_redefine');
var global = require('./_global');
var hide = require('./_hide');
var Iterators = require('./_iterators');
var wks = require('./_wks');
var ITERATOR = wks('iterator');
var TO_STRING_TAG = wks('toStringTag');
var ArrayValues = Iterators.Array;

var DOMIterables = {
  CSSRuleList: true, // TODO: Not spec compliant, should be false.
  CSSStyleDeclaration: false,
  CSSValueList: false,
  ClientRectList: false,
  DOMRectList: false,
  DOMStringList: false,
  DOMTokenList: true,
  DataTransferItemList: false,
  FileList: false,
  HTMLAllCollection: false,
  HTMLCollection: false,
  HTMLFormElement: false,
  HTMLSelectElement: false,
  MediaList: true, // TODO: Not spec compliant, should be false.
  MimeTypeArray: false,
  NamedNodeMap: false,
  NodeList: true,
  PaintRequestList: false,
  Plugin: false,
  PluginArray: false,
  SVGLengthList: false,
  SVGNumberList: false,
  SVGPathSegList: false,
  SVGPointList: false,
  SVGStringList: false,
  SVGTransformList: false,
  SourceBufferList: false,
  StyleSheetList: true, // TODO: Not spec compliant, should be false.
  TextTrackCueList: false,
  TextTrackList: false,
  TouchList: false
};

for (var collections = getKeys(DOMIterables), i = 0; i < collections.length; i++) {
  var NAME = collections[i];
  var explicit = DOMIterables[NAME];
  var Collection = global[NAME];
  var proto = Collection && Collection.prototype;
  var key;
  if (proto) {
    if (!proto[ITERATOR]) hide(proto, ITERATOR, ArrayValues);
    if (!proto[TO_STRING_TAG]) hide(proto, TO_STRING_TAG, NAME);
    Iterators[NAME] = ArrayValues;
    if (explicit) for (key in $iterators) if (!proto[key]) redefine(proto, key, $iterators[key], true);
  }
}

},{"./_global":64,"./_hide":66,"./_iterators":82,"./_object-keys":104,"./_redefine":115,"./_wks":152,"./es6.array.iterator":165}],350:[function(require,module,exports){
var $export = require('./_export');
var $task = require('./_task');
$export($export.G + $export.B, {
  setImmediate: $task.set,
  clearImmediate: $task.clear
});

},{"./_export":56,"./_task":136}],351:[function(require,module,exports){
// ie9- setTimeout & setInterval additional parameters fix
var global = require('./_global');
var $export = require('./_export');
var userAgent = require('./_user-agent');
var slice = [].slice;
var MSIE = /MSIE .\./.test(userAgent); // <- dirty ie9- check
var wrap = function (set) {
  return function (fn, time /* , ...args */) {
    var boundArgs = arguments.length > 2;
    var args = boundArgs ? slice.call(arguments, 2) : false;
    return set(boundArgs ? function () {
      // eslint-disable-next-line no-new-func
      (typeof fn == 'function' ? fn : Function(fn)).apply(this, args);
    } : fn, time);
  };
};
$export($export.G + $export.B + $export.F * MSIE, {
  setTimeout: wrap(global.setTimeout),
  setInterval: wrap(global.setInterval)
});

},{"./_export":56,"./_global":64,"./_user-agent":148}],352:[function(require,module,exports){
require('./modules/es6.symbol');
require('./modules/es6.object.create');
require('./modules/es6.object.define-property');
require('./modules/es6.object.define-properties');
require('./modules/es6.object.get-own-property-descriptor');
require('./modules/es6.object.get-prototype-of');
require('./modules/es6.object.keys');
require('./modules/es6.object.get-own-property-names');
require('./modules/es6.object.freeze');
require('./modules/es6.object.seal');
require('./modules/es6.object.prevent-extensions');
require('./modules/es6.object.is-frozen');
require('./modules/es6.object.is-sealed');
require('./modules/es6.object.is-extensible');
require('./modules/es6.object.assign');
require('./modules/es6.object.is');
require('./modules/es6.object.set-prototype-of');
require('./modules/es6.object.to-string');
require('./modules/es6.function.bind');
require('./modules/es6.function.name');
require('./modules/es6.function.has-instance');
require('./modules/es6.parse-int');
require('./modules/es6.parse-float');
require('./modules/es6.number.constructor');
require('./modules/es6.number.to-fixed');
require('./modules/es6.number.to-precision');
require('./modules/es6.number.epsilon');
require('./modules/es6.number.is-finite');
require('./modules/es6.number.is-integer');
require('./modules/es6.number.is-nan');
require('./modules/es6.number.is-safe-integer');
require('./modules/es6.number.max-safe-integer');
require('./modules/es6.number.min-safe-integer');
require('./modules/es6.number.parse-float');
require('./modules/es6.number.parse-int');
require('./modules/es6.math.acosh');
require('./modules/es6.math.asinh');
require('./modules/es6.math.atanh');
require('./modules/es6.math.cbrt');
require('./modules/es6.math.clz32');
require('./modules/es6.math.cosh');
require('./modules/es6.math.expm1');
require('./modules/es6.math.fround');
require('./modules/es6.math.hypot');
require('./modules/es6.math.imul');
require('./modules/es6.math.log10');
require('./modules/es6.math.log1p');
require('./modules/es6.math.log2');
require('./modules/es6.math.sign');
require('./modules/es6.math.sinh');
require('./modules/es6.math.tanh');
require('./modules/es6.math.trunc');
require('./modules/es6.string.from-code-point');
require('./modules/es6.string.raw');
require('./modules/es6.string.trim');
require('./modules/es6.string.iterator');
require('./modules/es6.string.code-point-at');
require('./modules/es6.string.ends-with');
require('./modules/es6.string.includes');
require('./modules/es6.string.repeat');
require('./modules/es6.string.starts-with');
require('./modules/es6.string.anchor');
require('./modules/es6.string.big');
require('./modules/es6.string.blink');
require('./modules/es6.string.bold');
require('./modules/es6.string.fixed');
require('./modules/es6.string.fontcolor');
require('./modules/es6.string.fontsize');
require('./modules/es6.string.italics');
require('./modules/es6.string.link');
require('./modules/es6.string.small');
require('./modules/es6.string.strike');
require('./modules/es6.string.sub');
require('./modules/es6.string.sup');
require('./modules/es6.date.now');
require('./modules/es6.date.to-json');
require('./modules/es6.date.to-iso-string');
require('./modules/es6.date.to-string');
require('./modules/es6.date.to-primitive');
require('./modules/es6.array.is-array');
require('./modules/es6.array.from');
require('./modules/es6.array.of');
require('./modules/es6.array.join');
require('./modules/es6.array.slice');
require('./modules/es6.array.sort');
require('./modules/es6.array.for-each');
require('./modules/es6.array.map');
require('./modules/es6.array.filter');
require('./modules/es6.array.some');
require('./modules/es6.array.every');
require('./modules/es6.array.reduce');
require('./modules/es6.array.reduce-right');
require('./modules/es6.array.index-of');
require('./modules/es6.array.last-index-of');
require('./modules/es6.array.copy-within');
require('./modules/es6.array.fill');
require('./modules/es6.array.find');
require('./modules/es6.array.find-index');
require('./modules/es6.array.species');
require('./modules/es6.array.iterator');
require('./modules/es6.regexp.constructor');
require('./modules/es6.regexp.exec');
require('./modules/es6.regexp.to-string');
require('./modules/es6.regexp.flags');
require('./modules/es6.regexp.match');
require('./modules/es6.regexp.replace');
require('./modules/es6.regexp.search');
require('./modules/es6.regexp.split');
require('./modules/es6.promise');
require('./modules/es6.map');
require('./modules/es6.set');
require('./modules/es6.weak-map');
require('./modules/es6.weak-set');
require('./modules/es6.typed.array-buffer');
require('./modules/es6.typed.data-view');
require('./modules/es6.typed.int8-array');
require('./modules/es6.typed.uint8-array');
require('./modules/es6.typed.uint8-clamped-array');
require('./modules/es6.typed.int16-array');
require('./modules/es6.typed.uint16-array');
require('./modules/es6.typed.int32-array');
require('./modules/es6.typed.uint32-array');
require('./modules/es6.typed.float32-array');
require('./modules/es6.typed.float64-array');
require('./modules/es6.reflect.apply');
require('./modules/es6.reflect.construct');
require('./modules/es6.reflect.define-property');
require('./modules/es6.reflect.delete-property');
require('./modules/es6.reflect.enumerate');
require('./modules/es6.reflect.get');
require('./modules/es6.reflect.get-own-property-descriptor');
require('./modules/es6.reflect.get-prototype-of');
require('./modules/es6.reflect.has');
require('./modules/es6.reflect.is-extensible');
require('./modules/es6.reflect.own-keys');
require('./modules/es6.reflect.prevent-extensions');
require('./modules/es6.reflect.set');
require('./modules/es6.reflect.set-prototype-of');
require('./modules/es7.array.includes');
require('./modules/es7.array.flat-map');
require('./modules/es7.array.flatten');
require('./modules/es7.string.at');
require('./modules/es7.string.pad-start');
require('./modules/es7.string.pad-end');
require('./modules/es7.string.trim-left');
require('./modules/es7.string.trim-right');
require('./modules/es7.string.match-all');
require('./modules/es7.symbol.async-iterator');
require('./modules/es7.symbol.observable');
require('./modules/es7.object.get-own-property-descriptors');
require('./modules/es7.object.values');
require('./modules/es7.object.entries');
require('./modules/es7.object.define-getter');
require('./modules/es7.object.define-setter');
require('./modules/es7.object.lookup-getter');
require('./modules/es7.object.lookup-setter');
require('./modules/es7.map.to-json');
require('./modules/es7.set.to-json');
require('./modules/es7.map.of');
require('./modules/es7.set.of');
require('./modules/es7.weak-map.of');
require('./modules/es7.weak-set.of');
require('./modules/es7.map.from');
require('./modules/es7.set.from');
require('./modules/es7.weak-map.from');
require('./modules/es7.weak-set.from');
require('./modules/es7.global');
require('./modules/es7.system.global');
require('./modules/es7.error.is-error');
require('./modules/es7.math.clamp');
require('./modules/es7.math.deg-per-rad');
require('./modules/es7.math.degrees');
require('./modules/es7.math.fscale');
require('./modules/es7.math.iaddh');
require('./modules/es7.math.isubh');
require('./modules/es7.math.imulh');
require('./modules/es7.math.rad-per-deg');
require('./modules/es7.math.radians');
require('./modules/es7.math.scale');
require('./modules/es7.math.umulh');
require('./modules/es7.math.signbit');
require('./modules/es7.promise.finally');
require('./modules/es7.promise.try');
require('./modules/es7.reflect.define-metadata');
require('./modules/es7.reflect.delete-metadata');
require('./modules/es7.reflect.get-metadata');
require('./modules/es7.reflect.get-metadata-keys');
require('./modules/es7.reflect.get-own-metadata');
require('./modules/es7.reflect.get-own-metadata-keys');
require('./modules/es7.reflect.has-metadata');
require('./modules/es7.reflect.has-own-metadata');
require('./modules/es7.reflect.metadata');
require('./modules/es7.asap');
require('./modules/es7.observable');
require('./modules/web.timers');
require('./modules/web.immediate');
require('./modules/web.dom.iterable');
module.exports = require('./modules/_core');

},{"./modules/_core":46,"./modules/es6.array.copy-within":155,"./modules/es6.array.every":156,"./modules/es6.array.fill":157,"./modules/es6.array.filter":158,"./modules/es6.array.find":160,"./modules/es6.array.find-index":159,"./modules/es6.array.for-each":161,"./modules/es6.array.from":162,"./modules/es6.array.index-of":163,"./modules/es6.array.is-array":164,"./modules/es6.array.iterator":165,"./modules/es6.array.join":166,"./modules/es6.array.last-index-of":167,"./modules/es6.array.map":168,"./modules/es6.array.of":169,"./modules/es6.array.reduce":171,"./modules/es6.array.reduce-right":170,"./modules/es6.array.slice":172,"./modules/es6.array.some":173,"./modules/es6.array.sort":174,"./modules/es6.array.species":175,"./modules/es6.date.now":176,"./modules/es6.date.to-iso-string":177,"./modules/es6.date.to-json":178,"./modules/es6.date.to-primitive":179,"./modules/es6.date.to-string":180,"./modules/es6.function.bind":181,"./modules/es6.function.has-instance":182,"./modules/es6.function.name":183,"./modules/es6.map":184,"./modules/es6.math.acosh":185,"./modules/es6.math.asinh":186,"./modules/es6.math.atanh":187,"./modules/es6.math.cbrt":188,"./modules/es6.math.clz32":189,"./modules/es6.math.cosh":190,"./modules/es6.math.expm1":191,"./modules/es6.math.fround":192,"./modules/es6.math.hypot":193,"./modules/es6.math.imul":194,"./modules/es6.math.log10":195,"./modules/es6.math.log1p":196,"./modules/es6.math.log2":197,"./modules/es6.math.sign":198,"./modules/es6.math.sinh":199,"./modules/es6.math.tanh":200,"./modules/es6.math.trunc":201,"./modules/es6.number.constructor":202,"./modules/es6.number.epsilon":203,"./modules/es6.number.is-finite":204,"./modules/es6.number.is-integer":205,"./modules/es6.number.is-nan":206,"./modules/es6.number.is-safe-integer":207,"./modules/es6.number.max-safe-integer":208,"./modules/es6.number.min-safe-integer":209,"./modules/es6.number.parse-float":210,"./modules/es6.number.parse-int":211,"./modules/es6.number.to-fixed":212,"./modules/es6.number.to-precision":213,"./modules/es6.object.assign":214,"./modules/es6.object.create":215,"./modules/es6.object.define-properties":216,"./modules/es6.object.define-property":217,"./modules/es6.object.freeze":218,"./modules/es6.object.get-own-property-descriptor":219,"./modules/es6.object.get-own-property-names":220,"./modules/es6.object.get-prototype-of":221,"./modules/es6.object.is":225,"./modules/es6.object.is-extensible":222,"./modules/es6.object.is-frozen":223,"./modules/es6.object.is-sealed":224,"./modules/es6.object.keys":226,"./modules/es6.object.prevent-extensions":227,"./modules/es6.object.seal":228,"./modules/es6.object.set-prototype-of":229,"./modules/es6.object.to-string":230,"./modules/es6.parse-float":231,"./modules/es6.parse-int":232,"./modules/es6.promise":233,"./modules/es6.reflect.apply":234,"./modules/es6.reflect.construct":235,"./modules/es6.reflect.define-property":236,"./modules/es6.reflect.delete-property":237,"./modules/es6.reflect.enumerate":238,"./modules/es6.reflect.get":241,"./modules/es6.reflect.get-own-property-descriptor":239,"./modules/es6.reflect.get-prototype-of":240,"./modules/es6.reflect.has":242,"./modules/es6.reflect.is-extensible":243,"./modules/es6.reflect.own-keys":244,"./modules/es6.reflect.prevent-extensions":245,"./modules/es6.reflect.set":247,"./modules/es6.reflect.set-prototype-of":246,"./modules/es6.regexp.constructor":248,"./modules/es6.regexp.exec":249,"./modules/es6.regexp.flags":250,"./modules/es6.regexp.match":251,"./modules/es6.regexp.replace":252,"./modules/es6.regexp.search":253,"./modules/es6.regexp.split":254,"./modules/es6.regexp.to-string":255,"./modules/es6.set":256,"./modules/es6.string.anchor":257,"./modules/es6.string.big":258,"./modules/es6.string.blink":259,"./modules/es6.string.bold":260,"./modules/es6.string.code-point-at":261,"./modules/es6.string.ends-with":262,"./modules/es6.string.fixed":263,"./modules/es6.string.fontcolor":264,"./modules/es6.string.fontsize":265,"./modules/es6.string.from-code-point":266,"./modules/es6.string.includes":267,"./modules/es6.string.italics":268,"./modules/es6.string.iterator":269,"./modules/es6.string.link":270,"./modules/es6.string.raw":271,"./modules/es6.string.repeat":272,"./modules/es6.string.small":273,"./modules/es6.string.starts-with":274,"./modules/es6.string.strike":275,"./modules/es6.string.sub":276,"./modules/es6.string.sup":277,"./modules/es6.string.trim":278,"./modules/es6.symbol":279,"./modules/es6.typed.array-buffer":280,"./modules/es6.typed.data-view":281,"./modules/es6.typed.float32-array":282,"./modules/es6.typed.float64-array":283,"./modules/es6.typed.int16-array":284,"./modules/es6.typed.int32-array":285,"./modules/es6.typed.int8-array":286,"./modules/es6.typed.uint16-array":287,"./modules/es6.typed.uint32-array":288,"./modules/es6.typed.uint8-array":289,"./modules/es6.typed.uint8-clamped-array":290,"./modules/es6.weak-map":291,"./modules/es6.weak-set":292,"./modules/es7.array.flat-map":293,"./modules/es7.array.flatten":294,"./modules/es7.array.includes":295,"./modules/es7.asap":296,"./modules/es7.error.is-error":297,"./modules/es7.global":298,"./modules/es7.map.from":299,"./modules/es7.map.of":300,"./modules/es7.map.to-json":301,"./modules/es7.math.clamp":302,"./modules/es7.math.deg-per-rad":303,"./modules/es7.math.degrees":304,"./modules/es7.math.fscale":305,"./modules/es7.math.iaddh":306,"./modules/es7.math.imulh":307,"./modules/es7.math.isubh":308,"./modules/es7.math.rad-per-deg":309,"./modules/es7.math.radians":310,"./modules/es7.math.scale":311,"./modules/es7.math.signbit":312,"./modules/es7.math.umulh":313,"./modules/es7.object.define-getter":314,"./modules/es7.object.define-setter":315,"./modules/es7.object.entries":316,"./modules/es7.object.get-own-property-descriptors":317,"./modules/es7.object.lookup-getter":318,"./modules/es7.object.lookup-setter":319,"./modules/es7.object.values":320,"./modules/es7.observable":321,"./modules/es7.promise.finally":322,"./modules/es7.promise.try":323,"./modules/es7.reflect.define-metadata":324,"./modules/es7.reflect.delete-metadata":325,"./modules/es7.reflect.get-metadata":327,"./modules/es7.reflect.get-metadata-keys":326,"./modules/es7.reflect.get-own-metadata":329,"./modules/es7.reflect.get-own-metadata-keys":328,"./modules/es7.reflect.has-metadata":330,"./modules/es7.reflect.has-own-metadata":331,"./modules/es7.reflect.metadata":332,"./modules/es7.set.from":333,"./modules/es7.set.of":334,"./modules/es7.set.to-json":335,"./modules/es7.string.at":336,"./modules/es7.string.match-all":337,"./modules/es7.string.pad-end":338,"./modules/es7.string.pad-start":339,"./modules/es7.string.trim-left":340,"./modules/es7.string.trim-right":341,"./modules/es7.symbol.async-iterator":342,"./modules/es7.symbol.observable":343,"./modules/es7.system.global":344,"./modules/es7.weak-map.from":345,"./modules/es7.weak-map.of":346,"./modules/es7.weak-set.from":347,"./modules/es7.weak-set.of":348,"./modules/web.dom.iterable":349,"./modules/web.immediate":350,"./modules/web.timers":351}],353:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],354:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],355:[function(require,module,exports){
(function (Buffer){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLength = exports.decode = exports.encode = void 0;
var BN = require("bn.js");
/**
 * RLP Encoding based on: https://github.com/ethereum/wiki/wiki/%5BEnglish%5D-RLP
 * This function takes in a data, convert it to buffer if not, and a length for recursion
 * @param input - will be converted to buffer
 * @returns returns buffer of encoded data
 **/
function encode(input) {
    if (Array.isArray(input)) {
        var output = [];
        for (var i = 0; i < input.length; i++) {
            output.push(encode(input[i]));
        }
        var buf = Buffer.concat(output);
        return Buffer.concat([encodeLength(buf.length, 192), buf]);
    }
    else {
        var inputBuf = toBuffer(input);
        return inputBuf.length === 1 && inputBuf[0] < 128
            ? inputBuf
            : Buffer.concat([encodeLength(inputBuf.length, 128), inputBuf]);
    }
}
exports.encode = encode;
/**
 * Parse integers. Check if there is no leading zeros
 * @param v The value to parse
 * @param base The base to parse the integer into
 */
function safeParseInt(v, base) {
    if (v.slice(0, 2) === '00') {
        throw new Error('invalid RLP: extra zeros');
    }
    return parseInt(v, base);
}
function encodeLength(len, offset) {
    if (len < 56) {
        return Buffer.from([len + offset]);
    }
    else {
        var hexLength = intToHex(len);
        var lLength = hexLength.length / 2;
        var firstByte = intToHex(offset + 55 + lLength);
        return Buffer.from(firstByte + hexLength, 'hex');
    }
}
function decode(input, stream) {
    if (stream === void 0) { stream = false; }
    if (!input || input.length === 0) {
        return Buffer.from([]);
    }
    var inputBuffer = toBuffer(input);
    var decoded = _decode(inputBuffer);
    if (stream) {
        return decoded;
    }
    if (decoded.remainder.length !== 0) {
        throw new Error('invalid remainder');
    }
    return decoded.data;
}
exports.decode = decode;
/**
 * Get the length of the RLP input
 * @param input
 * @returns The length of the input or an empty Buffer if no input
 */
function getLength(input) {
    if (!input || input.length === 0) {
        return Buffer.from([]);
    }
    var inputBuffer = toBuffer(input);
    var firstByte = inputBuffer[0];
    if (firstByte <= 0x7f) {
        return inputBuffer.length;
    }
    else if (firstByte <= 0xb7) {
        return firstByte - 0x7f;
    }
    else if (firstByte <= 0xbf) {
        return firstByte - 0xb6;
    }
    else if (firstByte <= 0xf7) {
        // a list between  0-55 bytes long
        return firstByte - 0xbf;
    }
    else {
        // a list  over 55 bytes long
        var llength = firstByte - 0xf6;
        var length = safeParseInt(inputBuffer.slice(1, llength).toString('hex'), 16);
        return llength + length;
    }
}
exports.getLength = getLength;
/** Decode an input with RLP */
function _decode(input) {
    var length, llength, data, innerRemainder, d;
    var decoded = [];
    var firstByte = input[0];
    if (firstByte <= 0x7f) {
        // a single byte whose value is in the [0x00, 0x7f] range, that byte is its own RLP encoding.
        return {
            data: input.slice(0, 1),
            remainder: input.slice(1),
        };
    }
    else if (firstByte <= 0xb7) {
        // string is 0-55 bytes long. A single byte with value 0x80 plus the length of the string followed by the string
        // The range of the first byte is [0x80, 0xb7]
        length = firstByte - 0x7f;
        // set 0x80 null to 0
        if (firstByte === 0x80) {
            data = Buffer.from([]);
        }
        else {
            data = input.slice(1, length);
        }
        if (length === 2 && data[0] < 0x80) {
            throw new Error('invalid rlp encoding: byte must be less 0x80');
        }
        return {
            data: data,
            remainder: input.slice(length),
        };
    }
    else if (firstByte <= 0xbf) {
        // string is greater than 55 bytes long. A single byte with the value (0xb7 plus the length of the length),
        // followed by the length, followed by the string
        llength = firstByte - 0xb6;
        if (input.length - 1 < llength) {
            throw new Error('invalid RLP: not enough bytes for string length');
        }
        length = safeParseInt(input.slice(1, llength).toString('hex'), 16);
        if (length <= 55) {
            throw new Error('invalid RLP: expected string length to be greater than 55');
        }
        data = input.slice(llength, length + llength);
        if (data.length < length) {
            throw new Error('invalid RLP: not enough bytes for string');
        }
        return {
            data: data,
            remainder: input.slice(length + llength),
        };
    }
    else if (firstByte <= 0xf7) {
        // a list between  0-55 bytes long
        length = firstByte - 0xbf;
        innerRemainder = input.slice(1, length);
        while (innerRemainder.length) {
            d = _decode(innerRemainder);
            decoded.push(d.data);
            innerRemainder = d.remainder;
        }
        return {
            data: decoded,
            remainder: input.slice(length),
        };
    }
    else {
        // a list  over 55 bytes long
        llength = firstByte - 0xf6;
        length = safeParseInt(input.slice(1, llength).toString('hex'), 16);
        var totalLength = llength + length;
        if (totalLength > input.length) {
            throw new Error('invalid rlp: total length is larger than the data');
        }
        innerRemainder = input.slice(llength, totalLength);
        if (innerRemainder.length === 0) {
            throw new Error('invalid rlp, List has a invalid length');
        }
        while (innerRemainder.length) {
            d = _decode(innerRemainder);
            decoded.push(d.data);
            innerRemainder = d.remainder;
        }
        return {
            data: decoded,
            remainder: input.slice(totalLength),
        };
    }
}
/** Check if a string is prefixed by 0x */
function isHexPrefixed(str) {
    return str.slice(0, 2) === '0x';
}
/** Removes 0x from a given String */
function stripHexPrefix(str) {
    if (typeof str !== 'string') {
        return str;
    }
    return isHexPrefixed(str) ? str.slice(2) : str;
}
/** Transform an integer into its hexadecimal value */
function intToHex(integer) {
    if (integer < 0) {
        throw new Error('Invalid integer as argument, must be unsigned!');
    }
    var hex = integer.toString(16);
    return hex.length % 2 ? "0" + hex : hex;
}
/** Pad a string to be even */
function padToEven(a) {
    return a.length % 2 ? "0" + a : a;
}
/** Transform an integer into a Buffer */
function intToBuffer(integer) {
    var hex = intToHex(integer);
    return Buffer.from(hex, 'hex');
}
/** Transform anything into a Buffer */
function toBuffer(v) {
    if (!Buffer.isBuffer(v)) {
        if (typeof v === 'string') {
            if (isHexPrefixed(v)) {
                return Buffer.from(padToEven(stripHexPrefix(v)), 'hex');
            }
            else {
                return Buffer.from(v);
            }
        }
        else if (typeof v === 'number' || typeof v === 'bigint') {
            if (!v) {
                return Buffer.from([]);
            }
            else {
                return intToBuffer(v);
            }
        }
        else if (v === null || v === undefined) {
            return Buffer.from([]);
        }
        else if (v instanceof Uint8Array) {
            return Buffer.from(v);
        }
        else if (BN.isBN(v)) {
            // converts a BN to a Buffer
            return Buffer.from(v.toArray());
        }
        else {
            throw new Error('invalid type');
        }
    }
    return v;
}

}).call(this,require("buffer").Buffer)
},{"bn.js":21,"buffer":23}],356:[function(require,module,exports){
'use strict';
module.exports = require( './lib/u2f-api' );
},{"./lib/u2f-api":358}],357:[function(require,module,exports){
// Copyright 2014 Google Inc. All rights reserved
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * @fileoverview The U2F api.
 */

'use strict';

/** Namespace for the U2F api.
 * @type {Object}
 */
var u2f = u2f || {};

module.exports = u2f; // Adaptation for u2f-api package

/**
 * The U2F extension id
 * @type {string}
 * @const
 */
u2f.EXTENSION_ID = 'kmendfapggjehodndflmmgagdbamhnfd';

/**
 * Message types for messsages to/from the extension
 * @const
 * @enum {string}
 */
u2f.MessageTypes = {
  'U2F_REGISTER_REQUEST': 'u2f_register_request',
  'U2F_SIGN_REQUEST': 'u2f_sign_request',
  'U2F_REGISTER_RESPONSE': 'u2f_register_response',
  'U2F_SIGN_RESPONSE': 'u2f_sign_response'
};

/**
 * Response status codes
 * @const
 * @enum {number}
 */
u2f.ErrorCodes = {
  'OK': 0,
  'OTHER_ERROR': 1,
  'BAD_REQUEST': 2,
  'CONFIGURATION_UNSUPPORTED': 3,
  'DEVICE_INELIGIBLE': 4,
  'TIMEOUT': 5
};

/**
 * A message type for registration requests
 * @typedef {{
 *   type: u2f.MessageTypes,
 *   signRequests: Array.<u2f.SignRequest>,
 *   registerRequests: ?Array.<u2f.RegisterRequest>,
 *   timeoutSeconds: ?number,
 *   requestId: ?number
 * }}
 */
u2f.Request;

/**
 * A message for registration responses
 * @typedef {{
 *   type: u2f.MessageTypes,
 *   responseData: (u2f.Error | u2f.RegisterResponse | u2f.SignResponse),
 *   requestId: ?number
 * }}
 */
u2f.Response;

/**
 * An error object for responses
 * @typedef {{
 *   errorCode: u2f.ErrorCodes,
 *   errorMessage: ?string
 * }}
 */
u2f.Error;

/**
 * Data object for a single sign request.
 * @typedef {{
 *   version: string,
 *   challenge: string,
 *   keyHandle: string,
 *   appId: string
 * }}
 */
u2f.SignRequest;

/**
 * Data object for a sign response.
 * @typedef {{
 *   keyHandle: string,
 *   signatureData: string,
 *   clientData: string
 * }}
 */
u2f.SignResponse;

/**
 * Data object for a registration request.
 * @typedef {{
 *   version: string,
 *   challenge: string,
 *   appId: string
 * }}
 */
u2f.RegisterRequest;

/**
 * Data object for a registration response.
 * @typedef {{
 *   registrationData: string,
 *   clientData: string
 * }}
 */
u2f.RegisterResponse;


// Low level MessagePort API support

/**
 * Call MessagePort disconnect
 */
u2f.disconnect = function() {
  if (u2f.port_ && u2f.port_.port_) {
    u2f.port_.port_.disconnect();
    u2f.port_ = null;
  }
};

/**
 * Sets up a MessagePort to the U2F extension using the
 * available mechanisms.
 * @param {function((MessagePort|u2f.WrappedChromeRuntimePort_))} callback
 */
u2f.getMessagePort = function(callback) {
  if (typeof chrome != 'undefined' && chrome.runtime) {
    // The actual message here does not matter, but we need to get a reply
    // for the callback to run. Thus, send an empty signature request
    // in order to get a failure response.
    var msg = {
      type: u2f.MessageTypes.U2F_SIGN_REQUEST,
      signRequests: []
    };
    chrome.runtime.sendMessage(u2f.EXTENSION_ID, msg, function() {
      if (!chrome.runtime.lastError) {
        // We are on a whitelisted origin and can talk directly
        // with the extension.
        u2f.getChromeRuntimePort_(callback);
      } else {
        // chrome.runtime was available, but we couldn't message
        // the extension directly, use iframe
        u2f.getIframePort_(callback);
      }
    });
  } else {
    // chrome.runtime was not available at all, which is normal
    // when this origin doesn't have access to any extensions.
    u2f.getIframePort_(callback);
  }
};

/**
 * Connects directly to the extension via chrome.runtime.connect
 * @param {function(u2f.WrappedChromeRuntimePort_)} callback
 * @private
 */
u2f.getChromeRuntimePort_ = function(callback) {
  var port = chrome.runtime.connect(u2f.EXTENSION_ID,
    {'includeTlsChannelId': true});
  setTimeout(function() {
    callback(null, new u2f.WrappedChromeRuntimePort_(port));
  }, 0);
};

/**
 * A wrapper for chrome.runtime.Port that is compatible with MessagePort.
 * @param {Port} port
 * @constructor
 * @private
 */
u2f.WrappedChromeRuntimePort_ = function(port) {
  this.port_ = port;
};

/**
 * Posts a message on the underlying channel.
 * @param {Object} message
 */
u2f.WrappedChromeRuntimePort_.prototype.postMessage = function(message) {
  this.port_.postMessage(message);
};

/**
 * Emulates the HTML 5 addEventListener interface. Works only for the
 * onmessage event, which is hooked up to the chrome.runtime.Port.onMessage.
 * @param {string} eventName
 * @param {function({data: Object})} handler
 */
u2f.WrappedChromeRuntimePort_.prototype.addEventListener =
    function(eventName, handler) {
  var name = eventName.toLowerCase();
  if (name == 'message' || name == 'onmessage') {
    this.port_.onMessage.addListener(function(message) {
      // Emulate a minimal MessageEvent object
      handler({'data': message});
    });
  } else {
    console.error('WrappedChromeRuntimePort only supports onMessage');
  }
};

/**
 * Sets up an embedded trampoline iframe, sourced from the extension.
 * @param {function(MessagePort)} callback
 * @private
 */
u2f.getIframePort_ = function(callback) {
  // Create the iframe
  var iframeOrigin = 'chrome-extension://' + u2f.EXTENSION_ID;
  var iframe = document.createElement('iframe');
  iframe.src = iframeOrigin + '/u2f-comms.html';
  iframe.setAttribute('style', 'display:none');
  document.body.appendChild(iframe);

  var hasCalledBack = false;

  var channel = new MessageChannel();
  var ready = function(message) {
    if (message.data == 'ready') {
      channel.port1.removeEventListener('message', ready);
      if (!hasCalledBack)
      {
        hasCalledBack = true;
        callback(null, channel.port1);
      }
    } else {
      console.error('First event on iframe port was not "ready"');
    }
  };
  channel.port1.addEventListener('message', ready);
  channel.port1.start();

  iframe.addEventListener('load', function() {
    // Deliver the port to the iframe and initialize
    iframe.contentWindow.postMessage('init', iframeOrigin, [channel.port2]);
  });

  // Give this 200ms to initialize, after that, we treat this method as failed
  setTimeout(function() {
    if (!hasCalledBack)
    {
      hasCalledBack = true;
      callback(new Error("IFrame extension not supported"));
    }
  }, 200);
};


// High-level JS API

/**
 * Default extension response timeout in seconds.
 * @const
 */
u2f.EXTENSION_TIMEOUT_SEC = 30;

/**
 * A singleton instance for a MessagePort to the extension.
 * @type {MessagePort|u2f.WrappedChromeRuntimePort_}
 * @private
 */
u2f.port_ = null;

/**
 * Callbacks waiting for a port
 * @type {Array.<function((MessagePort|u2f.WrappedChromeRuntimePort_))>}
 * @private
 */
u2f.waitingForPort_ = [];

/**
 * A counter for requestIds.
 * @type {number}
 * @private
 */
u2f.reqCounter_ = 0;

/**
 * A map from requestIds to client callbacks
 * @type {Object.<number,(function((u2f.Error|u2f.RegisterResponse))
 *                       |function((u2f.Error|u2f.SignResponse)))>}
 * @private
 */
u2f.callbackMap_ = {};

/**
 * Creates or retrieves the MessagePort singleton to use.
 * @param {function((MessagePort|u2f.WrappedChromeRuntimePort_))} callback
 * @private
 */
u2f.getPortSingleton_ = function(callback) {
  if (u2f.port_) {
    callback(null, u2f.port_);
  } else {
    if (u2f.waitingForPort_.length == 0) {
      u2f.getMessagePort(function(err, port) {
        if (!err) {
          u2f.port_ = port;
          u2f.port_.addEventListener('message',
            /** @type {function(Event)} */ (u2f.responseHandler_));
        }

        // Careful, here be async callbacks. Maybe.
        while (u2f.waitingForPort_.length)
          u2f.waitingForPort_.shift()(err, port);
      });
    }
    u2f.waitingForPort_.push(callback);
  }
};

/**
 * Handles response messages from the extension.
 * @param {MessageEvent.<u2f.Response>} message
 * @private
 */
u2f.responseHandler_ = function(message) {
  var response = message.data;
  var reqId = response['requestId'];
  if (!reqId || !u2f.callbackMap_[reqId]) {
    console.error('Unknown or missing requestId in response.');
    return;
  }
  var cb = u2f.callbackMap_[reqId];
  delete u2f.callbackMap_[reqId];
  cb(null, response['responseData']);
};

/**
 * Calls the callback with true or false as first and only argument
 * @param {Function} callback
 */
u2f.isSupported = function(callback) {
  u2f.getPortSingleton_(function(err, port) {
    callback(!err);
  });
}

/**
 * Dispatches an array of sign requests to available U2F tokens.
 * @param {Array.<u2f.SignRequest>} signRequests
 * @param {function((u2f.Error|u2f.SignResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.sign = function(signRequests, callback, opt_timeoutSeconds) {
  u2f.getPortSingleton_(function(err, port) {
    if (err)
      return callback(err);

    var reqId = ++u2f.reqCounter_;
    u2f.callbackMap_[reqId] = callback;
    var req = {
      type: u2f.MessageTypes.U2F_SIGN_REQUEST,
      signRequests: signRequests,
      timeoutSeconds: (typeof opt_timeoutSeconds !== 'undefined' ?
        opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC),
      requestId: reqId
    };
    port.postMessage(req);
  });
};

/**
 * Dispatches register requests to available U2F tokens. An array of sign
 * requests identifies already registered tokens.
 * @param {Array.<u2f.RegisterRequest>} registerRequests
 * @param {Array.<u2f.SignRequest>} signRequests
 * @param {function((u2f.Error|u2f.RegisterResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.register = function(registerRequests, signRequests,
    callback, opt_timeoutSeconds) {
  u2f.getPortSingleton_(function(err, port) {
    if (err)
      return callback(err);

    var reqId = ++u2f.reqCounter_;
    u2f.callbackMap_[reqId] = callback;
    var req = {
      type: u2f.MessageTypes.U2F_REGISTER_REQUEST,
      signRequests: signRequests,
      registerRequests: registerRequests,
      timeoutSeconds: (typeof opt_timeoutSeconds !== 'undefined' ?
        opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC),
      requestId: reqId
    };
    port.postMessage(req);
  });
};

},{}],358:[function(require,module,exports){
(function (global){
'use strict';

module.exports = API;

var chromeApi = require( './google-u2f-api' );

// Feature detection (yes really)
var isBrowser = ( typeof navigator !== 'undefined' ) && !!navigator.userAgent;
var isSafari = isBrowser && navigator.userAgent.match( /Safari\// )
	&& !navigator.userAgent.match( /Chrome\// );
var isEDGE = isBrowser && navigator.userAgent.match( /Edge\/1[2345]/ );

var _backend = null;
function getBackend( Promise )
{
	if ( !_backend )
		_backend = new Promise( function( resolve, reject )
		{
			function notSupported( )
			{
				// Note; {native: true} means *not* using Google's hack
				resolve( { u2f: null, native: true } );
			}

			if ( !isBrowser )
				return notSupported( );

			if ( isSafari )
				// Safari doesn't support U2F, and the Safari-FIDO-U2F
				// extension lacks full support (Multi-facet apps), so we
				// block it until proper support.
				return notSupported( );

			var hasNativeSupport =
				( typeof window.u2f !== 'undefined' ) &&
				( typeof window.u2f.sign === 'function' );

			if ( hasNativeSupport )
				resolve( { u2f: window.u2f, native: true } );

			if ( isEDGE )
				// We don't want to check for Google's extension hack on EDGE
				// as it'll cause trouble (popups, etc)
				return notSupported( );

			if ( location.protocol === 'http:' )
				// U2F isn't supported over http, only https
				return notSupported( );

			if ( typeof MessageChannel === 'undefined' )
				// Unsupported browser, the chrome hack would throw
				return notSupported( );

			// Test for google extension support
			chromeApi.isSupported( function( ok )
			{
				if ( ok )
					resolve( { u2f: chromeApi, native: false } );
				else
					notSupported( );
			} );
		} );

	return _backend;
}

function API( Promise )
{
	return {
		isSupported   : isSupported.bind( Promise ),
		ensureSupport : ensureSupport.bind( Promise ),
		register      : register.bind( Promise ),
		sign          : sign.bind( Promise ),
		ErrorCodes    : API.ErrorCodes,
		ErrorNames    : API.ErrorNames
	};
}

API.ErrorCodes = {
	CANCELLED: -1,
	OK: 0,
	OTHER_ERROR: 1,
	BAD_REQUEST: 2,
	CONFIGURATION_UNSUPPORTED: 3,
	DEVICE_INELIGIBLE: 4,
	TIMEOUT: 5
};
API.ErrorNames = {
	"-1": "CANCELLED",
	"0": "OK",
	"1": "OTHER_ERROR",
	"2": "BAD_REQUEST",
	"3": "CONFIGURATION_UNSUPPORTED",
	"4": "DEVICE_INELIGIBLE",
	"5": "TIMEOUT"
};

function makeError( msg, err )
{
	var code = err != null ? err.errorCode : 1; // Default to OTHER_ERROR
	var type = API.ErrorNames[ '' + code ];
	var error = new Error( msg );
	error.metaData = {
		type: type,
		code: code
	}
	return error;
}

function deferPromise( Promise, promise )
{
	var ret = { };
	ret.promise = new Promise( function( resolve, reject ) {
		ret.resolve = resolve;
		ret.reject = reject;
		promise.then( resolve, reject );
	} );
	/**
	 * Reject request promise and disconnect port if 'disconnect' flag is true
	 * @param {string} msg
	 * @param {boolean} disconnect
	 */
	ret.promise.cancel = function( msg, disconnect )
	{
		getBackend( Promise )
		.then( function( backend )
		{
			if ( disconnect && !backend.native )
				backend.u2f.disconnect( );

			ret.reject( makeError( msg, { errorCode: -1 } ) );
		} );
	};
	return ret;
}

function defer( Promise, fun )
{
	return deferPromise( Promise, new Promise( function( resolve, reject )
	{
		try
		{
			fun && fun( resolve, reject );
		}
		catch ( err )
		{
			reject( err );
		}
	} ) );
}

function isSupported( )
{
	var Promise = this;

	return getBackend( Promise )
	.then( function( backend )
	{
		return !!backend.u2f;
	} );
}

function _ensureSupport( backend )
{
	if ( !backend.u2f )
	{
		if ( location.protocol === 'http:' )
			throw new Error( "U2F isn't supported over http, only https" );
		throw new Error( "U2F not supported" );
	}
}

function ensureSupport( )
{
	var Promise = this;

	return getBackend( Promise )
	.then( _ensureSupport );
}

function register( registerRequests, signRequests /* = null */, timeout )
{
	var Promise = this;

	if ( !Array.isArray( registerRequests ) )
		registerRequests = [ registerRequests ];

	if ( typeof signRequests === 'number' && typeof timeout === 'undefined' )
	{
		timeout = signRequests;
		signRequests = null;
	}

	if ( !signRequests )
		signRequests = [ ];

	return deferPromise( Promise, getBackend( Promise )
	.then( function( backend )
	{
		_ensureSupport( backend );

		var native = backend.native;
		var u2f = backend.u2f;

		return new Promise( function( resolve, reject )
		{
			function cbNative( response )
			{
				if ( response.errorCode )
					reject( makeError( "Registration failed", response ) );
				else
				{
					delete response.errorCode;
					resolve( response );
				}
			}

			function cbChrome( err, response )
			{
				if ( err )
					reject( err );
				else if ( response.errorCode )
					reject( makeError( "Registration failed", response ) );
				else
					resolve( response );
			}

			if ( native )
			{
				var appId = registerRequests[ 0 ].appId;

				u2f.register(
					appId, registerRequests, signRequests, cbNative, timeout );
			}
			else
			{
				u2f.register(
					registerRequests, signRequests, cbChrome, timeout );
			}
		} );
	} ) ).promise;
}

function sign( signRequests, timeout )
{
	var Promise = this;

	if ( !Array.isArray( signRequests ) )
		signRequests = [ signRequests ];

	return deferPromise( Promise, getBackend( Promise )
	.then( function( backend )
	{
		_ensureSupport( backend );

		var native = backend.native;
		var u2f = backend.u2f;

		return new Promise( function( resolve, reject )
		{
			function cbNative( response )
			{
				if ( response.errorCode )
					reject( makeError( "Sign failed", response ) );
				else
				{
					delete response.errorCode;
					resolve( response );
				}
			}

			function cbChrome( err, response )
			{
				if ( err )
					reject( err );
				else if ( response.errorCode )
					reject( makeError( "Sign failed", response ) );
				else
					resolve( response );
			}

			if ( native )
			{
				var appId = signRequests[ 0 ].appId;
				var challenge = signRequests[ 0 ].challenge;

				u2f.sign( appId, challenge, signRequests, cbNative, timeout );
			}
			else
			{
				u2f.sign( signRequests, cbChrome, timeout );
			}
		} );
	} ) ).promise;
}

function makeDefault( func )
{
	API[ func ] = function( )
	{
		if ( !global.Promise )
			// This is very unlikely to ever happen, since browsers
			// supporting U2F will most likely support Promises.
			throw new Error( "The platform doesn't natively support promises" );

		var args = [ ].slice.call( arguments );
		return API( global.Promise )[ func ].apply( null, args );
	};
}

// Provide default functions using the built-in Promise if available.
makeDefault( 'isSupported' );
makeDefault( 'ensureSupport' );
makeDefault( 'register' );
makeDefault( 'sign' );

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./google-u2f-api":357}],359:[function(require,module,exports){
'use strict';

module.exports = function() {
  throw new Error(
    'ws does not work in the browser. Browser clients must use the native ' +
      'WebSocket object'
  );
};

},{}]},{},[2]);
