/**
 * Created by sulian on 13-10-31.
 * 配置文件
 */

exports.jsonPath = "./json/";//生成json文件的路径
exports.avatarPath = "./avatar/";//保存头像文件的路径
exports.dbconfig = {
    host: 'localhost',//数据库服务器
    user: 'dbuser',//数据库用户名
    password: 'dbpassword',//数据库密码
    database: 'dbname',//数据库名
    port: 3306,//数据库服务器端口
    poolSize: 20,
    acquireTimeout: 30000
};

exports.urlpre = "http://www.zhihu.com/";//知乎网址
exports.urlzhuanlanpre = "http://zhuanlan.zhihu.com/";//知乎专栏网址

exports.WPurl = "www.xxx.com";//要发布文章的wordpress网站地址
exports.WPusername = "publishuser";//发布文章的用户名
exports.WPpassword = "publishpassword";//发布文章用户的密码

exports.mailservice = "QQ";//邮件通知服务类型，也可以用Gmail，前提是你访问得了Gmail
exports.mailuser = "12345@qq.com";//邮箱用户名
exports.mailpass = "qqpassword";//邮箱密码
exports.mailfrom = "12345@qq.com";//发送邮件地址
exports.mailto = "12345@qq.com";//接收通知邮件地址