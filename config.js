/**
 * Created by sulian on 13-10-31.
 * 配置文件
 */

exports.jsonPath = "./json/";//生成json文件的路径
exports.avatarPath = "./avatar/";//保存头像文件的路径
exports.dbconfig = {
    host: 'localhost',//数据库服务器
    user: 'root',//数据库用户名
    password: 'a123456',//数据库密码
    database: 'zhihudata',//数据库名
    port: 3306,//数据库服务器端口
    poolSize: 20,
    acquireTimeout: 30000
};

exports.urlpre = "https://www.zhihu.com/";//知乎网址
exports.urlzhuanlanpre = "http://zhuanlan.zhihu.com/";//知乎专栏网址

exports.WPurl = "www.xxx.com";//要发布文章的wordpress网站地址
exports.WPusername = "publishuser";//发布文章的用户名
exports.WPpassword = "publishpassword";//发布文章用户的密码
exports.WPurlavatarpre = "http://www.xxx.com/avatar/";//发布文章中替代原始头像的url地址

exports.mailservice = "QQ";//邮件通知服务类型，也可以用Gmail，前提是你访问得了Gmail
exports.mailuser = "xi4oz3ro@qq.com";//邮箱用户名
exports.mailpass = "Jcevxl6324";//邮箱密码
exports.mailfrom = "xi4oz3ro@qq.com";//发送邮件地址
exports.mailto = "xi4oz3ro@vip.qq.com";//接收通知邮件地址