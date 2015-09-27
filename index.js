/**
 * Created by sulian on 13-10-30.
 * 主程序入口
 */
var config = require("./config");
var db = require("./db");
var tools = require("./tools");
var logger = require("./logger");
var cookies = require("./cookies");

var cookie;//使用的cookie
var xsrf;//sessionid

var taskStartTime = "00:05:00";//任务将于每天此时间开始
var taskNo = 1;//任务编号

var nextStartTime;//下次执行任务的具体时间

var ng = false, ns = false, nf = false;//是否执行各阶段代码
var isMainTaskRunning = false;//主任务是否运行中
var cookieError = false;//cookie是否出错中（出错时阻止主任务执行）

//主函数
function main() {
    //处理传入参数
    if (process.argv.length > 2) {
        var argv = new Array();
        for (var i = 2; i < process.argv.length; i++) {
            argv.push(process.argv[i].trim().toLowerCase());
        }
        if (argv.indexOf("-i") != -1)//加参数-i则1秒后立即启动，否则按指定时间启动
            nextStartTime = new Date().getTime() + 1000;
        if (argv.indexOf("-ng") != -1)//加参数-n则跳过刷新用户列表的阶段(Get new user)
            ng = true;
        if (argv.indexOf("-ns") != -1)//加参数-s则跳过读取快照的阶段(user Snapshot)
            ns = true;
        if (argv.indexOf("-nf") != -1)//加参数-f则跳过保存文件的阶段(save view File)
            nf = true;
        if (argv.indexOf("-db") != -1)//加参数-db则显示调试代码(DeBug)
            logger.enabledebug();
    }

    if (!nextStartTime) {
        nextStartTime = Date.parse(new Date().toDateString() + " " + taskStartTime);//默认为今天的此时间
        while (new Date().getTime() > nextStartTime) {//如果现在已经超过此时间，则加一天后再比较
            nextStartTime += 24 * 3600 * 1000;
        }
    }
    logger.log("First task will start after " + tools.getDateTimeString(new Date(nextStartTime)));

    maintask();
    setTimeout(checkcookietask, 1000);
}

//主任务
function maintask() {
    //满足以下三种条件之一时继续等待
    //1.当前运行中  2.时间未到  3.cookie出错，不能执行任务
    if (isMainTaskRunning || new Date().getTime() < nextStartTime || cookieError) {
        setTimeout(maintask, 1000);
        return;
    }
    //任务开始
    isMainTaskRunning = true;
    logger.log("Task " + taskNo + " start.");
    logger.log("Get cookie and session id.");
    cookies.getCookie(function (err, c, x) {//获取cookie错误的话，停止任务执行
        if (err || !c || !x) {
            cookieError = true;
            sendwaringmail("Cookie错误导致任务取消.<br/>" + err);
            logger.error("Task " + taskNo + " canceled.");
            db.end();
            isMainTaskRunning = false;
            maintask();
            return;
        }
        cookie = c;
        xsrf = x;
        //按顺序执行任务
        startgetnewuser(function () {
            startusersnapshot(function (err) {
                if (err)
                    logger.error("Get snapshot error:" + err);
                startsaveviewfile(err, function () {
                    logger.log("Task " + taskNo + " finished");
                    //完成后准备下次任务
                    nextStartTime = Date.parse(new Date().toDateString() + " " + taskStartTime) + 24 * 3600 * 1000;//在次日的指定时间执行

                    taskNo++;
                    logger.log("Next task will start after " + tools.getDateTimeString(new Date(nextStartTime)));
                    db.end();
                    isMainTaskRunning = false;
                    maintask();
                });
            });
        });
    });
}

//检查cookie有效性的任务
function checkcookietask() {
    if (!isMainTaskRunning) {
        cookies.getCookie(function (err, c, x) {//获取cookie，如出错则发送邮件通知
            if (err || !c || !x) {
                if (!cookieError) {
                    sendwaringmail(err);//如果是第一次出错则发邮件通知
                    cookieError = true;
                }
                else
                    logger.debug("Cookie still error, please fix it ASAP.");
            }
            else {
                if (cookieError) {
                    //如果已修复则发送邮件并重置状态，下个任务会自动执行
                    sendresumemail();
                    cookieError = false;
                }
                else
                    logger.debug("Check cookie successfully.");
            }
        })
    }
    setTimeout(checkcookietask, 10 * 60000);//每10分钟检查一次，主任务运行时除外
}

//发送cookie警告邮件
function sendwaringmail(msg) {
    tools.sendMail("知乎爬虫cookie错误", tools.getDateTimeString() + "<br/>" + msg, function (err) {
        if (err) logger.error("Send cookie error mail error : " + err);
        else logger.error("Cookie error. Alert mail has sent.");
    });
}

//发送cookie恢复邮件
function sendresumemail() {
    tools.sendMail("知乎爬虫状态已恢复正常", tools.getDateTimeString(), function (err) {
        if (err) logger.error("Send cookie resume mail error : " + err);
        else logger.log("Cookie resumed. Next task will start after " + tools.getDateTimeString(new Date(nextStartTime)));
    });
}

//刷新用户列表
function startgetnewuser(callback) {
    if (ng) {
        logger.log("Get new user task skipped.");
        callback();
    }
    else {
        var getnewuser = require("./getnewuser");
        getnewuser.start(cookie, xsrf, callback);
    }
}

//读取所有用户信息
function startusersnapshot(callback) {
    if (ns) {
        logger.log("User snapshot task skipped.");
        callback();
    }
    else {
        var usersnapshot = require("./usersnapshot");
        usersnapshot.start(cookie, xsrf, callback);
    }
}

//保存结果文件
function startsaveviewfile(err, callback) {
    if (err) {
        logger.error("Save file task cancelled.");//如果快照错误则本次不生成统计结果文件
        callback();
    }
    else if (nf) {
        logger.log("Save file task skipped.");
        callback();
    }
    else {
        var saveviewfile = require("./saveviewfile");
        saveviewfile.start(callback);
    }
}

//运行
main();