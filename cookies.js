/**
 * Created by sulian on 13-11-4.
 * 用于读取、写入或返回可用cookie
 */
var cheerio = require("cheerio");
var tools = require("./tools");
var config = require("./config");
var db = require("./db");
var logger = require("./logger");

var maxretry = 5;//最大重试次数，cookie无效达到此数则发警告邮件
var cookieuser = null;//用于访问的用户信息

//获取一个可用的cookie，附加xsrf（session标记)
exports.getCookie = function (callback) {
    getcookieuser(function (err) {
        if (err) {
            callback(err);
            return;
        }
        if (!cookieuser.cookie) {
            callback("Cookie string is null.");
            return;
        }

        trygetcookie(0, callback);
    })
}

//尝试读取cookie，如果多次失败则报错
function trygetcookie(retry, callback) {
    tools.get(config.urlpre, cookieuser.cookie, function (err, data) {
        if (err) {
            if (retry >= maxretry)
                callback("Get homepage error.<br/>" + err);
            else
                trygetcookie(retry + 1, callback);
            return;
        }

        var $ = cheerio.load(data, {decodeEntities: false});
        var findname = $(".zu-top-nav-userinfo .name").html();//寻找已登录用户名，如果找不到说明cookie失效，登录失败
        if (findname != cookieuser.name) {
            if (retry >= maxretry)
                callback("Invalid cookie.");
            else
                trygetcookie(retry + 1, callback);
            return;
        }

        var xsrf = $("input[name='_xsrf']").val();
        if (!xsrf) {
            if (retry >= maxretry)
                callback("Cannot read xsrf.");
            else
                trygetcookie(retry + 1, callback);
            return
        }

        var fullcookie = cookieuser.cookie + '_xsrf=' + xsrf;//带sessionid的cookie
        callback(null, fullcookie, xsrf);
    })
}

//获取hash
exports.getHash = function () {
    if (cookieuser) return cookieuser.hash;
    else return null;
}

//获取用户名
exports.getName = function () {
    if (cookieuser) return cookieuser.name;
    else return null;
}

//从数据库读取用户信息
function getcookieuser(callback) {
    db.query("select email, password, name, hash, cookie from cookies", function (err, rows) {
        if (err) {
            cookieuser = null;
            callback(err);
        }
        else if (rows.length == 0) {
            cookieuser = null;
            callback("No cookie user in database.");
        }
        else {
            cookieuser = rows[0];
            callback();
        }
    })
}

