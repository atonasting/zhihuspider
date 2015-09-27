/**
 * Created by sulian on 13-11-14.
 * 日志类，通过console显示，可以通过forever记录为文本
 */

var tools = require("./tools");
var debug = false;//是否调试状态，调试状态下会显示debug类型的日志

exports.enabledebug = function () {
    debug = true;
}
exports.disabledebug = function () {
    debug = false;
}

exports.log = function (msg) {
    console.log(tools.getDateTimeString() + " " + msg);
}

exports.debug = function (msg) {
    if (debug)
        console.log("DEBUG: " + tools.getDateTimeString() + " " + msg);
}

exports.error = function (msg) {
    console.log("ERROR: " + tools.getDateTimeString() + " " + msg);
}