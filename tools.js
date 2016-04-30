/**
 * Created by sulian on 13-10-31.
 * 工具类
 */
var fs = require('fs');
var http = require("http");
var request = require('request');
var zlib = require('zlib');
var nodemailer = require('nodemailer');
var images = require("images");
var xmlrpc = require('xmlrpc');
var config = require("./config");
var self = require("./tools");
var logger = require("./logger");

//////////////////网络访问部分

var maxretry = 2;//请求如果出错的话，最大重试次数

//使用cookie访问页面
exports.get = function (url, cookie, callback, retry) {
    if (!retry) retry = 0;
    var headers = {
        'Accept': 'text/html, application/xhtml+xml, */*',
        'Accept-Language': 'zh-CN',
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'gzip,deflate',
        'Cookie': cookie
    };

    request({
            url: url,
            headers: headers,
            timeout: 15000,
            encoding: null
        },
        function (error, response, data) {
            if (!error && response.statusCode == 200) {
                var buffer = new Buffer(data);
                var encoding = response.headers['content-encoding'];
                if (encoding == 'gzip') {
                    zlib.gunzip(buffer, function (err, decoded) {
                        callback(err && ('unzip error' + err), decoded && decoded.toString());
                    });
                } else if (encoding == 'deflate') {
                    zlib.inflate(buffer, function (err, decoded) {
                        callback(err && ('deflate error' + err), decoded && decoded.toString());
                    })
                } else {
                    callback(null, buffer.toString());
                }
            }
            else {
                //小于错误次数则重试
                if (retry < maxretry) {
                    logger.debug("retry getting url : " + url);
                    self.get(url, cookie, callback, retry + 1);
                }
                else
                    callback(error || response.statusCode);
            }
        });
}

//使用cookie提交表单并返回结果
exports.post = function (url, cookie, body, callback, retry) {
    if (!retry) retry = 0
    var headers = {
        'Accept-Language': 'zh-CN',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'gzip,deflate',
        'Cookie': cookie
    };

    request.post({
            url: url,
            headers: headers,
            encoding: null,
            timeout: 15000,
            body: body
        },
        function (error, response, data) {
            if (!error && response.statusCode == 200) {
                var buffer = new Buffer(data);
                var encoding = response.headers['content-encoding'];
                if (encoding == 'gzip') {
                    zlib.gunzip(buffer, function (err, decoded) {
                        callback(err && ('unzip error' + err), decoded && decoded.toString());
                    });
                } else if (encoding == 'deflate') {
                    zlib.inflate(buffer, function (err, decoded) {
                        callback(err && ('deflate error' + err), decoded && decoded.toString());
                    })
                } else {
                    callback(null, buffer.toString());
                }
            }
            else {
                //小于错误次数则重试
                if (retry < maxretry) {
                    logger.debug("retry posting url : " + url);
                    self.post(url, cookie, body, callback, retry + 1);
                }
                else
                    callback(error || response.statusCode);
            }
        });
}

//获取头像并保存于本地（不删除旧头像）
exports.getAvatar = function (avatarurl, callback, retry) {
    if (!avatarurl) {
        callback(null);
        return;
    }
    if (!retry) retry = 0;

    var filepath = avatarurl.replace("http://", "").replace("https://", "");
    if (fs.existsSync(config.avatarPath + filepath)) {
        logger.debug("avatar existed: " + filepath);
        callback(null);
        return;
    }

    //逐级判断并建立目录
    var paths = filepath.split("/");
    var checkdir = config.avatarPath;
    for (var i in paths) {
        if (i < paths.length - 1 && paths[i].length > 0) {
            checkdir += "/" + paths[i];
            if (!fs.existsSync(checkdir))
                fs.mkdirSync(checkdir);
        }
    }

    this.get(avatarurl, null, function (error, response, data) {
        if (!error && response.statusCode == 200) {
            fs.writeFileSync(config.avatarPath + filepath, data, 'binary');
            logger.debug("avatar saved: " + filepath);
            callback(null);
        }
        else {
            if (retry < maxretry) {
                self.getAvatar(avatarurl, callback, retry + 1);
            }
            else
                callback(error || response.statusCode);
        }
    })
}

//////////////////工具部分

//获取当前日期时间字符串
exports.getDateTimeString = function (d) {
    if (!d) d = new Date();
    var yyyy = d.getFullYear().toString();
    var mm = (d.getMonth() + 1).toString();
    var dd = d.getDate().toString();
    var hh = d.getHours().toString();
    var mi = d.getMinutes().toString();
    var ss = d.getSeconds().toString();
    return yyyy + "-" + (mm[1] ? mm : "0" + mm) + "-" + (dd[1] ? dd : "0" + dd) + " " + (hh[1] ? hh : "0" + hh) + ":" + (mi[1] ? mi : "0" + mi) + ":" + (ss[1] ? ss : "0" + ss);

}

//获取当前日期字符串
exports.getDateString = function (d) {
    if (!d) d = new Date();
    var yyyy = d.getFullYear().toString();
    var mm = (d.getMonth() + 1).toString();
    var dd = d.getDate().toString();
    return yyyy + "-" + (mm[1] ? mm : "0" + mm) + "-" + (dd[1] ? dd : "0" + dd);
}

//获取当前日期字符串
exports.getCNDateString = function (d) {
    if (!d) d = new Date();
    var yyyy = d.getFullYear().toString();
    var mm = (d.getMonth() + 1).toString();
    var dd = d.getDate().toString();
    return yyyy + "年" + mm + "月" + dd + "日";
}

//获取url地址的文件名部分
exports.getUrlFileName = function (url) {
    if (url == undefined || url == null) return '';
    var paths = url.split('/');
    return paths[paths.length - 1];
}

//复制文件
exports.copyfile = function (sourceFile, targetFile) {
    try {
        fs.writeFileSync(targetFile, fs.readFileSync(sourceFile));
        return null;
    }
    catch (err) {
        return err;
    }
}

////////////////任务队列部分
//按顺序执行队列中的任务，并且前一个失败不影响后一个
exports.taskQueue = function (tasks, callback, cursor) {
    if (!cursor) cursor = 0;
    if (cursor >= tasks.length) {
        callback();
        return;
    }
    var task = tasks[cursor];
    task.run(function (err) {
        if (err) logger.error("Task [" + task.name + "] error: " + err + "\nNext task will run.");
        else logger.log("Task [" + task.name + "] ended successfully.");

        self.taskQueue(tasks, callback, cursor + 1);
    });
}

//按顺序执行队列中的任务，一个失败则全部中断
exports.taskQueueNoFail = function (tasks, callback, cursor) {
    if (!cursor) cursor = 0;
    if (cursor >= tasks.length) {
        callback();
        return;
    }
    var task = tasks[cursor];
    task.run(function (err) {
        if (err) {
            logger.error("Task [" + task.name + "] error: " + err + "\nTask queue break down.");
            callback(err);
            return;
        }
        else logger.log("Task [" + task.name + "] ended successfully.");

        self.taskQueueNoFail(tasks, callback, cursor + 1);
    });
}

//////////////////通知邮件部分
var mailsender = {
    name: 'Zhihuspider',
    service: config.mailservice,
    auth: {
        user: config.mailuser,
        pass: config.mailpass
    }
};

exports.sendMail = function (subject, body, callback) {
    var mailOptions = {
        from: config.mailfrom,
        to: config.mailto,
        subject: subject,
        html: body
    };
    var smtpTransport = nodemailer.createTransport('SMTP', mailsender);

    smtpTransport.sendMail(mailOptions, function (error, response) {
        if (error) {
            callback(error);
        } else {
            callback();
        }
        smtpTransport.close();
    })
}


/////////////////////////发布到博客部分
var avatarwidth = 100, avatarheight = 100;//头像宽高

//不参与拼接的默认头像列表
var defaultavatars =
    ["http://p1.zhimg.com/da/8e/da8e974dc_l.jpg",
        "http://p1.zhimg.com/56/3d/563dd7a1e_l.jpg",
        "http://p1.zhimg.com/28/0d/280dd71bf_l.jpg",
        "http://p4.zhimg.com/1d/d6/1dd64f6c2_l.jpg",
        "http://p1.zhimg.com/53/05/53055c778_l.jpg",
        "http://p2.zhimg.com/e0/b0/e0b029085_l.jpg",
        "http://p3.zhimg.com/d2/76/d276fdc5f_l.jpg",
        "http://p4.zhimg.com/16/44/16448cd6e_l.jpg",
        "http://p4.zhimg.com/cb/af/cbafc8687_l.jpg",
        "http://p3.zhimg.com/7b/c0/7bc07948a_l.jpg",
        "http://p2.zhimg.com/7b/cf/7bcf614a2_l.jpg",
        "http://p3.zhimg.com/6f/c8/6fc8b5357_l.jpg",
        "http://p1.zhimg.com/f8/9c/f89c5c434_l.jpg",
        "http://p2.zhimg.com/01/9b/019bedf30_l.jpg",
        "http://p2.zhimg.com/9f/84/9f842085a_l.jpg",
        "http://p3.zhimg.com/9d/37/9d377b10c_l.jpg",
        "http://p2.zhimg.com/cc/75/cc75a662e_l.jpg",
        "http://p1.zhimg.com/c1/69/c169da458_l.jpg",
        "http://p3.zhimg.com/b7/14/b714f7e63_l.jpg",
        "http://p3.zhimg.com/fa/ca/facab7a8f_l.jpg",
        "http://p3.zhimg.com/bd/f3/bdf3bf1da_l.jpg",
        "http://p4.zhimg.com/cd/c6/cdc60a37a_l.jpg",
        "http://p3.zhimg.com/51/4b/514b3734e_l.jpg",
        "http://p3.zhimg.com/50/50/505077a4f_l.jpg",
        "http://p3.zhimg.com/de/f9/def9b2ffd_l.jpg",
        "http://p4.zhimg.com/4a/0f/4a0f4a15e_l.jpg",
        "http://p1.zhimg.com/33/fc/33fc95104_l.jpg",
        "http://p3.zhimg.com/9a/73/9a737d064_l.jpg"];

//按行列数拼接头像
exports.spliceAvatars = function (avatars, rowcount, colcount, random, norepeat, nodefault, callback) {
    if (random) avatars.sort(function (a, b) {//随机排序
        return Math.random() > 0.5 ? 1 : -1;
    });

    var currentrow = 0, currentcol = 0;//当前行列
    var outimg = images(rowcount * avatarwidth, colcount * avatarheight);
    var addedavatars = new Array();//记录已添加的头像，避免重复\
    for (i in avatars) {
        if (avatars[i].length == 0) continue;//如果头像为空则跳到下一个
        if (nodefault && defaultavatars.indexOf(avatars[i]) != -1) continue;//如果禁用默认头像则跳到下一个
        if (norepeat && addedavatars.indexOf(avatars[i]) != -1) continue;
        try {
            var avatarpath;
            if (avatars[i].indexOf("https://") == 0)  avatarpath = avatars[i].replace("https://", config.avatarPath);
            else avatarpath = avatars[i].replace("http://", config.avatarPath);

            var avaimg = images(avatarpath);
            outimg.draw(avaimg, currentrow * avatarwidth, currentcol * avatarheight);
            addedavatars.push(avatars[i]);
            currentrow++;
            if (currentrow >= rowcount) {
                currentrow = 0;
                currentcol++;
            }
            if (currentcol >= colcount)  break;
        }
        catch (err) {//出错不处理，直接跳到下张图片
            logger.debug("img file not exist: " + avatars[i] + " err:" + err);
        }
    }

    try {
        var buffer = outimg.encode("jpg", {quality: 70});
        callback(null, buffer);
    }
    catch (err) {
        callback(err);
    }
}

//获取wordpress客户端命令对象
function WPcommand(command, postbody, callback) {
    var clientOptions = {host: config.WPurl, port: 80, path: '/xmlrpc.php'};
    var client = xmlrpc.createClient(clientOptions);
    client.methodCall(command, postbody, callback);
}

//获取一个默认通用的wordpress消息头，然后可以补充内容
function WPpostbody() {
    var postbody = new Array();
    postbody.push(0);//blogid，无用
    postbody.push(config.WPusername);//用户名
    postbody.push(config.WPpassword);//密码
    return postbody;
}

//发布wordpress日志
exports.WPnewPost = function (publishdata, callback) {
    var postbody = WPpostbody();
    var content = {//内容
        'post_type': 'post',
        'post_title': publishdata.title,
        'post_name': publishdata.link,
        'post_status': publishdata.isdraft ? 'draft' : 'publish',
        'comment_status': 'open',
        'post_date_gmt': new Date(publishdata.publishtime.setHours(publishdata.publishtime.getHours() - 8)),//按GMT+8的时区发布
        'terms_names': {'category': [publishdata.category]},
        'post_content': publishdata.content
    };
    if (publishdata.sticky) content.sticky = publishdata.sticky;
    if (publishdata.excerpt) content.post_excerpt = publishdata.excerpt;
    if (publishdata.mediaid) content.post_thumbnail = publishdata.mediaid;
    postbody.push(content);

    WPcommand('wp.newPost', postbody, function (error, value) {
        if (error)
            callback(error);
        else
            callback(null, value);//返回文章id
    });
}

//上传媒体文件并返回ID
exports.WPnewMedia = function (filename, buffer, callback) {
    var postbody = WPpostbody();
    postbody.push({
        name: filename,
        type: 'image/jpeg',
        bits: buffer,
        overwrite: true
    });
    WPcommand('wp.uploadFile', postbody, function (error, value) {
        if (error)
            callback(error);
        else
            callback(null, value.id, value.url);//返回文章id
    });
}

//取消wordpress日志置顶
exports.WPcancelSticky = function (postid, callback) {
    var postbody = WPpostbody();
    postbody.push(postid);
    postbody.push({//内容
        'sticky': false
    });

    WPcommand('wp.editPost', postbody, function (error, value) {
        if (error || !value)
            callback(error || 'Cancel post sticky unsuccessfully.');
        else
            callback(null);
    })
}
