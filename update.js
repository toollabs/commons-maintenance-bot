var nodemw = require('nodemw'),
	mysql  = require('mysql');


(function(bot) {
// pass configuration object
var client = new bot('.node-bot.config.json'),
	updateBot;

updateBot = {
	version: '0.0.0.1',
	config: {},
	launch: function() {
		var updater = this;
		console.log('Hi. This is upload updater bot.');
		updater.logOut(function() {
			updater.establishDBConnection(function() {
				client.logIn(function() {
					// Make the server creating an editToken for our session.
					// If we do that later while processing multiple pages, the sever
					// would create a lot of different tokens due to replecation lag.
					setTimeout(function() {
						client.api.call({
							action: 'tokens'
						}, function(r) {
							setTimeout(function() {
									updater.fetchPages();
							}, 1000);
						});
					}, 1000);
				});
			});
		});

		// Kill myself if running too long
		setTimeout(function() {
			updater.logOut();
			process.exit(1);
		}, 90000);
	},
	pages: [],
	pendigPages: 0,
	pendingEdits: 0,
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
		var updater = this;
		this.setPassAndUserName();
		
		var connection = mysql.createConnection({
			host     : 'commonswiki.labsdb',
			database : 'commonswiki_p',
			user     : this.dbCredentials.user,
			password : this.dbCredentials.pass
		});
		connection.connect(function(err) {
			if (err) {
				console.log(err);
			} else {
				console.log('Connected to DB as user ' + updater.dbCredentials.user + '.');
				updater.connection = connection;
				cb();
			}
		});
	},
	uploadCountCache: {},
	getUploadCount: function( username, callback ) {
		var updater = this,
			result = updater.uploadCountCache[username];
			
		if ( result ) return callback( result );


		console.log('Running SQL query.');
		this.connection.query('SELECT count(*) AS count FROM image WHERE img_user_text=? ORDER BY img_timestamp DESC;', username, function(err, result) {
			if (!err) {
				var result = result[0].count;
			};
			result = result || -1;
			updater.uploadCountCache[username] = result;
			callback(result);
		});
	},
	fetchPages: function() {
		var updater = this;

		client.getPagesInCategory('Pages to be updated by UploadStatsBot - alive', function(data) {
			var i, l, d, pgId;
			
			for (i = 0, l  = data.length; i < l; ++i) {
				d = data[i];
				if ( d.ns === 2 ) {
					updater.pages.push( pgId = data[i].pageid );
					updater.processPage( pgId, data[i].title );
				}
			}
			updater.maybeCloseDBConnecton();
		});
	},
	maybeCloseDBConnecton: function() {
		if (this.pendingEdits === 0 && this.pendigPages === 0) {
			console.log('Connection is being closed. Please stay away from the database.');
			this.connection.destroy();
			console.log('Connection closed.');
		}
	},
	maybeExit: function() {
		var updater = this;
		if (updater.exiting) return;

		updater.maybeCloseDBConnecton();
		if (updater.pendingEdits === 0) {
			updater.exiting = true;
			console.info('Bye bye!');
			
			setTimeout(function() {
				updater.logOut(function() {
					process.exit(0);
				});
			}, 1000);
		}
	},
	logOut: function( callback ) {
		client.api.call({
			action: 'logout'
		}, callback || function(){}, 'POST');
	},
	processPage: function(pgId, pgName) {
		var updater = this;

		if (!pgId) return;
		updater.pendigPages++;
		
		client.getArticle(pgId, function(data) {
			updater.pendigPages--;
			console.log('Okay, got page contents for ' + pgName);
			
			if (data.length > 75 || !/\{\{\s*(?:[Tt]emplate\:)?[Uu]ploadStats\/alive\s*\}\}/) {
				// Do not vandalize pages.
				updater.maybeCloseDBConnecton();
				return;
			}
			console.log(pgName + ' has valid content.');
			
			// Fetch upload count of the user
			var username = pgName.replace(/^[^:]+?\:([^\/]+).+/, '$1');
			

			updater.pendingEdits++;
			updater.getUploadCount( username, function(uploadCount) {
				
				console.log('And ' + username + ' has uploaded ' + uploadCount + ' files that are alive.');
				
				client.edit(pgName, '{{UploadStats/alive}}<onlyinclude>' + uploadCount + '</onlyinclude>', 'Bot: Updating upload statistics. Bot version:' + updater.version, function() {
					updater.pendingEdits--;
					console.log('Editing ' + pgName + ': Okay.');
					updater.maybeExit();
				});
			});

			updater.maybeExit();
		});
	}
};

updateBot.launch();
}(nodemw));