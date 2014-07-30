/*jshint node:true, expr:true*/

var nodemw      = require('nodemw');
var dateFormat  = require('dateformat');
var mysql       = require('mysql');
var now         = new Date();


(function(MwN) {
'use strict';

// pass configuration object
var client = new MwN('.node-bot.config.json');
var bot;
var errorsAllowed = 150;
var errorLoginTimeout;

process.on('uncaughtException', function (err) {
	console.log('Caught exception: ' + err);
	if (0 === errorsAllowed) return;

	errorsAllowed--;
	if (errorLoginTimeout) clearTimeout(errorLoginTimeout);
	errorLoginTimeout = setTimeout( function() {
		client.logIn( function() {
			// Make the server creating an editToken for our session.
			// If we do that later while processing multiple pages, the sever
			// would create a lot of different tokens due to replecation lag.
			setTimeout( function() {
				client.api.call({
					action: 'tokens'
				}, function(r) {
					// this serves just as token generator...
				} );
			}, 1000 );
		} );
	}, 1000 );
});

bot = {
	version: '0.2.0.0',
	client: client,
	// Just in case someone gets stuck or leaks memory
	// restarted by cron every 4 hours; have a five minuts buffer
	// in case the job was executed too late
	maxRunTime: 1000*60*60*4 - 1000*60*5,
	tasks: [{
		name: 'Updating user groups',
		code: require('./tasks/update_user_groups.js'),
		maxTime: 30000,
		interval: 180000
	}, {
		name: 'JSHint MediaWiki and CSS Validate MediaWiki',
		code: require('./tasks/mediawiki_validate.js'),
		maxTime: 50000,
		interval: 60000
	}, {
		name: 'JSHint Users and CSS Users',
		code: require('./tasks/user_validate.js'),
		maxTime: 50000,
		interval: 60000
	}],
	tasksDone: {},
	launch: function() {
		bot.logOut( function() {
			bot.establishDBConnection( function() {
				client.logIn( function() {
					// Make the server creating an editToken for our session.
					// If we do that later while processing multiple pages, the sever
					// would create a lot of different tokens due to replecation lag.
					setTimeout( function() {
						client.api.call({
							action: 'tokens'
						}, function(r) {
							setTimeout( function() {
								bot.runTasks();
							}, 1000 );
						} );
					}, 1000 );
				} );
			} );
		} );

		// Kill myself if running too long
		setTimeout(function() {
			bot.exit();
		}, this.maxRunTime);
	},
	fetchSetting: function( setting, cb ) {
		bot.connection.query('SELECT `s_value` FROM `settings` WHERE `s_key` =?;', [setting], cb);
	},
	saveSetting: function( setting, value, cb ) {
		if (!setting) return false;
		bot.connection.query('UPDATE `settings` SET `s_value`=? WHERE `s_key` =?;', [value, setting], cb);
	},
	firstItem: function(obj) {
		return obj[Object.keys(obj)[0]];
	},
	fetchRev: function( revId, cb ) {
		bot.connection.query('SELECT * FROM `processed` WHERE `pd_revid` =?;', [revId], cb);
	},
	saveRev: function( rcid, rctimestamp, status, pageid, revid, details, cb ) {
		bot.connection.query('INSERT IGNORE INTO `processed` (`pd_rcid` ,`pd_rctimestamp`, `pd_status`, `pd_pageid`, `pd_revid`, `pd_details`) VALUES(?, ?, ?, ?, ?, ?);',
							 [rcid, rctimestamp, status, pageid, revid, details], cb);
	},
	savePage: function( pgid, pgtitle, pgns, jshint, cssvalid, esprima, cb ) {
		bot.connection.query('SELECT "1" as `A` FROM `pages` WHERE `pg_id` =?;', [pgid], function(err, results) {
			if (err) {
				cb(err);
			} else {
				if (results.length === 0) {
					bot.connection.query('INSERT IGNORE INTO `pages` (`pg_id` ,`pg_title`, `pg_namespace`, `pg_jshint_status`, `pg_css_validator_status`, `pg_esprima_status`) VALUES(?, ?, ?, ?, ?, ?);',
										[pgid, pgtitle, pgns, jshint, cssvalid, esprima], cb);
				} else {
					bot.connection.query('UPDATE `pages` SET `pg_title`=?, `pg_namespace`=?, `pg_jshint_status`=?, `pg_css_validator_status`=?, `pg_esprima_status`=? WHERE `pg_id` =?;',
										[pgtitle, pgns, jshint, cssvalid, esprima, pgid], cb);
				}
			}
		});
	},
	fetchPages: function( cb, ns )  {
		bot.connection.query('SELECT * FROM `pages` WHERE `pg_namespace` =?;', [ns || 8], cb);
	},
	appendText: function(title, content, summary, callback) {
		var self = bot.client;

		// @see http://www.mediawiki.org/wiki/API:Edit
		self.getToken(title, 'edit', function(token) {
			self.log("Editing " + title + "...");

			self.api.call({
				action: 'edit',
				title: title,
				appendtext: content,
				bot: '',
				summary: summary,
				token: token,
				redirect: 1
			}, function(data) {
				if (data.result && data.result === "Success") {
					callback && callback(data);
				}
				else {
					throw new Error('Edit failed');
				}
			}, 'POST');
		});
	},
	dbCredentials: {
		pass: '',
		user: ''
	},
	setPassAndUserName: function() {
		// Set the dbCredentials
		console.log('Reading passwords.');
		var fs = require('fs'),
			cred = fs.readFileSync('./replica.my.cnf', {
				encoding: 'utf8'
			}),
			arr = cred.split('\n'),
			l, i, line;
			
		for (i = 0, l = arr.length; i < l; ++i) {
			line = arr[i];
			if (/user\s*\=/.test(line)) {
				this.dbCredentials.user = line.replace(/^\s*user\s*=\s*'(.+)'.*/, '$1');
			} else if (/password\s*\=/.test(line)) {
				this.dbCredentials.pass = line.replace(/^\s*pass(?:word)?\s*=\s*'(.+)'.*/, '$1');
			}
		}
	},
	establishDBConnection: function( cb ) {
		this.setPassAndUserName();
		
		var connection = mysql.createConnection( {
			host     : 'tools-db',
			database : 's51886__validator_p',
			user     : this.dbCredentials.user,
			password : this.dbCredentials.pass
		} );
		connection.connect( function( err ) {
			if ( err ) {
				console.log( err );
				bot.exit();
			} else {
				console.log( 'Connected to DB as user ' + bot.dbCredentials.user + '.' );
				bot.connection = connection;
				cb();
			}
		} );
	},
	closeDBConnecton: function( cb ) {
		console.log( 'Connection is being closed. Please stay away from the database.' );
		this.connection.destroy();
		console.log( 'Connection destroyed.' );
		cb && cb();
	},
	runTasks: function( t ) {
		var i, l;
		for (i = 0, l = this.tasks.length; i < l; ++i) {
			t = this.tasks[i];
			console.log( "----------------------------------------" );
			console.log( "Launching \"" + t.name + "\"" );

			var launch = function() {
				try {
					t.code.execute( bot ).done( function() {
						// Nothing
					} );
				} catch (ex) {
					console.log( 'ERR:', ex );
					bot.exit();
				}
			};
			launch();
			setInterval( launch, t.interval );
		}
	},
	exit: function() {
		// use jq deferred ?
		bot.closeDBConnecton( function() {
			bot.logOut( function() {
				process.exit( 1 );
			} );
		} );
	},
	logOut: function( callback ) {
		client.api.call( {
			action: 'logout'
		}, callback || function(){}, 'POST' );
	}
};

bot.launch();
}(nodemw));
