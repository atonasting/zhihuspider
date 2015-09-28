## zhihuspider

网站「看知乎」后台爬虫的源码，使用node.js编写。

## 环境配置

1. 搞一台服务器，什么linux都行，我用的是CentOS 6.5；
2. 装个mysql数据库，5.5或5.6均可，图省事可以直接用lnmp或lamp来装，回头还能直接在浏览器看日志；
3. 先安个node.js环境，我用的是0.12.7，更靠后的版本没试过；
4. 执行npm -g install forever，安装forever好让爬虫在后台跑；
5. 把所有代码整到本地（整=git clone）；
6. 在项目目录下执行npm install安装依赖库；
7. 在项目目录下创建json和avatar两个空文件夹；
8. 建立一个空mysql数据库和一个有完整权限的用户，先后执行代码里的setup.sql和startusers.sql，创建数据库结构并导入初始种子用户；
9. 编辑config.js，标明（必须）的配置项必须填写或修改，其余项可以暂时不改：

>     exports.jsonPath = "./json/";//生成json文件的路径
    exports.avatarPath = "./avatar/";//保存头像文件的路径
    exports.dbconfig = {
        host: 'localhost',//数据库服务器（必须）
        user: 'dbuser',//数据库用户名（必须）
        password: 'dbpassword',//数据库密码（必须）
        database: 'dbname',//数据库名（必须）
        port: 3306,//数据库服务器端口
        poolSize: 20,
        acquireTimeout: 30000
    };

>     exports.urlpre = "http://www.zhihu.com/";//知乎网址
    exports.urlzhuanlanpre = "http://zhuanlan.zhihu.com/";//知乎专栏网址

>     exports.WPurl = "www.xxx.com";//要发布文章的wordpress网站地址
    exports.WPusername = "publishuser";//发布文章的用户名
    exports.WPpassword = "publishpassword";//发布文章用户的密码

>     exports.mailservice = "QQ";//邮件通知服务类型，也可以用Gmail，前提是你访问得了Gmail（必须）
    exports.mailuser = "12345@qq.com";//邮箱用户名（必须）
    exports.mailpass = "qqpassword";//邮箱密码（必须）
    exports.mailfrom = "12345@qq.com";//发送邮件地址（必须，一般与用户名所属邮箱一致）
    exports.mailto = "12345@qq.com";//接收通知邮件地址（必须）

保存，然后进入下一步。

## 爬虫用户
爬虫的原理其实就是模拟一个真正的知乎用户在网站上点来点去并收集数据，所以我们需要有一个真正的知乎用户。
为了测试可以用你自己的账号，但从长远着想，还是专门注册个小号吧，一个就够，目前的爬虫也只支持一个。
我们的模拟过程不必像真的用户那样从首页登录，而是直接借用cookie值：

注册激活登录之后，进入自己的主页，使用任何有开发者模式或查看cookie插件的浏览器，打开知乎中自己的cookie。
可能有很复杂的一大串，但我们只需要其中一部分，即「z_c0」。
复制你自己cookie中的z_c0部分，连等号、引号、分号都不要落下，最后格式大致是这样的：

> z_c0="LA8kJIJFdDSOA883wkUGJIRE8jVNKSOQfB9430=|1420113988|a6ea18bc1b23ea469e3b5fb2e33c2828439cb";

在mysql数据库的cookies表中插入一行记录，其中各字段值分别为：

- email：爬虫用户的登录邮箱
- password：爬虫用户的密码
- name：爬虫用户名
- hash：爬虫用户的hash（每个用户不可修改的唯一标识，其实这里用不到，如果一定需要的话看本文末尾如何获取）
- cookie：刚才你复制的cookie

然后就可以正式开始运行了。

如果cookie失效或用户被封，直接修改这行记录的cookie字段即可。

## 运行
推荐用forever来执行，这样不仅方便后台运行和记录日志，还能在崩溃后自动重启。
示例：
> forever -l /var/www/log.txt index.js

其中-l后的地址就是记录日志的地方，如果放在web服务器目录下，就能在浏览器里通过http://www.xxx.com/log.txt 来直接查看日志了。

在index.js后面加参数（用空格分隔）可以执行不同的爬虫指令：

1. -i 立即执行，如果不加此参数则默认在下一个指定时间执行，如每天凌晨0:05分；
2. -ng 跳过抓取新用户阶段，即getnewuser；
3. -ns 跳过快照阶段，即usersnapshot；
4. -nf 跳过生成数据文件阶段，即saveviewfile；
5. -db 显示调试日志。

各阶段的功能在下一节介绍。

为了方便运行，可以将这行命令写成sh脚本，例如：
>  #!/bin/bash  
cd /usr/zhihuspider  
rm -f /var/www/log.txt  
forever -l /var/www/log.txt start index.js $*

具体路径请替换成自己的。  

这样就能通过./zhihuspider.sh 加参数来开启爬虫了：
比如./zhihuspider.sh -i -ng -nf就是立即开始任务、跳过新用户和保存文件阶段。  

停止爬虫的方法是forever stopall（或stop序号）。

## 原理概述
看知乎爬虫的入口文件是index.js。它通过循环方式在每天指定时间执行爬虫任务。

每天顺序执行的任务有三个，分别是：

1. getnewuser.js：通过当前库内用户关注者列表的对比，抓取新用户信息，依靠此机制可以自动将知乎上值得关注的新人纳入库中；
2. usersnapshot.js：循环抓取当前库内用户资料和答案列表，并以每日快照形式保存下来。
3. saveviewfile.js：根据最近一次快照内容，生成用户分析列表，并筛选出昨日、近日和历史精华答案发布到「看知乎」网站。

在以上三个任务执行完毕后，主线程会每隔几分钟刷新一次知乎首页，验证当前cookie是否仍然有效，如果失效（跳到未登录页），则会给指定邮箱发送通知邮件，提醒及时更换cookie。
更换cookie的方法和初始化时一致，只需手工登录一次然后取出cookie值就行了。



如果对具体代码实现感兴趣可以仔细看里面的注释，调整一些配置，甚至尝试自己重构整个爬虫。

## Tips
- getnewuser的原理是通过对比前后两天快照中用户的关注数量进行指定抓取，所以必须有了至少两次快照之后才能开始，之前就算执行也会自动跳过。
- 快照抓到一半是可以恢复的。如果程序出错崩溃，用forever stop停止它，然后加上参数-i -ng，立即执行并跳过新用户阶段就能从刚才抓到一半的快照继续下去了。
- 不要轻易增加快照抓取时的（伪）线程数，即usersnapshots中的maxthreadcount属性。线程太多会导致429错误，同时抓取回来的大量数据可能会来不及写入数据库造成内存溢出。所以，除非你的数据库搭在SSD上，线程不要超过10个。
- saveviewfile生成分析结果的工作需要至少近7天的快照才能进行，如果快照内容少于7天会报错并跳过。此前的分析工作可以手动查询数据库进行。
- 考虑到大多数人并不需要复制一个「看知乎」，已经将自动发布wordpress文章函数入口注释掉了。如果你搭建好了wordpress，记得开启xmlrpc，然后设置一个专门用于发布文章的用户，在config.js中配置相应兵并将saveviewfile中的相关代码解除注释。
- 代码可能不太容易读懂。除了node.js的回调结构本身就较混乱之外，还有一部分原因是最初写程序时我刚刚开始接触node.js，有很多不熟悉的地方导致结构混乱没有来得及改正；另一部分是在多次缝缝补补中累加了许多丑陋的判断条件和重试规则，如果全部去掉，代码量可能会下降三分之二。但这是没有办法的事，为了保障一个系统的稳定运行，必须加入这些。
- 本爬虫源码基于WTFPL协议，不对修改和发布做任何限制。
- 苏莉安很懒，不会及时解答问题和更新版本，作为开发者应该尽量自己解决。
