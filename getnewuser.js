/**
 * Created by sulian on 13-11-12.
 * 从最近两次快照信息中读取昨日关注别人数量较多的用户，刷新他们的关注榜以查找值得关注的用户，以完善用户资料库
 */
var cheerio = require("cheerio");
var config = require("./config");
var tools = require("./tools");
var logger = require("./logger");
var db = require("./db");

var cookie;//使用的cookie
var xsrf;//sessionid

var newfolloweeusercount = 500;//刷新关注列表时，昨天新增关注最多的用户数量
var users;//值得关注的用户总列表
var userhashs;//值得关注的用户hash数组(检查重复项用)

//入库新用户筛选条件
var userfilteroptions = {
    answer: 1,
    agree: 100,
    follower: 20,
    ratio: 0
};
//连续抓取的间隔
var delay = 100;

//开始抓取
exports.start = function (c, x, callback) {
    cookie = c;
    xsrf = x;
    users = new Array();
    userhashs = new Array();
    //先抓作为刷新源的用户
    getFolloweeSourceUsers(function (searchusers) {
        if (!searchusers) {
            logger.error("Refresh new users failed.");
            callback();
            return;
        }
        logger.log("Start getting users from " + newfolloweeusercount + " user's followees.");
        //然后逐个抓取子用户
        getMultiFollowees(searchusers, 0, function () {
            logger.log("Get " + users.length + " new users.");
            //抓取完成后进行对比
            saveUsers(function (err, newcount) {
                if (err) logger.error("Save top users failed.");
                else logger.log(newcount + " new users added.");
                callback();
            });
        });
    });
}

//获取新增关注人数排名前列的用户作为刷新源
function getFolloweeSourceUsers(callback) {
    //找到最新的、已完成的快照id
    db.query("SELECT tid FROM snapshots where endtime>0 order by starttime desc limit 0,2", function (err, rows) {
        if (err || rows.length < 2) {
            logger.error(err || "At least 2 snapshots for this task.");
            callback(null);
            return;
        }
        var sid = rows[0].tid;//最近一次快照id
        var sid2 = rows[1].tid;///第二近的快照id
        //查找关注数增加最多的用户
        db.query("SELECT u.id, u.hash, us1.followee f1, us2.followee f2, us1.followee-us2.followee fi FROM users u" +
            " inner join usersnapshots us1 on u.tid=us1.uid inner join usersnapshots us2 on u.tid=us2.uid" +
            " where us1.sid=" + sid + " and us2.sid=" + sid2 +
            " order by us1.followee-us2.followee desc limit 0," + newfolloweeusercount,
            function (err, rows) {
                if (err || rows.length == 0) {
                    logger.error(err || "Cannot find top increasing followee users");
                    callback(null);
                    return;
                }
                var searchusers = new Array();
                for (var i in rows) {
                    var u = new Object();
                    u.id = rows[i].id;
                    u.hash = rows[i].hash;
                    u.increase = rows[i].fi;//用本次增长数进行限制
                    searchusers.push(u);
                }
                callback(searchusers);
            });
    });
}

//递归抓取关注者
function getMultiFollowees(searchusers, cursor, callback) {
    if (cursor >= searchusers.length) {
        userhashs = null;
        callback();
        return;
    }
    getFollowees(searchusers[cursor], function (err, followees) {
        if (err) {
            logger.error(err);
            getMultiFollowees(searchusers, cursor + 1, callback);//出错也继续读下一个用户
            return;
        }
        //逐个检查本次读取的用户是否已存在，不存在则添加，存在则覆盖id和name，以后来者为准
        for (var i in followees) {
            var index = userhashs.indexOf(followees[i].hash);
            if (index == -1) {
                userhashs.push(followees[i].hash);
                users.push(followees[i]);
            }
            else {
                users[index].id = followees[i].id;
                users[index].name = followees[i].name;
            }
        }
        followees = null;
        setTimeout(function () {
            getMultiFollowees(searchusers, cursor + 1, callback);
        }, delay);
    });
}

//获取单个用户关注的人
function getFollowees(user, callback) {
    var request = 'method=next&params={"hash_id":"' + user.hash + '","order_by":"created","offset":{0}}&_xsrf=' + xsrf;
    logger.debug("Start getting " + user.id + "'s " + user.increase + " follwees");
    getNextFollowees(cookie, user.increase, 0, request, new Array(), function (err, followees) {
        if (err) {
            callback(err);
            return;
        }
        logger.debug("Totally get " + followees.length + " follwees of " + user.id);
        callback(null, followees);
    });
}

//递归逐步读取所有下级，数量不超过此用户昨日关注更新量
function getNextFollowees(cookie, limit, offset, request, followees, callback) {
    //如果读取数量已经超过限制的个数，则返回结果，不继续读取
    if (offset >= limit) {
        callback(null, followees);
        return;
    }
    var requestbody = request.replace("{0}", offset);//消息体
    tools.post(config.urlpre + "node/ProfileFolloweesListV2", cookie, requestbody,
        function (err, data) {
            if (err) {
                logger.error("Get followee error on " + offset + ":" + err);
                setTimeout(function () {
                    getNextFollowees(cookie, limit, offset + 20, request, followees, callback);
                }, delay);//出错也继续
                return;
            }
            try {
                var l = JSON.parse(data).msg;
                if (l.length > 0) {
                    $ = cheerio.load(l.join(), {decodeEntities: false});
                    var cards = $(".zm-profile-card");
                    readUserInfos($, userfilteroptions, cards, function (newusers) {
                        followees = followees.concat(newusers);
                        //继续下一页
                        setTimeout(function () {
                            getNextFollowees(cookie, limit, offset + 20, request, followees, callback);
                        }, delay);
                    });
                }
                else
                    callback(null, followees);//如果读不到，说明已经读完，返回结果
            }
            catch (err) {//如果解析json出错则继续下一个
                logger.error("Parse followee json error on " + offset + ":" + err);
                setTimeout(function () {
                    getNextFollowees(cookie, limit, offset + 20, request, followees, callback);
                }, delay);
            }
        }
    )
}

//解析HTML读取用户信息
function readUserInfos($, options, cards, callback) {
    var users = new Array();
    var answerlimit = options.answer ? options.answer : 0;
    var agreelimit = options.agree ? options.agree : 0;
    var followerlimit = options.follower ? options.follower : 0;
    var ratiolimit = options.ratio ? options.ratio : 0;
    cards.each(function (i) {
        var name = $(this).find('a.zg-link').html();
        var id = $(this).find('a.zg-link').attr("href").replace("http://www.zhihu.com/people/", "");
        var detail = $(this).find('.details');
        var hash = $(this).find(".zg-btn").attr("data-id");
        if (id != undefined && name != undefined && hash != undefined) {
            try {
                var follower = Number(detail.eq(0).children().eq(0).html().split(' ')[0]);
                var ask = Number(detail.eq(0).children().eq(1).html().split(' ')[0]);
                var answer = Number(detail.eq(0).children().eq(2).html().split(' ')[0]);
                var agree = Number(detail.eq(0).children().eq(3).html().split(' ')[0]);
                var ratio = agree / answer;
                if (answer >= answerlimit && agree >= agreelimit && follower >= followerlimit && ratio >= ratiolimit) {
                    var r = new Object();
                    r.name = name;
                    r.id = id;
                    r.hash = hash;
                    r.follower = follower;
                    r.ask = ask;
                    r.agree = agree;
                    r.answer = answer;
                    r.ratio = ratio.toFixed(2);
                    users.push(r);
                }
            }
            catch (err) {
                //html解析出错只记日志，不处理
                logger.error("Cannot read user card of " + id + ":" + err);
            }
        }
    });
    callback(users);
}

//将抓取到的用户和数据库中做对比，去重，记录
function saveUsers(callback) {
    db.query("select id, hash from users", function (err, oldusers) {
        if (err) {
            callback(err);
            return;
        }
        var newusers = new Array();
        for (var i in users) {
            var found = false;
            for (var j in oldusers) {
                if (users[i].hash == oldusers[j].hash) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                newusers.push(users[i]);
                logger.log("New user added: id:'" + users[i].id + "' name:'" + users[i].name + "', has " + users[i].agree + " agree and " + users[i].follower + " followers.");
            }
        }
        users = null;
        userhashs = null;
        oldusers = null;
        //根据抓取结果，将新用户和修改内容的用户写入到用户表
        var sqls = new Array();
        for (var i in newusers) {
            sqls.push("INSERT INTO users (id, name, hash) VALUES ('" + newusers[i].id + "'," + db.escape(newusers[i].name) + ",'" + newusers[i].hash + "')");
        }
        db.mutliquery(sqls, function (err) {
            if (err) {
                callback(err);
                return;
            }
            callback(null, newusers.length);
            sqls = null;
            newusers = null;
        });
    });
}