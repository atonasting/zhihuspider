SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


--
-- Struct of table `cookies`
--

CREATE TABLE IF NOT EXISTS `cookies` (
  `email` varchar(100) NOT NULL,
  `password` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `hash` varchar(100) NOT NULL,
  `cookie` varchar(500) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Struct of table `snapshots`
--

CREATE TABLE IF NOT EXISTS `snapshots` (
  `tid` int(11) NOT NULL,
  `starttime` datetime NOT NULL,
  `endtime` datetime DEFAULT '0000-00-00 00:00:00',
  `successcount` int(11) DEFAULT '0',
  `failcount` int(11) DEFAULT '0',
  `idchangedcount` int(11) DEFAULT '0',
  `namechangedcount` int(11) DEFAULT '0',
  `avatarchangedcount` int(11) DEFAULT '0',
  `lasttid` int(11) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Struct of table `users`
--

CREATE TABLE IF NOT EXISTS `users` (
  `tid` int(11) NOT NULL,
  `hash` varchar(100) NOT NULL,
  `id` varchar(100) NOT NULL,
  `name` varchar(100) NOT NULL,
  `sex` tinyint(4) DEFAULT NULL,
  `avatar` varchar(100) DEFAULT NULL,
  `signature` varchar(500) DEFAULT NULL,
  `description` varchar(2000) DEFAULT NULL,
  `cheat` tinyint(1) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Struct of table `usersnapshots`
--

CREATE TABLE IF NOT EXISTS `usersnapshots` (
  `tid` int(11) NOT NULL,
  `sid` int(11) NOT NULL,
  `uid` int(11) NOT NULL,
  `ask` int(11) NOT NULL,
  `answer` int(11) NOT NULL,
  `post` int(11) NOT NULL,
  `agree` int(11) NOT NULL,
  `thanks` int(11) NOT NULL,
  `follower` int(11) NOT NULL,
  `followee` int(11) NOT NULL,
  `fav` int(11) NOT NULL,
  `logs` int(11) NOT NULL,
  `mostvote` int(11) NOT NULL,
  `mostvote5` int(11) NOT NULL,
  `mostvote10` int(11) NOT NULL,
  `count10000` int(11) NOT NULL,
  `count5000` int(11) NOT NULL,
  `count2000` int(11) NOT NULL,
  `count1000` int(11) NOT NULL,
  `count500` int(11) NOT NULL,
  `count200` int(11) NOT NULL,
  `count100` int(11) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Struct of table `usertopanswers`
--

CREATE TABLE IF NOT EXISTS `usertopanswers` (
  `tid` bigint(20) NOT NULL,
  `uid` int(11) NOT NULL,
  `sid` int(11) NOT NULL,
  `title` varchar(400) NOT NULL,
  `agree` int(11) NOT NULL,
  `date` datetime NOT NULL,
  `answerid` varchar(20) NOT NULL,
  `link` varchar(100) NOT NULL,
  `ispost` tinyint(1) NOT NULL,
  `collapsed` tinyint(1) NOT NULL,
  `noshare` tinyint(1) NOT NULL,
  `len` int(11) NOT NULL,
  `imgcount` int(11) NOT NULL,
  `summary` varchar(2000) NOT NULL,
  `content` mediumtext NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Struct of table `wpdetail`
--

CREATE TABLE IF NOT EXISTS `wpdetail` (
  `tid` int(11) NOT NULL,
  `pid` int(11) NOT NULL,
  `uid` int(11) NOT NULL,
  `answerlink` varchar(100) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Struct of table `wpposts`
--

CREATE TABLE IF NOT EXISTS `wpposts` (
  `tid` int(11) NOT NULL,
  `date` date NOT NULL,
  `publishtime` datetime NOT NULL,
  `type` varchar(50) NOT NULL,
  `postid` int(11) NOT NULL,
  `pic` varchar(200) NOT NULL,
  `excerpt` varchar(1000) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `cookies`
--
ALTER TABLE `cookies`
  ADD PRIMARY KEY (`hash`);

--
-- Indexes for table `snapshots`
--
ALTER TABLE `snapshots`
  ADD PRIMARY KEY (`tid`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`tid`),
  ADD UNIQUE KEY `idx_id` (`id`),
  ADD UNIQUE KEY `idx_hash` (`hash`);

--
-- Indexes for table `usersnapshots`
--
ALTER TABLE `usersnapshots`
  ADD PRIMARY KEY (`tid`),
  ADD UNIQUE KEY `us` (`uid`,`sid`),
  ADD KEY `sid` (`sid`);

--
-- Indexes for table `usertopanswers`
--
ALTER TABLE `usertopanswers`
  ADD PRIMARY KEY (`tid`),
  ADD UNIQUE KEY `index_link` (`link`),
  ADD KEY `id` (`uid`,`sid`);

--
-- Indexes for table `wpdetail`
--
ALTER TABLE `wpdetail`
  ADD PRIMARY KEY (`tid`),
  ADD UNIQUE KEY `link` (`answerlink`),
  ADD KEY `pid` (`pid`);

--
-- Indexes for table `wpposts`
--
ALTER TABLE `wpposts`
  ADD PRIMARY KEY (`tid`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `snapshots`
--
ALTER TABLE `snapshots`
  MODIFY `tid` int(11) NOT NULL AUTO_INCREMENT;
--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `tid` int(11) NOT NULL AUTO_INCREMENT;
--
-- AUTO_INCREMENT for table `usersnapshots`
--
ALTER TABLE `usersnapshots`
  MODIFY `tid` int(11) NOT NULL AUTO_INCREMENT;
--
-- AUTO_INCREMENT for table `usertopanswers`
--
ALTER TABLE `usertopanswers`
  MODIFY `tid` bigint(20) NOT NULL AUTO_INCREMENT;
--
-- AUTO_INCREMENT for table `wpdetail`
--
ALTER TABLE `wpdetail`
  MODIFY `tid` int(11) NOT NULL AUTO_INCREMENT;
--
-- AUTO_INCREMENT for table `wpposts`
--
ALTER TABLE `wpposts`
  MODIFY `tid` int(11) NOT NULL AUTO_INCREMENT;