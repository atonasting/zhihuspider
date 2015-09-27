/**
 * Created by sulian on 13-11-4.
 * 数据库操作
 */

var mysql = require('mysql');
var config = require('./config');
var pool;//普通查询池

//初始化
exports.init = function () {
    init();
}

function init() {
    pool = mysql.createPool(config.dbconfig);
}

//单句执行
exports.query = function (sql, callback) {
    if (!pool || pool._closed) init();
    pool.getConnection(function (err, conn) {
        if (err) {
            callback(err);
            return;
        }
        conn.query(sql, function (err, rows) {
            if (err) {
                callback(err);
                return;
            }
            conn.release();
            callback(null, rows);
        });
    });
}

//批量执行
exports.mutliquery = function (sqls, callback) {
    if (!pool || pool._closed) init();
    singlequery(sqls, 0, callback);
}

//批量执行中的单次
function singlequery(sqls, cursor, callback) {
    if (cursor >= sqls.length) {
        callback(null);
        return;
    }
    pool.getConnection(function (err, conn) {
        if (err) {
            callback(err, cursor);
            return;
        }
        conn.query(sqls[cursor], function (err) {
            if (err) console.log("SQL query Error: " + sqls[cursor] + "\n" + err)
            conn.release();
            singlequery(sqls, cursor + 1, callback);
        });
    });
}

//批量执行（每个查询返回结果）
exports.mutliquerywithresults = function (sqls, callback) {
    var results = new Array();
    if (!pool || pool._closed) init();
    singlequerywithresults(sqls, 0, results, callback);
}

//批量带结果执行中的单次
function singlequerywithresults(sqls, cursor, results, callback) {
    if (cursor >= sqls.length) {
        callback(null, results);
        return;
    }
    pool.getConnection(function (err, conn) {
        if (err) {
            callback(err, cursor);
            return;
        }
        conn.query(sqls[cursor], function (err, rows) {
            if (err) console.log("SQL query Error: " + sqls[cursor] + "\n" + err);
            results.push(rows);
            conn.release();
            singlequerywithresults(sqls, cursor + 1, results, callback);
        });
    });
}

//防注入转换
exports.escape = mysql.escape;

exports.end = function () {
    pool.end(function (err) {
        if (err)
            console.error("Destory db pool error: " + err);
        else
            console.log("MySQL pool ended successfully.");
    });
}