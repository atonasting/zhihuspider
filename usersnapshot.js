/**
 * Created by sulian on 13-11-4.
 * 读取用户信息、生成快照
 */
var cheerio = require("cheerio");
var fs = require('fs');
var tools = require("./tools");
var logger = require("./logger");
var config = require("./config");
var cookies = require("./cookies");
var db = require("./db");

var cookie;//使用的cookie
var xsrf;//sessionid

var users = new Array();//用户列表
var _usercursor = 0;//用户游标
var maxthreadcount = 12;//最大读取线程数
var threadcount;//实际线程数
var threadstatus;//线程状态数组
var firstthreadstoptime = 0;//首个线程停止时间
var firstthreadstopspan = 300000;//首个线程停止之后强制停止所有线程的时间（5分钟）（用于防止线程卡住，无法执行后面的程序）
var lastsaveresulttime = 0;//上次保存数据的时间
var lastsaveresultspan = 600000;//离上次保存数据后强制停止所有线程的时间（10分钟）（用于防止线程卡住，无法执行后面的程序）
var httpdelay = 100;//两次抓取网页的间隔(ms)
var faildelay = 1000;//前一次抓取失败后到下一次抓取的间隔(ms)
var dbdelay = 2;//两次写入数据库的间隔(ms)
var agreelimit = 10;//抓取用户高票答案的赞同数下限
var maxretry = 10;//抓取同一页面时的连续最大重试次数（防止死锁）

var failusers = new Array();//第一次读取失败的用户列表
var fixed = false;//是否已完成修复（如果修复后第二次读取时再出错则不再处理）

var results = new Array();//结果列表
var successUserCount = 0;//本次成功数
var failUserCount = 0;//本次失败数
var fixedUserCount = 0;//本次修复数
var idchangedUserCount = 0;//本次ID修改数
var namechangedUserCount = 0;//本次姓名修改数
var avatarchangedUserCount = 0;//本次头像更换数
var starttime, endtime;
var sid;//本次快照的id

//获取用户信息
exports.start = function (c, x, callback) {
    cookie = c;
    xsrf = x;
    logger.log("Get snapshot start.");
    starttime = tools.getDateTimeString();
    users = new Array();
    failusers = new Array();
    results = new Array();
    //初始化快照id和用户列表
    snapshotinit(function (err) {
        if (err) {
            callback(err);
            return;
        }
        logger.log("Get " + users.length + " users' snapshots.");
        //根据用户数初始化线程
        threadcount = Math.min(maxthreadcount, users.length);
        initthreads();
        //分线程启动用户读取任务
        for (var i = 0; i < threadcount; i++) {
            startthread(i, getSingleUserInfo);
        }
        saveResults(function () {
            //所有结果保存完成后清理一下数据
            clearData(function (err) {
                if (err) logger.error("Clear data error: " + err);

                logger.log("Snapshot " + sid + " finished.");
                callback();
            });
        });
    });
};

//任务初始化，续传或开启新快照，并返回需要执行的用户列表
function snapshotinit(callback) {
    //读取最新一条快照id和完成情况
    db.query("SELECT tid sid, case when endtime>0 then 1 else 0 end finished FROM snapshots order by starttime desc limit 0,1", function (err, rows) {
        if (err) {
            callback(err);
            return;
        }
        if (rows.length == 0 || rows[0].finished == 1) {//无旧快照或者当前快照已完成，插入一条新快照
            var lastttid = 0;
            if (rows.length > 0) lastttid = rows[0].sid;
            db.query("INSERT INTO snapshots (starttime, lasttid) VALUES ('" + starttime + "'," + lastttid + ")", function (err) {
                if (err) {
                    callback(err);
                    return;
                }
                db.query("SELECT MAX(tid) sid FROM snapshots", function (err, rows) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    sid = rows[0].sid;
                    logger.log("New snapshot " + sid + ".");
                    db.query("select tid, id, name, sex, hash, ifnull(avatar,'') avatar from users", function (err, rows) {
                        if (err || rows.length == 0) {
                            callback(err || "No user.");
                            return;
                        }
                        users = rows;
                        users.sort(function () {//随机排序，防止大V过度集中导致瓶颈
                            return Math.random() - 0.5
                        });
                        callback();
                    });
                });
            });
        }
        else {//未完成，继续使用当前快照，并读取本次未包含的用户列表
            sid = rows[0].sid;
            logger.log("Resume snapshot " + sid + ".");
            db.query("select tid, id, name, sex, hash, ifnull(avatar,'') avatar from users where tid not in (select uid from usersnapshots where sid=" + sid + ")", function (err, rows) {
                if (err || rows.length == 0) {
                    callback(err || "No user to resume.");
                    return;
                }
                users = rows;
                users.sort(function () {//随机排序，防止大V过度集中导致瓶颈
                    return Math.random() - 0.5
                });
                callback();
            });
        }
    })
}

//获取单个用户信息
function getSingleUserInfo(threadnum, callback, cursor, retry) {
    if (cursor == undefined) cursor = getcursor();//如果未指定光标位置，则取下一个用户
    if (retry == undefined) retry = 0;//如果未指定重试次数则置为0

    //如果已读完列表中所有用户，或者全部线程已停止（往往是强制停止）则返回
    if (cursor >= users.length || isallthreadstopped()) {
        callback();
        return;
    }

    var user = users[cursor];
    //读取关于用户页面
    logger.debug(user.tid + " start getting user " + user.id + "'s info, thread " + threadnum + ".");
    tools.get(config.urlpre + "people/" + encodeURIComponent(user.id) + "/about", cookie, function (err, data) {
        if (err) {
            if (err == "404")//是404错误则表示用户已改id，等修复后再进行
                getUserError(threadnum, user.tid + " get user " + user.id + " about page error:" + err, user, callback);
            else {//否则重试
                if (retry >= maxretry)//超出重试次数则记录错误用户并继续
                    getUserError(threadnum, user.tid + " get user " + user.id + " about page error:" + err, user, callback);
                else//否则重试当前用户
                    setTimeout(function () {
                        getSingleUserInfo(threadnum, callback, cursor, retry + 1)
                    }, faildelay);
            }
            return;
        }

        var r = new Object();
        r.uid = user.tid;
        r.id = user.id;
        var $ = cheerio.load(data, {decodeEntities: false});
        var header = $(".zm-profile-header");
        r.name = header.find(".title-section .name").text();
        r.signature = header.find(".title-section .bio").text();
        r.description = header.find(".description .content").text().trim().substr(0, 1500);

        //地理、职业、学校等信息
        var itemsdiv = header.find(".items");
        r.location = itemsdiv.find(".location").text();//位置
        r.business = itemsdiv.find(".business").text();//行业
        r.employment = itemsdiv.find(".employment").text();//公司
        r.position = itemsdiv.find(".position").text();//职位
        r.education = itemsdiv.find(".education").text();//学校
        r.educationextra = itemsdiv.find(".education-extra").text();//专业
        
        r.sex = 0;//性别
        if (header.find(".icon-profile-male").length == 1)
            r.sex = 1;
        else if (header.find(".icon-profile-female").length == 1)
            r.sex = 2;
        r.agree = Number(header.find(".zm-profile-header-user-agree strong").html());
        r.thanks = Number(header.find(".zm-profile-header-user-thanks strong").html());
        r.fav = Number($(".zm-profile-module-desc strong").eq(2).html());
        r.followee = Number($(".zm-profile-side-following strong").eq(0).html());
        r.follower = Number($(".zm-profile-side-following strong").eq(1).html());
        var nav = header.find(".profile-navbar").children();
        r.ask = Number(nav.eq(1).find(".num").html());
        r.answer = Number(nav.eq(2).find(".num").html());
        r.post = Number(nav.eq(3).find(".num").html());
        r.ratio = (r.agree / (r.answer + r.post)).toFixed(2);
        r.logs = Number(nav.eq(5).find(".num").html());

        //判断账号停用
        var accountstatus = $(".zh-profile-account-status");
        if (accountstatus.length == 1 && accountstatus.text().indexOf("知乎社区规范") >= 0) {
            logger.debug(user.tid + " User " + user.id + "'s account is stopped.");
            r.stopped = 1;
        }
        else
            r.stopped = 0;

        if (r.agree > 0 && r.follower == 0 && !fixed) {//如果发现用户有赞同但关注数为0，可能是网络错误导致的，需要再读一次（如果修复后还为0就不处理了）
            getUserError(threadnum, user.tid + " Cannot read user " + user.id + " 's follower.", user, callback);
            return;
        }

        if (r.sex && user.sex != r.sex) {//如果性别正常读取且发生变更则修改
            r.sexchanged = true;
        }

        if (user.oldid) {//此处仅用于修复用户后，用户id改变时记录旧id
            r.oldid = user.oldid;
        }

        if (r.name && r.name != user.name)//判断用户是否修改了名称
            r.oldname = user.name;

        r.avatar = header.find("img.avatar").attr("src");

        //2015.8.31 头像URL修改格式
        if (r.avatar && r.avatar.indexOf("//") == 0) r.avatar = "https://" + r.avatar.substr(2);

        if (r.avatar && tools.getUrlFileName(r.avatar) != tools.getUrlFileName(user.avatar)) //判断是否更换过头像（只比较文件名部分）
            r.oldavatar = user.avatar;
        //保存头像
        tools.getAvatar(r.avatar, function (err) {
            if (err) {//如果头像出错，不处理，不保存
                logger.error(user.tid + " Cannot get user " + user.id + "'s avatar: " + err);
                r.avatar = "";
            }

            //读取用户高票答案和专栏文章
            getTopAnswers(r, 1, new Array(), function (err, alist) {
                if (err) {//读取用户答案失败时加入失败列表重新处理
                    getUserError(threadnum, user.tid + " Cannot read user " + user.id + " 's top answer: " + err, user, callback);
                    return;
                }
                //结果排序
                alist.sort(function (a, b) {
                    return b.agree - a.agree;
                });

                //整理高票答案并计算数量
                var mostvote = 0, mostvote5 = 0, mostvote10 = 0;
                var count10000 = 0, count5000 = 0, count2000 = 0, count1000 = 0, count500 = 0, count200 = 0, count100 = 0;//大于等于指定票数的答案数量
                r.topanswers = new Array();
                if (alist.length > 0) {//防止无回答时出错
                    mostvote = alist[0].agree;
                    for (var j in alist) {
                        if (alist[j].agree >= 10000) count10000++;
                        if (alist[j].agree >= 5000) count5000++;
                        if (alist[j].agree >= 2000) count2000++;
                        if (alist[j].agree >= 1000) count1000++;
                        if (alist[j].agree >= 500) count500++;
                        if (alist[j].agree >= 200) count200++;
                        if (alist[j].agree >= 100) count100++;
                        if (j < 5) mostvote5 += alist[j].agree;
                        if (j < 10) mostvote10 += alist[j].agree;
                        if (j < 15 || alist[j].agree >= agreelimit) {//添加高票答案，如果较多则全部添加，至少也添加15个
                            r.topanswers.push(alist[j]);
                        }
                    }
                }
                r.mostvote = mostvote;
                r.mostvote5 = mostvote5;
                r.mostvote10 = mostvote10;
                r.count10000 = count10000;
                r.count5000 = count5000;
                r.count2000 = count2000;
                r.count1000 = count1000;
                r.count500 = count500;
                r.count200 = count200;
                r.count100 = count100;
                results.push(r);

                //如果是初次
                if (!fixed) {
                    logger.debug((cursor + 1) + " Get user " + user.id + " successfully, thread " + threadnum + ".");
                    successUserCount++;
                    if (successUserCount % 1000 == 0) logger.log("Get " + successUserCount + " users successfully.");
                }
                else {
                    logger.log((cursor + 1) + " Re-get user " + user.id + " successfully, thread " + threadnum + ".");
                    fixedUserCount++;
                }
                user = null;
                r = null;
                $ = null;

                //成功后读取下一用户
                setTimeout(function () {
                    getSingleUserInfo(threadnum, callback);
                }, httpdelay);
                return;
            })
        })
    })
}

//获取用户高票答案列表
function getTopAnswers(r, page, alist, callback, retry) {
    if (!retry) retry = 0;//重试次数
    //获取用户高票答案
    logger.debug("Getting user " + r.id + "'s top answer page " + page + ".");
    tools.get(config.urlpre + "people/" + encodeURIComponent(r.id) + "/answers?order_by=vote_num&page=" + page, cookie, function (err, data) {
        if (err) {
            //如果失败则重试，超出重试次数则返回
            retry++;
            logger.error("Get user " + r.id + "'s top answer page " + page + " error:" + err);
            if (retry >= maxretry)
                callback("reached max retry count", alist);
            else
                setTimeout(function () {
                    getTopAnswers(r, page, alist, callback, retry);
                }, faildelay);
            return;
        }
        //解析答案列表
        var $ = cheerio.load(data, {decodeEntities: false});
        var answerlist = $("#zh-profile-answer-list .zm-item");
        var pagealist = new Array();//当前页答案
        var getanswerfailed = false;//执行each的过程中是否出错，出错则整页重读
        answerlist.each(function () {
            var a = Object();
            var aitem = $(this);//单个答案的html
            a.agree = Number(aitem.find(".zm-item-vote-count").attr("data-votecount"));
            if (!isNaN(a.agree)) {
                a.timestamp = Number(aitem.find(".zm-item-answer").attr("data-created"));
                a.aid = aitem.find(".zm-item-answer").attr("data-aid");//用于获取赞同列表的回答id
                a.date = tools.getDateTimeString(new Date(a.timestamp * 1000));//发布时间
                a.link = aitem.find(".question_link").attr("href");
                a.name = aitem.find(".question_link").html();
                a.ispost = false;
                a.collapsed = (aitem.find(".zm-item-answer").attr("data-collapsed") == "1");//是否折叠
                a.noshare = (aitem.find(".copyright").text().indexOf("禁止转载") >= 0);//是否禁止转载

                //如果链接或标题为空，说明读取有错，需要重读本页
                if (!a.link || !a.name) {
                    getanswerfailed = true;
                    return;
                }

                //获取答案摘要
                var summarydiv = aitem.find(".summary");
                summarydiv.find("a.toggle-expand").remove();//移除展开答案的链接
                a.summary = summarydiv.text().trim().replace(/\n/g, "").substr(0, 1000);
                ;

                //计算答案字数和图片数
                var contentdiv = aitem.find("textarea");
                contentdiv.find(".answer-date-link-wrap").remove();//移除日期链接
                var content = contentdiv.text().trim().replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                a.content = content;
                var findimg = content.match(/<img/g);//查找包含的img标签数
                a.imgcount = findimg ? findimg.length : 0;
                var text = content.replace(/<[^>]*>/g, '');//去掉所有html标签的文本内容
                a.len = text.length;
                pagealist.push(a);
            }
        })

        //如果前一步中出现任何错误则重读当前页，超出重试次数则返回
        if (getanswerfailed) {
            retry++;
            logger.error("Get user " + r.id + "'s top answer page " + page + " error on answer title.");
            if (retry >= maxretry)
                callback("reached max retry count", alist);
            else
                setTimeout(function () {
                    getTopAnswers(r, page, alist, callback, retry);
                }, faildelay);
            return;
        }

        alist = alist.concat(pagealist);

        //如果本页最后一个答案仍然高于指定票数，且未读完所有答案，则继续读取下一页
        if (answerlist.length > 0 && alist.length > 0 && alist.length < r.answer && alist[alist.length - 1].agree >= agreelimit) {
            setTimeout(function () {
                getTopAnswers(r, page + 1, alist, callback);
            }, httpdelay);
            return;
        }

        //否则读取专栏并合并结果
        setTimeout(function () {
            getPosts(r, function (postdata) {
                if (postdata && postdata.length > 0)
                    alist = alist.concat(postdata);

                callback(null, alist);
            })
        }, httpdelay);
    })
}

//读取用户专栏文章列表
function getPosts(r, callback) {
    if (r.post == 0) callback(null);
    else {
        logger.debug("Getting user " + r.id + "'s posts.");
        //抓取用户专栏文章页
        var url = config.urlpre + "people/" + encodeURIComponent(r.id) + "/posts";
        tools.get(url, cookie, function (err, data) {
            if (err) {//失败则重读
                setTimeout(function () {
                    getPosts(r, callback);
                }, faildelay);
                return;
            }

            var $ = cheerio.load(data, {decodeEntities: false});
            var columns = $(".profile-column-posts>.column");
            var links = new Array();
            columns.each(function (i) {
                var columnid = $(this).find(".header .avatar-link").attr("href").replace(config.urlzhuanlanpre, "");//专栏名
                var count = 10;//默认专栏文章数
                var f = $(this).find(".footer a");
                if (f.length > 0) {//如果存在带数量的链接则取指定数量的文章
                    count = Number(f.html().replace("查看全部 ", "").replace(" 篇文章", ""));
                }

                //2014.12.8 专栏文章每次不能读取太多，会出错，改为每页读取10个，多读几次
                for (var i = 0; i < count; i += 10) {
                    links.push(config.urlzhuanlanpre + "api/columns/" + columnid + "/posts?limit=10&offset=" + i);
                }
            })
            //逐个获取专栏文章
            setTimeout(function () {
                getSingleColumn(r.id, links, 0, new Array(), function (postdata) {
                    callback(postdata);
                })
            }, httpdelay);
        })
    }
}

//读取单个专栏，获取文章赞同数
function getSingleColumn(userid, links, cursor, postdata, callback, retry) {
    if (retry == undefined) retry = 0;
    if (cursor >= links.length) {
        callback(postdata);//所有专栏读取完成
        return;
    }

    tools.get(links[cursor], "", function (err, data) {
        if (err) {
            logger.error("Get user column " + links[cursor] + " error: " + err);
            if (retry >= maxretry) {//如重试专栏超过次数，则读下一个
                logger.error("Reached max retry count, read next.");
                setTimeout(function () {
                    getSingleColumn(userid, links, cursor + 1, postdata, callback);
                }, httpdelay);
            }
            else {
                setTimeout(function () {
                    getSingleColumn(userid, links, cursor, postdata, callback, retry + 1);
                }, faildelay);
            }
            return;
        }

        var posts;
        try {
            posts = JSON.parse(data);
        }
        catch (ex) {
            logger.error("Parse json of user column " + links[cursor] + " error: " + ex);
            setTimeout(function () {
                getSingleColumn(userid, links, cursor, postdata, callback, retry + 1);
            }, faildelay);
            return;
        }

        for (var i in posts) {
            var post = posts[i];
            //只有本用户自己发布的专栏文章才计算
            if (post.author && post.author.slug && post.author.slug == userid) {
                var p = new Object();
                p.agree = post.likesCount;
                var pdate = new Date(post.publishedTime);
                p.date = tools.getDateTimeString(pdate);
                p.timestamp = pdate.getTime();
                p.link = post.url;
                p.name = post.title;
                p.aid = post.slug;
                p.summary = post.summary.trim().replace(/<[^>]*>/g, '').substr(0, 1000);
                p.content = post.content;
                p.ispost = true;
                p.collapsed = false;
                p.noshare = false;
                //计算文章字数和包含图片数
                var findimg = post.content.match(/<img/g);//查找包含的img标签数
                p.imgcount = findimg ? findimg.length : 0;
                var text = post.content.trim().replace(/<[^>]*>/g, '');//去掉所有html标签的文本内容
                p.len = text.length;
                postdata.push(p);
            }
        }
        data = null;
        post = null;

        setTimeout(function () {
            getSingleColumn(userid, links, cursor + 1, postdata, callback);
        }, httpdelay);
    })
}

//获取用户出错时的处理
function getUserError(threadnum, errmsg, user, callback) {
    logger.error(errmsg);
    if (failusers == null) return;//如果线程被强制结束，failusers可能会被置成null

    if (!fixed) {//只有初次出错才记录错误用户
        failUserCount++;
        failusers.push(user);
    }
    //出错也执行下一步
    setTimeout(function () {
        getSingleUserInfo(threadnum, callback);
    }, faildelay);
}

//从用户结果列表顶端获取数据并存入数据库
function saveResults(callback) {
    if (results.length != 0) {//有新读取的结果时，取第一条数据，写入数据库
        var r = results.shift();
        lastsaveresulttime = new Date().getTime();
        var sqls = new Array();
        //用户快照
        var snapshotsql = "INSERT INTO `usersnapshots`(`sid`, `uid`, `ask`, `answer`, `post`, `agree`, `thanks`, `follower`, `followee`, `fav`, `logs`, " +
            "`mostvote`, `mostvote5`, `mostvote10`, `count10000`, `count5000`, `count2000`, `count1000`, `count500`, `count200`, `count100`) " +
            "VALUES ('" + sid + "','" + r.uid + "','" + r.ask + "','" + r.answer + "','" + r.post + "','" + r.agree + "','" + r.thanks + "','" +
            r.follower + "','" + r.followee + "','" + r.fav + "','" + r.logs + "','" + r.mostvote + "','" + r.mostvote5 + "','" + r.mostvote10 + "'," +
            "'" + r.count10000 + "','" + r.count5000 + "','" + r.count2000 + "','" + r.count1000 + "','" + r.count500 + "','" + r.count200 + "','" + r.count100 + "')";
        //用户高票答案
        for (var j in r.topanswers) {
            var a = r.topanswers[j];
            sqls.push("REPLACE INTO `usertopanswers`(`uid`, `sid`, `title`, `agree`, `date`, `answerid`, `link`, `ispost`, `collapsed`, `noshare`, `len`, `imgcount`, `summary`, `content`) " +
                "VALUES ('" + r.uid + "','" + sid + "'," + db.escape(a.name) + ",'" + a.agree + "','" + a.date + "','" + a.aid + "','" + a.link + "'," + a.ispost + ", " + a.collapsed + ", " + a.noshare + ", " + a.len + ", " + a.imgcount + ", " + db.escape(a.summary) + ", " + db.escape(a.content) + ")");
        }
        //用户是否改过性别
        if (r.sexchanged) {
            sqls.push("update users set sex=" + r.sex + " where tid=" + r.uid);
        }
        //用户是否改过ID
        if (r.oldid) {
            idchangedUserCount++;
            logger.log(r.uid + " user " + r.oldid + "'s id changed -> " + r.id);
            sqls.push("update users set id=" + db.escape(r.id) + " where tid=" + r.uid);
        }
        //用户是否改过名称
        if (r.oldname != undefined) {
            namechangedUserCount++;
            logger.log(r.uid + " user " + r.id + "'s name changed from " + r.oldname + " -> " + r.name);
            sqls.push("update users set name=" + db.escape(r.name) + " where tid=" + r.uid);
        }
        //用户是否改过头像
        if (r.avatar != r.oldavatar && r.oldavatar != undefined) {
            avatarchangedUserCount++;
            logger.debug(r.uid + " user " + r.id + " uploaded new avatar.");
            sqls.push("update users set avatar='" + r.avatar + "' where tid=" + r.uid);
        }

        //为节约判断资源，用户签名/描述/是否屏蔽等字段一律更新
        sqls.push("update users set signature=" + db.escape(r.signature) + ", description= " + db.escape(r.description) + ", stopped=" + r.stopped +
            " where tid=" + r.uid);

        //单独一句更新用户附加信息
        sqls.push("update users set location=" + db.escape(r.location) + ", business= " + db.escape(r.business) + ", employment= " + db.escape(r.employment) +
            ", position= " + db.escape(r.position) +", education= " + db.escape(r.education) +", educationextra= " + db.escape(r.educationextra) +
            " where tid=" + r.uid);

        //为了避免快照插入后未插入答案即中断，快照本体要放到最后面插入
        sqls.push(snapshotsql);

        db.mutliquery(sqls, function (err, cursor) {
            sqls = null;
            if (err) {
                logger.error("Save results to db error: " + err);
                logger.error("The error sql: " + sqls[cursor]);
            }
            else {
                var logstr = "User " + r.id + " inserted to db.";
                if (results.length > 0) logstr += " " + results.length + " user's data in queue.";
                logger.debug(logstr);

                r = null;
            }
            //成功或失败均继续
            setTimeout(function () {
                saveResults(callback);
            }, dbdelay);
        })
    }
    else {//当结果列表为空时
        if (!isallthreadstopped()) {//如果当前还有读取线程在运行，或者正在修复错误用户，则继续执行
            setTimeout(function () {
                saveResults(callback);
            }, dbdelay);
        }
        else if (failusers.length > 0 && !fixed) {//如果第一轮读完后存在失败用户，则修复并重读它们（第二次还存在则不处理）
            logger.log("Start fixing " + failusers.length + " error users.");
            //通过hash修复用户id
            fixUseridByHash(failusers, 0, function () {
                logger.log("Start reloading " + failusers.length + " users info.");
                users = failusers;
                failusers = new Array();
                _usercursor = 0;
                fixed = true;

                //错误用户较少，使用双线程进行重读即可
                threadcount = 2;
                initthreads();
                startthread(0, getSingleUserInfo);
                startthread(1, getSingleUserInfo);

                setTimeout(function () {
                    saveResults(callback);
                }, dbdelay);
            })
        }
        else {//如果所有读取和修复工作完成，则结束循环、记录时间和数量
            logger.log("success read " + successUserCount + " users first time, " + failUserCount + " failed, " + fixedUserCount + " of them fixed.");
            logger.log(idchangedUserCount + " users changed id, " + namechangedUserCount + " users changed name, " + avatarchangedUserCount + " users uploaded new avatar.");
            endtime = tools.getDateTimeString();
            var snapsql = "UPDATE snapshots SET endtime='" + endtime + "', successcount='" + (successUserCount + fixedUserCount) + "'," +
                " failcount='" + (failUserCount - fixedUserCount) + "', idchangedcount='" + idchangedUserCount + "'," +
                " namechangedcount='" + namechangedUserCount + "', avatarchangedcount='" + avatarchangedUserCount + "'" +
                " WHERE tid='" + sid + "'";
            db.query(snapsql, function (err) {
                if (err) logger.error(err);
                callback();//回调结果
            });
        }
    }
}

//通过用户hash读取首页，修复用户id
function fixUseridByHash(userlist, cursor, callback) {
    if (cursor >= userlist.length) callback();
    else {
        var user = userlist[cursor];
        logger.debug(user.tid + " start read user page by hash: " + user.hash);
        tools.get(config.urlpre + "people/" + user.hash, cookie, function (err, data) {
            if (err)
                logger.error(user.tid + " read user page by hash error:" + err);
            else {
                var $ = cheerio.load(data, {decodeEntities: false});
                var detailhref = $(".zm-profile-header a.zm-profile-header-user-detail").attr("href");//通过链接读取用户id
                if (!detailhref) {
                    logger.error(user.tid + " cannot get user id by hash: " + err);//可能会失败，失败则忽略
                }
                else {
                    var id = detailhref.replace("/people/", "").replace("/about", "");
                    if (user.id != id) {//修改id
                        user.oldid = user.id;
                        user.id = id;
                    }
                }
            }
            //无论是否失败都读取下一个
            setTimeout(function () {
                fixUseridByHash(userlist, cursor + 1, callback);
            }, httpdelay);
        })
    }
}

////执行完成后，清除数据和优化表
function clearData(callback) {
    //清理优化表
    var optimizesqls = ["OPTIMIZE TABLE snapshots", "OPTIMIZE TABLE usersnapshots", "OPTIMIZE TABLE usertopanswers"];
    db.mutliquery(optimizesqls, function (err) {
        //无论是否出错都直接清理数据
        threadstatus = null;
        firstthreadstoptime = 0;
        lastsaveresulttime = 0;
        users = null;
        failusers = null;
        results = null;
        _usercursor = 0;
        successUserCount = 0;
        failUserCount = 0;
        fixedUserCount = 0;
        idchangedUserCount = 0;
        namechangedUserCount = 0;
        avatarchangedUserCount = 0;
        fixed = false;
        starttime = null;
        endtime = null;
        sid = 0;
        if (err) callback(err);
        else callback(null);
    });
}


////（伪）线程和状态部分
//读取用户数组游标
function getcursor() {
    _usercursor++;
    return _usercursor - 1;
}

//初始化线程数组
function initthreads() {
    threadstatus = new Array();
    for (var i = 0; i < threadcount; i++) {
        threadstatus.push("ready");
    }
    firstthreadstoptime = 0;
    lastsaveresulttime = 0;
}

//用第num个线程开启func方法
function startthread(num, func) {
    if (num < threadcount) {
        logger.debug("Thread " + num + " started.");
        threadstatus[num] = "running";
        func(num, function () {
            threadstatus[num] = "stopped";
            logger.debug("Thread " + num + " stopped.");
        });
    }
}

//检查所有线程是否已结束
function isallthreadstopped() {
    if (lastsaveresulttime != 0 && new Date().getTime() - lastsaveresulttime > lastsaveresultspan) {
        logger.log("After " + (lastsaveresultspan / 60000) + " minutes of last save result job idle, force stop all threads.");
        return true;
    }

    var hasrunningthread = false;//是否还有线程在运行
    for (var i = 0; i < threadcount; i++) {
        if (threadstatus[i] == "stopped") {
            if (firstthreadstoptime == 0) {
                //如果出现了首个停止线程，则记录时间
                firstthreadstoptime = new Date().getTime();
                logger.log("First thread stopped.");
            }
        }
        else {
            hasrunningthread = true;
            break;
        }
    }

    //如果还有线程运行中，判断如果第一个停止线程之后已经过了5分钟，则视为所有线程已结束
    if (hasrunningthread) {
        if (firstthreadstoptime != 0 && new Date().getTime() - firstthreadstoptime > firstthreadstopspan) {
            logger.log("After " + (firstthreadstopspan / 60000) + " minutes of first thread stopped, force stop all threads.");
            return true;
        }
        else
            return false;
    }
    else {
        logger.log("All threads stopped.");
        return true;
    }
}
