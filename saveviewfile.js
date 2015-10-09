/**
 * Created by sulian on 13-11-19.
 * 从数据库查询结果保存为快照文件并发布到wordpress
 */
var cheerio = require("cheerio");
var fs = require('fs');
var config = require("./config");
var config_user = require("./config_user");
var db = require("./db");
var tools = require("./tools");
var logger = require("./logger");
var path;//保存路径
var sid, ysid, wsid;//最新、昨天、上周对应的快照id
var stime, ystime, wstime;//最新、昨天、上周快照的结束时间

var deathuserids = config_user.deathuserids;//去世知友id
var hiddenuserids = config_user.hiddenuserids;//不显示的id

//入表用户筛选条件
var filteroptions = {
    answer: 1,
    agree: 500,
    follower: 50
};

exports.start = function (callback) {
    logger.log("Start save view file.");
    path = config.jsonPath;
    if (path.substr(-1, 1) != "/") path += "/";

    getsid(function (err) {
        if (err) {
            logger.error(err);
            callback();
            return;
        }
        //保存数据执行的任务列表
        var tasks = new Array();
        tasks.push({run: checkCheater, name: "check cheaters"});
        tasks.push({run: saveSysInfo, name: "save system info file"});
        tasks.push({run: saveViewFile, name: "save result files for user analysis"});
        //以下三行为发布到wordpress网站的代码，如果在config.js里配置了参数，可以解除注释进行发布
        //tasks.push({run: publishWPYesterday, name: "publish wordpress yesterday post"});
        //tasks.push({run: publishWPRecent, name: "publish wordpress recent post"});
        //tasks.push({run: publishWPArchive, name: "publish wordpress archive post"});

        tools.taskQueue(tasks, function () {
            callback();
        });
    });
}

//获取最近一次和用作对比的快照id
function getsid(callback) {
    sid = 0, ysid = 0, wsid = 0;
    db.query("SELECT tid, endtime FROM snapshots where endtime>0 order by starttime desc limit 0,1", function (err, rows) {
        if (err || rows.length == 0) {
            callback(err || "No snapshots");
            return;
        }
        sid = rows[0].tid;
        stime = rows[0].endtime;
        db.query("SELECT tid, endtime FROM snapshots WHERE endtime>0 and to_days(starttime)<=(select to_days(endtime)-1 from snapshots where tid=" + sid + ") order by starttime desc limit 0,1", function (err, rows) {
            if (err || rows.length == 0) {
                logger.error("Cannot find snapshots of yesterday.");
                return;
            }
            ysid = rows[0].tid;
            ystime = rows[0].endtime;
            db.query("SELECT tid, endtime FROM snapshots WHERE endtime>0 and to_days(starttime)<=(select to_days(endtime)-7 from snapshots where tid=" + sid + ") order by starttime desc limit 0,1", function (err, rows) {
                if (err || rows.length == 0) {
                    logger.error("Cannot find snapshots of last week.");
                    return
                }
                wsid = rows[0].tid;
                wstime = rows[0].endtime;
                callback();
            });
        });
    });
}

//反刷榜
function checkCheater(callback) {
    //反刷榜算法暂时不公开
    callback(null);
}

//提取系统数据，保存到csv文件供展示
function saveSysInfo(callback) {
    var sqls = new Array();
    sqls.push("SELECT starttime, endtime, successcount, failcount, idchangedcount, namechangedcount, avatarchangedcount FROM snapshots where tid='" + sid + "'");
    sqls.push("SELECT successcount, failcount FROM snapshots where tid='" + ysid + "'");
    sqls.push("SELECT successcount, failcount FROM snapshots where tid='" + wsid + "'");
    sqls.push("SELECT sum(answer+post) answer, sum(agree) agree FROM usersnapshots where sid='" + sid + "'");
    sqls.push("SELECT sum(answer+post) answer, sum(agree) agree FROM usersnapshots where sid='" + ysid + "'");
    sqls.push("SELECT sum(answer+post) answer, sum(agree) agree FROM usersnapshots where sid='" + wsid + "'");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + sid + " and agree>=1000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + ysid + " and agree>=1000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + wsid + " and agree>=1000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + sid + " and follower>=1000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + ysid + " and follower>=1000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + wsid + " and follower>=1000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + sid + " and agree>=5000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + ysid + " and agree>=5000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + wsid + " and agree>=5000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + sid + " and follower>=5000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + ysid + " and follower>=5000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + wsid + " and follower>=5000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + sid + " and agree>=10000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + ysid + " and agree>=10000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + wsid + " and agree>=10000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + sid + " and follower>=10000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + ysid + " and follower>=10000");
    sqls.push("SELECT count(*) count FROM usersnapshots where sid=" + wsid + " and follower>=10000");

    db.mutliquerywithresults(sqls, function (err, results) {
        if (err) {
            callback(err);
            return;
        }
        var s = results[0][0];
        var ys = results[1][0];
        var ws = results[2][0];
        var us = results[3][0];
        var yus = results[4][0];
        var wus = results[5][0];

        var strinfo = "属性名,值";
        strinfo += "\r\n最近更新时间," + tools.getDateTimeString(s.endtime);
        strinfo += "\r\n监控用户数量," + (s.successcount + s.failcount);
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (s.successcount + s.failcount - ys.successcount - ys.failcount);
        strinfo += " （" + ((s.successcount + s.failcount - ys.successcount - ys.failcount) / (ys.successcount + ys.failcount) * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (s.successcount + s.failcount - ws.successcount - ws.failcount);
        strinfo += " （" + ((s.successcount + s.failcount - ws.successcount - ws.failcount) / (ws.successcount + ws.failcount) * 100).toFixed(2) + "%）";
        strinfo += "\r\n<b>（以下数据均来自这" + (s.successcount + s.failcount) + "名用户）</b>,";
        strinfo += "\r\n总回答数（包括专栏文章）," + us.answer;
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (us.answer - yus.answer);
        strinfo += " （" + ((us.answer - yus.answer) / yus.answer * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (us.answer - wus.answer);
        strinfo += " （" + ((us.answer - wus.answer) / wus.answer * 100).toFixed(2) + "%）";
        strinfo += "\r\n总赞同数," + us.agree;
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (us.agree - yus.agree);
        strinfo += " （" + ((us.agree - yus.agree) / yus.agree * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (us.agree - wus.agree);
        strinfo += " （" + ((us.agree - wus.agree) / wus.agree * 100).toFixed(2) + "%）";
        strinfo += "\r\n收到超过1000个赞同的人数," + results[6][0].count;
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (results[6][0].count - results[7][0].count);
        strinfo += " （" + ((results[6][0].count - results[7][0].count) / results[7][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (results[6][0].count - results[8][0].count);
        strinfo += " （" + ((results[6][0].count - results[8][0].count) / results[8][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n被超过1000人关注的人数," + results[9][0].count;
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (results[9][0].count - results[10][0].count);
        strinfo += " （" + ((results[9][0].count - results[10][0].count) / results[10][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (results[9][0].count - results[11][0].count);
        strinfo += " （" + ((results[9][0].count - results[11][0].count) / results[11][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n收到超过5000个赞同的人数," + results[12][0].count;
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (results[12][0].count - results[13][0].count);
        strinfo += " （" + ((results[12][0].count - results[13][0].count) / results[13][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (results[12][0].count - results[14][0].count);
        strinfo += " （" + ((results[12][0].count - results[14][0].count) / results[14][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n被超过5000人关注的人数," + results[15][0].count;
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (results[15][0].count - results[16][0].count);
        strinfo += " （" + ((results[15][0].count - results[16][0].count) / results[16][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (results[15][0].count - results[17][0].count);
        strinfo += " （" + ((results[15][0].count - results[17][0].count) / results[17][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n收到超过10000个赞同的人数," + results[18][0].count;
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (results[18][0].count - results[19][0].count);
        strinfo += " （" + ((results[18][0].count - results[19][0].count) / results[19][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (results[18][0].count - results[20][0].count);
        strinfo += " （" + ((results[18][0].count - results[20][0].count) / results[20][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n被超过10000人关注的人数," + results[21][0].count;
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比昨日增加," + (results[21][0].count - results[22][0].count);
        strinfo += " （" + ((results[21][0].count - results[22][0].count) / results[22][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n&nbsp;&nbsp;&nbsp;&nbsp;比7日前增加," + (results[21][0].count - results[23][0].count);
        strinfo += " （" + ((results[21][0].count - results[23][0].count) / results[23][0].count * 100).toFixed(2) + "%）";
        strinfo += "\r\n昨日修改昵称的人数," + (s.namechangedcount);
        strinfo += "\r\n昨日修改个性网址的人数," + (s.idchangedcount);
        strinfo += "\r\n昨日上传新头像的人数," + (s.avatarchangedcount - (s.successcount + s.failcount - ys.successcount - ys.failcount));
        strinfo += "\r\n反刷榜模式,Level 0";
        fs.writeFileSync(path + "sysinfo.csv", strinfo, "utf-8");
        callback();
    })
}

//保存包含对比参数的结果
function saveViewFile(callback) {
    //排名种类
    var resulttypes = ["ask", "answer", "post", "agree", "ratio", "agreei", "agreeiratio", "agreeiw", "agreeiratiow",
        "follower", "followee", "followeri", "followiratio", "followeriw", "followiratiow", "thanks", "tratio",
        "fav", "fratio", "logs", "mostvote", "mostvotepercent", "mostvote5", "mostvote5percent", "mostvote10", "mostvote10percent",
        "count10000", "count5000", "count2000", "count1000", "count500", "count200", "count100"];
    var sqls = new Array();
    //只有在各种比率的排序时才会过滤掉赞同、回答过低用户
    var filtersql = " and s.answer>=" + filteroptions.answer + " and s.agree>=" + filteroptions.agree + " and s.follower>=" + filteroptions.follower;

    for (var i in resulttypes) {
        var sql = "SELECT u.tid uid, u.id, u.name, s.ask, s.answer, s.post, s.agree, ROUND( s.agree / ( s.answer + s.post ), 2 ) ratio, s.follower, s.followee, " +
            "s.agree-ys.agree agreei,  CONCAT( ROUND( (s.agree-ys.agree) / ys.agree * 100, 2 ), '%') agreeiratio, " +
            "s.agree-ws.agree agreeiw,  CONCAT( ROUND( (s.agree-ws.agree) / ws.agree * 100, 2 ), '%') agreeiratiow, " +
            "s.follower-ys.follower followeri, CONCAT( ROUND( (s.follower-ys.follower) / ys.follower * 100, 2 ), '%') followiratio, " +
            "s.follower-ws.follower followeriw, CONCAT( ROUND( (s.follower-ws.follower) / ws.follower * 100, 2 ), '%') followiratiow, " +
            "s.thanks, ROUND( s.thanks / s.agree , 4 ) tratio, s.fav, ROUND( s.fav / s.agree , 4 ) fratio, s.logs, " +
            "s.mostvote, CONCAT( ROUND( s.mostvote / s.agree * 100, 2 ) ,  '%' ) mostvotepercent, " +
            "s.mostvote5, CONCAT( ROUND( s.mostvote5 / s.agree *100, 2 ) ,  '%' ) mostvote5percent, " +
            "s.mostvote10, CONCAT( ROUND( s.mostvote10 / s.agree *100, 2 ) ,  '%' ) mostvote10percent, " +
            "s.count10000, s.count5000, s.count2000, s.count1000, s.count500, s.count200, s.count100 " +
            "FROM users u INNER JOIN usersnapshots s ON s.uid = u.tid INNER JOIN usersnapshots ys ON ys.uid = u.tid INNER JOIN usersnapshots ws ON ws.uid = u.tid " +
            "WHERE s.sid='" + sid + "' and ys.sid='" + ysid + "' and ws.sid='" + wsid + "'";
        if (hiddenuserids.length > 0) {//隐藏指定id
            sql += " and u.tid not in (" + hiddenuserids.join(",") + ")";
        }
        if (resulttypes[i] == "mostvotepercent")
            sql += filtersql + " and s.answer + s.post >= 1 and s.mostvote > 0 and s.agree > 0 ORDER BY s.agree / s.mostvote";//三个高票占比列要从低到高排列
        else if (resulttypes[i] == "mostvote5percent")
            sql += filtersql + " and s.answer + s.post >= 5 and s.mostvote5 > 0 and s.agree > 0 ORDER BY s.agree / s.mostvote5";
        else if (resulttypes[i] == "mostvote10percent")
            sql += filtersql + " and s.answer + s.post >= 10 and s.mostvote10 > 0 and s.agree > 0 ORDER BY s.agree / s.mostvote10";
        else if (resulttypes[i] == "agreei")
            sql += filtersql + " and u.cheat = 0 ORDER BY agreei";//四个增长列要反作弊
        else if (resulttypes[i] == "agreeiw")
            sql += filtersql + " and u.cheat = 0 ORDER BY agreeiw";
        else if (resulttypes[i] == "agreeiratio")
            sql += filtersql + " and u.cheat = 0 ORDER BY (s.agree-ys.agree) / ys.agree";
        else if (resulttypes[i] == "agreeiratiow")
            sql += filtersql + " and u.cheat = 0 ORDER BY (s.agree-ws.agree) / ws.agree"
        else if (resulttypes[i] == "followeri")
            sql += filtersql + " and ys.follower > 0 ORDER BY followeri";
        else if (resulttypes[i] == "followeriw")
            sql += filtersql + " and ws.follower > 0 ORDER BY followeriw";
        else if (resulttypes[i] == "followiratio")
            sql += filtersql + " ORDER BY (s.follower-ys.follower) / ys.follower";
        else if (resulttypes[i] == "followiratiow")
            sql += filtersql + " ORDER BY (s.follower-ws.follower) / ws.follower";
        else if (resulttypes[i] == "ratio" || resulttypes[i] == "tratio" || resulttypes[i] == "fratio")
            sql += filtersql + " ORDER BY " + resulttypes[i];
        else if (resulttypes[i] == "count10000" || resulttypes[i] == "count5000" || resulttypes[i] == "count2000" || resulttypes[i] == "count1000"
            || resulttypes[i] == "count500" || resulttypes[i] == "count200" || resulttypes[i] == "count100")
            sql += filtersql + " ORDER BY " + resulttypes[i] + " DESC, agree";//防止数字重复，后面再按赞同数排个序
        else
            sql += " ORDER BY " + resulttypes[i];//其他列
        sql += " DESC LIMIT 0,500";
        sqls.push(sql);
    }
    db.mutliquerywithresults(sqls, function (err, results) {
        if (err) {
            callback(err);
            return;
        }
        try {
            for (var i in results) {
                //为去世id加@标记
                if (deathuserids.length > 0) {
                    for (var j in results[i]) {
                        if (deathuserids.indexOf(results[i][j].uid) != -1) results[i][j].name = "@" + results[i][j].name;
                    }
                }

                var jsonobj = new Object();
                jsonobj.total = results[i].length;
                jsonobj.rows = results[i];
                fs.writeFileSync(path + "topuser_" + resulttypes[i] + ".json", JSON.stringify(jsonobj), "utf-8");
                jsonobj = null;
            }
            callback();
        }
        catch (err) {
            logger.error(err);
            callback(err);
        }
    })
}

//发布昨日热门（发布日期为昨天、按赞同数排名的答案，人数为32人）
function publishWPYesterday(callback) {
    //取得昨天的热门新答案
    var sql = "SELECT u.tid, u.id uid, u.name uname, u.hash, u.avatar, s.agree uagree, s.follower ufollower, a.title, a.link, a.date, a.agree, a.ispost, a.len, a.imgcount, a.summary" +
        " FROM usertopanswers a inner join users u on a.uid=u.tid " +
        " inner join usersnapshots s on s.uid=u.tid and a.sid=s.sid" +
        " where a.date<'" + tools.getDateString(stime) + "' and a.date>='" + tools.getDateString(ystime) + "' and ispost=0 and collapsed=0 and noshare=0" +
        " and link not in (select answerlink from wpdetail)" +
        " and len + imgcount > 0" +
        " and s.sid=(select max(tid) from snapshots where endtime>0)";
    if (hiddenuserids.length > 0) {//隐藏指定id
        sql += " and u.tid not in (" + hiddenuserids.join(",") + ")";
    }
    sql += " order by a.agree desc";//取当日所有答案，最后只保留32个用户的答案
    db.query(sql, function (err, rows) {
        if (err) {
            callback("get answers error: " + err);
            return;
        }
        var answers = new Array();//答案数组
        var avatars = new Array();//头像数组，取前32个用户

        for (var i in rows) {
            var exist = false;//用户是否已存在
            for (var j in answers)
                if (answers[j].uid == rows[i].uid) {
                    exist = true;
                    break;
                }
            answers.push(rows[i]);
            if (!exist) avatars.push(rows[i].avatar);//避免头像重复
            if (avatars.length >= 32) break;//超过32个用户就停止
        }

        //按高票答案占总赞同的比例排序，让新锐排前，老人排后
        answers.sort(function (a, b) {
            return (b.agree / b.uagree) - (a.agree / a.uagree);
        });

        //把答案按标题分组
        var questions = new Array();
        for (var i in answers) {
            var findquestion = null;
            for (var j in questions)
                if (answers[i].title == questions[j].title) {
                    findquestion = questions[j];
                    break;
                }

            if (findquestion) {//问题已添加则直接添加答案
                findquestion.answers.push(answers[i]);
            }
            else {//否则添加问题对象
                var q = new Object();
                q.title = answers[i].title;
                q.ispost = answers[i].ispost;
                q.answers = new Array();
                q.answers.push(answers[i]);
                if (!answers[i].ispost) {//取答案链接的前半段作为问题链接
                    var linkarray = answers[i].link.split("/");
                    q.link = "/" + linkarray[1] + "/" + linkarray[2];
                }
                else
                    q.link = answers[i].link;
                questions.push(q);
            }
        }

        var publishdata = new Object();
        //发布时间：数据生成日凌晨5点
        var publishtime = new Date(stime);
        publishtime.setHours(5);
        publishtime.setMinutes(0);
        publishtime.setSeconds(0);
        publishdata.publishtime = publishtime;
        //生成要发布的内容
        publishdata.title = tools.getCNDateString(publishtime) + " 昨日最新";
        publishdata.link = "yesterday-" + tools.getDateString(publishtime);
        publishdata.category = "昨日最新";
        var content = "<ul>";
        var excerpt = "摘录了";
        for (var i in questions) {
            var q = questions[i];
            var qlink;
            if (!q.ispost) {
                qlink = config.urlpre.replace(/\/$/, '');
                if (q.answers.length > 1) qlink += q.link;//如果多于一个答案，就使用问题链接，否则使用唯一答案链接
                else qlink += q.answers[0].link;
            }
            else qlink = config.urlzhuanlanpre.replace(/\/$/, '') + q.link;

            content += '<li><h3><a href="' + qlink + '" target="_blank" style="font-weight: bold;">' + q.title + '</a></h3>';

            for (var j in q.answers) {
                var a = q.answers[j];
                var alink;
                if (!a.ispost) alink = config.urlpre.replace(/\/$/, '') + a.link;
                else alink = config.urlzhuanlanpre.replace(/\/$/, '') + a.link;

                if (a.avatar.indexOf("https://") == 0)  a.avatar = a.avatar.replace("https://", config.WPurlavatarpre);
                else a.avatar = a.avatar.replace("http://", config.WPurlavatarpre);

                content += '<a href="' + config.urlpre + 'people/' + a.uid + '/" target="_blank">' +
                    '<img class="alignleft avatar" src="' + a.avatar + '" alt="" /></a>' +
                    '<span class="summary"><a href="' + config.urlpre + 'people/' + a.uid + '/" target="_blank">' +
                    a.uname + '</a>: ' + '<span class="agreetext">(' + a.agree +
                    '<img class="agreelogo" src="/zhihufile/agree.png" />)</span>' +
                    ((a.len == 0 && a.imgcount > 0) ? '[图片]' : a.summary) +
                    '<span class="readmore"><a href="' + alink + '" target="_blank">[阅读全文]</a></span></span></li>' +
                    '<div class="cleardiv"></div>\r\n';
            }
            content += '</li>\r\n\r\n\r\n';
            if (excerpt.length < 200) excerpt += "『" + q.title + "』、";//记录摘要
        }
        content += "</ul>";
        excerpt = excerpt.replace(/、$/, '') + "等问题下的" + answers.length + "个答案";
        publishdata.content = content;
        publishdata.excerpt = excerpt;

        //拼接头像
        tools.spliceAvatars(avatars, 8, 4, true, false, false, function (err, buffer) {
            if (err) {
                callback("splice avatar error: " + err);
                return;
            }
            //上传拼接好的头像
            tools.WPnewMedia("yesterday-" + tools.getDateString(stime) + ".jpg", buffer, function (err, mediaid, mediaurl) {
                if (err) {
                    callback("upload media error: " + err);
                    return;
                }
                publishdata.mediaid = mediaid;
                //发布新日志
                tools.WPnewPost(publishdata, function (err, postid) {
                    if (err) {
                        callback("new post error: " + err);
                        return;
                    }
                    recordWPPostInfo(postid, answers, "yesterday", mediaurl, publishdata.excerpt, function (err) {
                        if (err) callback("record post info error: " + err);
                        else callback();
                    });
                });
            });
        });
    });
}

//发布近日热门（发布日期为近7天、按赞同数排名且从未出现在其它类别里的答案，32人）
function publishWPRecent(callback) {
    //取得近7天的热门新答案
    var sql = "SELECT u.tid, u.id uid, u.name uname, u.hash, u.avatar, s.agree uagree, s.follower ufollower, a.title, a.link, a.date, a.agree, a.ispost, a.len, a.imgcount, a.summary" +
        " FROM usertopanswers a inner join users u on a.uid=u.tid " +
        " inner join usersnapshots s on s.uid=u.tid" +
        " where a.date<'" + tools.getDateString(stime) + "' and a.date>='" + tools.getDateString(wstime) + "' and ispost=0 and collapsed=0 and noshare=0" +
        " and a.link not in (select answerlink from wpdetail)" +
        " and len + imgcount > 0" +
        " and s.sid=(select max(tid) from snapshots where endtime>0)";
    if (hiddenuserids.length > 0) {//隐藏指定id
        sql += " and u.tid not in (" + hiddenuserids.join(",") + ")";
    }
    sql += " order by a.agree desc"//取当日所有答案，最后只保留32个用户的答案
    db.query(sql, function (err, rows) {
        if (err) {
            callback("get answers error: " + err);
            return;
        }
        var answers = new Array();//答案数组
        var avatars = new Array();//头像数组，取前32个用户

        for (var i in rows) {
            var exist = false;//用户是否已存在
            for (var j in answers)
                if (answers[j].uid == rows[i].uid) {
                    exist = true;
                    break;
                }
            answers.push(rows[i]);
            if (!exist) avatars.push(rows[i].avatar);//避免头像重复
            if (avatars.length >= 32) break;//超过32个用户就停止
        }

        //按高票答案占总赞同的比例排序，让新锐排前，老人排后
        answers.sort(function (a, b) {
            return (b.agree / b.uagree) - (a.agree / a.uagree);
        });

        //把答案按标题分组
        var questions = new Array();
        for (var i in answers) {
            var findquestion = null;
            for (var j in questions)
                if (answers[i].title == questions[j].title) {
                    findquestion = questions[j];
                    break;
                }

            if (findquestion) {//问题已添加则直接添加答案
                findquestion.answers.push(answers[i]);
            }
            else {//否则添加问题对象
                var q = new Object();
                q.title = answers[i].title;
                q.ispost = answers[i].ispost;
                q.answers = new Array();
                q.answers.push(answers[i]);
                if (!answers[i].ispost) {//取答案链接的前半段作为问题链接
                    var linkarray = answers[i].link.split("/");
                    q.link = "/" + linkarray[1] + "/" + linkarray[2];
                }
                else
                    q.link = answers[i].link;
                questions.push(q);
            }
        }

        var publishdata = new Object();
        ;
        //发布时间：数据生成日中午11点
        var publishtime = new Date(stime);
        publishtime.setHours(11);
        publishtime.setMinutes(0);
        publishtime.setSeconds(0);
        publishdata.publishtime = publishtime;
        //生成要发布的内容
        publishdata.title = tools.getCNDateString(publishtime) + " 近日热门";
        publishdata.link = "recent-" + tools.getDateString(publishtime);
        publishdata.category = "近日热门";
        var content = "<ul>";
        var excerpt = "摘录了";
        for (var i in questions) {
            var q = questions[i];
            var qlink;
            if (!q.ispost) {
                qlink = config.urlpre.replace(/\/$/, '');
                if (q.answers.length > 1) qlink += q.link;//如果多于一个答案，就使用问题链接，否则使用唯一答案链接
                else qlink += q.answers[0].link;
            }
            else qlink = config.urlzhuanlanpre.replace(/\/$/, '') + q.link;

            content += '<li><h3><a href="' + qlink + '" target="_blank" style="font-weight: bold;">' + q.title + '</a></h3>';

            for (var j in q.answers) {
                var a = q.answers[j];
                var alink;
                if (!a.ispost) alink = config.urlpre.replace(/\/$/, '') + a.link;
                else alink = config.urlzhuanlanpre.replace(/\/$/, '') + a.link;

                if (a.avatar.indexOf("https://") == 0)  a.avatar = a.avatar.replace("https://", config.WPurlavatarpre);
                else a.avatar = a.avatar.replace("http://", config.WPurlavatarpre);

                content += '<a href="' + config.urlpre + 'people/' + a.uid + '/" target="_blank">' +
                    '<img class="alignleft avatar" src="' + a.avatar + '" alt="" /></a>' +
                    '<span class="summary"><a href="' + config.urlpre + 'people/' + a.uid + '/" target="_blank">' +
                    a.uname + '</a>: ' + '<span class="agreetext">(' + a.agree +
                    '<img class="agreelogo" src="/zhihufile/agree.png" />)</span>' +
                    ((a.len == 0 && a.imgcount > 0) ? '[图片]' : a.summary) +
                    '<span class="readmore"><a href="' + alink + '" target="_blank">[阅读全文]</a></span></span></li>' +
                    '<div class="cleardiv"></div>\r\n';
            }
            content += '</li>\r\n\r\n\r\n';
            if (excerpt.length < 200) excerpt += "『" + q.title + "』、";//记录摘要
        }
        content += "</ul>";
        excerpt = excerpt.replace(/、$/, '') + "等问题下的" + answers.length + "个答案";
        publishdata.content = content;
        publishdata.excerpt = excerpt;

        //拼接头像
        tools.spliceAvatars(avatars, 8, 4, true, false, false, function (err, buffer) {
            if (err) {
                callback("splice avatar error: " + err);
                return;
            }
            //上传拼接好的头像
            tools.WPnewMedia("recent-" + tools.getDateString(stime) + ".jpg", buffer, function (err, mediaid, mediaurl) {
                if (err) {
                    callback("upload media error: " + err);
                    return;
                }
                publishdata.mediaid = mediaid;
                //发布新日志
                tools.WPnewPost(publishdata, function (err, postid) {
                    if (err) {
                        callback("new post error: " + err);
                        return;
                    }
                    recordWPPostInfo(postid, answers, "recent", mediaurl, publishdata.excerpt, function (err) {
                        if (err) callback("record post info error: " + err);
                        else callback();
                    });
                });
            });
        });
    });
}

//发布历史精华（发布日期为7天之前，随机选择的高票答案）
function publishWPArchive(callback) {
    var archivetime = new Date(stime.getTime());
    archivetime.setDate(stime.getDate() - 180);

    //近7天~180天的热门答案
    var sql1 = "SELECT u.tid, u.id uid, u.name uname, u.hash, u.avatar, s.agree uagree, s.follower ufollower, a.title, a.link, a.date, a.agree, a.ispost, a.len, a.imgcount, a.summary" +
        " FROM usertopanswers a inner join users u on a.uid=u.tid " +
        " inner join usersnapshots s on s.uid=u.tid" +
        " where a.date<'" + tools.getDateString(wstime) + "' and a.date>='" + tools.getDateString(archivetime) + "' and ispost=0 and collapsed=0 and noshare=0" +
        " and a.link not in (select answerlink from wpdetail)" +
        " and len + imgcount > 0" +
        " and s.sid=(select max(tid) from snapshots where endtime>0)";
    if (hiddenuserids.length > 0) {//隐藏指定id
        sql1 += " and u.tid not in (" + hiddenuserids.join(",") + ")"
    }
    sql1 += " order by a.agree desc limit 0,400";//取400个赞同最高且未发表过的答案用于筛选

    //180天前的热门答案
    var sql2 = "SELECT u.tid, u.id uid, u.name uname, u.hash, u.avatar, s.agree uagree, s.follower ufollower, a.title, a.link, a.date, a.agree, a.ispost, a.len, a.imgcount, a.summary" +
        " FROM usertopanswers a inner join users u on a.uid=u.tid " +
        " inner join usersnapshots s on s.uid=u.tid" +
        " where a.date<'" + tools.getDateString(archivetime) + "' and ispost=0 and collapsed=0 and noshare=0" +
        " and a.link not in (select answerlink from wpdetail)" +
        " and len + imgcount > 0" +
        " and s.sid=(select max(tid) from snapshots where endtime>0)";
    if (hiddenuserids.length > 0) {//隐藏指定id
        sql2 += " and u.tid not in (" + hiddenuserids.join(",") + ")";
    }
    sql2 += " order by a.agree desc limit 0,4000";//取4000个赞同最高且未发表过的答案用于筛选

    var sqls = new Array();
    sqls.push(sql1);
    sqls.push(sql2);
    db.mutliquerywithresults(sqls, function (err, results) {
            if (err) {
                callback("get answers error: " + err);
                return;
            }
            var answers1 = results[0];//7~90天
            var answers2 = results[1];//90天前

            //随机排序
            answers1.sort(function () {
                return Math.random() - 0.5;
            });
            answers2.sort(function () {
                return Math.random() - 0.5;
            });

            var answers = new Array();//答案数组
            var avatars = new Array();//头像数组，取前32个用户

            for (var i in answers1) {
                var exist = false;//用户是否已存在
                for (var j in answers)
                    if (answers[j].uid == answers1[i].uid) {
                        exist = true;
                        break;
                    }
                answers.push(answers1[i]);
                if (!exist) avatars.push(answers1[i].avatar);//避免头像重复
                if (avatars.length >= 16) break;//只取16个用户
            }
            for (var i in answers2) {
                var exist = false;//用户是否已存在
                for (var j in answers)
                    if (answers[j].uid == answers2[i].uid) {
                        exist = true;
                        break;
                    }
                answers.push(answers2[i]);
                if (!exist) avatars.push(answers2[i].avatar);//避免头像重复
                if (avatars.length >= 32) break;//再取16个用户，一共32个
            }

            //按高票答案占总赞同的比例排序
            answers.sort(function (a, b) {
                return (b.agree / b.uagree) - (a.agree / a.uagree);
            });

            //把答案按标题分组
            var questions = new Array();
            for (var i in answers) {
                var findquestion = null;
                for (var j in questions)
                    if (answers[i].title == questions[j].title) {
                        findquestion = questions[j];
                        break;
                    }

                if (findquestion) {//问题已添加则直接添加答案
                    findquestion.answers.push(answers[i]);
                }
                else {//否则添加问题对象
                    var q = new Object();
                    q.title = answers[i].title;
                    q.ispost = answers[i].ispost;
                    q.answers = new Array();
                    q.answers.push(answers[i]);
                    if (!answers[i].ispost) {//取答案链接的前半段作为问题链接
                        var linkarray = answers[i].link.split("/");
                        q.link = "/" + linkarray[1] + "/" + linkarray[2];
                    }
                    else
                        q.link = answers[i].link;
                    questions.push(q);
                }
            }

            var publishdata = new Object();
            //发布时间：数据生成日中午11点
            var publishtime = new Date(stime);
            publishtime.setHours(17);
            publishtime.setMinutes(0);
            publishtime.setSeconds(0);
            publishdata.publishtime = publishtime;
            //生成要发布的内容
            publishdata.title = tools.getCNDateString(publishtime) + " 历史精华";
            publishdata.link = "archive-" + tools.getDateString(publishtime);
            publishdata.category = "历史精华";
            var content = "<ul>";
            var excerpt = "摘录了";
            for (var i in questions) {
                var q = questions[i];
                var qlink;
                if (!q.ispost) {
                    qlink = config.urlpre.replace(/\/$/, '');
                    if (q.answers.length != 1) qlink += q.link;//如果多于一个答案，就使用问题链接，否则使用唯一答案链接
                    else qlink += q.answers[0].link;
                }
                else qlink = config.urlzhuanlanpre.replace(/\/$/, '') + q.link;

                content += '<li><h3><a href="' + qlink + '" target="_blank" style="font-weight: bold;">' + q.title + '</a></h3>';

                for (var j in q.answers) {
                    var a = q.answers[j];
                    var alink;
                    if (!a.ispost) alink = config.urlpre.replace(/\/$/, '') + a.link;
                    else alink = config.urlzhuanlanpre.replace(/\/$/, '') + a.link;

                    if (a.avatar.indexOf("https://") == 0)  a.avatar = a.avatar.replace("https://", config.WPurlavatarpre);
                    else a.avatar = a.avatar.replace("http://", config.WPurlavatarpre);

                    content += '<a href="' + config.urlpre + 'people/' + a.uid + '/" target="_blank">' +
                        '<img class="alignleft avatar" src="' + a.avatar + '" alt="" /></a>' +
                        '<span class="summary"><a href="' + config.urlpre + 'people/' + a.uid + '/" target="_blank">' +
                        a.uname + '</a>: ' + '<span class="agreetext">(' + a.agree +
                        '<img class="agreelogo" src="/zhihufile/agree.png" />)</span>' +
                        ((a.len == 0 && a.imgcount > 0) ? '[图片]' : a.summary) +
                        '<span class="readmore"><a href="' + alink + '" target="_blank">[阅读全文]</a></span></span></li>' +
                        '<div class="cleardiv"></div>\r\n';
                }
                content += '</li>\r\n\r\n\r\n';
                if (excerpt.length < 200) excerpt += "『" + q.title + "』、";//记录摘要
            }
            content += "</ul>";
            excerpt = excerpt.replace(/、$/, '') + "等问题下的" + answers.length + "个答案";
            publishdata.content = content;
            publishdata.excerpt = excerpt;

            //拼接头像
            tools.spliceAvatars(avatars, 8, 4, true, false, false, function (err, buffer) {
                if (err) {
                    callback("splice avatar error: " + err);
                    return;
                }
                //上传拼接好的头像
                tools.WPnewMedia("archive-" + tools.getDateString(stime) + ".jpg", buffer, function (err, mediaid, mediaurl) {
                    if (err) {
                        callback("upload media error: " + err);
                        return;
                    }
                    publishdata.mediaid = mediaid;
                    //发布新日志
                    tools.WPnewPost(publishdata, function (err, postid) {
                        if (err) {
                            callback("new post error: " + err);
                            return;
                        }
                        recordWPPostInfo(postid, answers, "archive", mediaurl, publishdata.excerpt, function (err) {
                            if (err) callback("record post info error: " + err);
                            else callback();
                        })
                    })
                })
            })
        }
    )
}


//发布wordpress文章后记录信息
function recordWPPostInfo(postid, answers, type, mediaurl, excerpt, callback) {
    var sqls = new Array();
    //保存发布数据与明细
    sqls.push("INSERT INTO wpposts (date, publishtime, type, postid, pic, excerpt)" +
        " VALUES ('" + tools.getDateString(stime) + "','" + tools.getDateTimeString() + "','" +
        type + "'," + postid + ",'" + mediaurl + "'," + db.escape(excerpt) + ")");

    for (var i in answers) {
        var a = answers[i];
        sqls.push("INSERT INTO wpdetail (pid, uid, answerlink)" +
            " VALUES ((select max(tid) from wpposts)," + a.tid + ",'" + a.link + "')");
    }
    db.mutliquery(sqls, function (err) {
        if (err) {
            callback(err);
            return;
        }
        callback();
    })
}