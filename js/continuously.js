var nodemw	    = require('nodemw');
var dateFormat	= require('dateformat');
var mysql       = require('mysql')
var now         = new Date();


(function(mwn) {
// pass configuration object
var client = new mwn('.node-bot.config.json');
var bot;

bot = {
	version: '0.0.0.1',
	client: client,
	// Just in case someone gets stuck or leaks memory
	maxRunTime: 1000*60*60*6,
	tasks: [{
		name: 'JSHint MediaWiki and CSS Validate MediaWiki',
		code: require('./tasks/mediawiki_validate.js'),
		maxTime: 50000,
		interval: 60000
	}, {
		name: 'Esprima user scripts',
		code: require('./tasks/user_validate.js'),
		maxTime: 50000,
		interval: 150000
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
		var i, l, t;
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
 
