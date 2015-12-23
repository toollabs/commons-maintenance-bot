var nodemw	= require('nodemw');
var dateFormat	= require('dateformat');
var now = new Date();


(function(bot) {
// pass configuration object
var client = new bot('.node-bot.species.config.json');
var bot;
var errorsAllowed = 5;
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
	version: '0.0.0.1',
	client: client,
	tasks: [{
		name: 'Mirroring autopatrolled candidates',
		code: require('./tasks/mirror_autopatrolled_species.js'),
		maxTime: 50000
	}],
	tasksDone: {},
	launch: function() {
		bot.logOut(function() {
			client.logIn(function() {
				// Make the server creating an editToken for our session.
				// If we do that later while processing multiple pages, the sever
				// would create a lot of different tokens due to replecation lag.
				setTimeout(function() {
					client.api.call({
						action: 'tokens'
					}, function(r) {
						setTimeout(function() {
							bot.nextTask();
						}, 1000);
					});
				}, 1000);
			});
		});

		// Kill myself if running too long
		setTimeout(function() {
			bot.logOut();
			process.exit(1);
		}, 90000);
	},
	processTask: function( t ) {
		console.log( "----------------------------------------" );
		console.log( "Executing \"" + t.name + "\"" );
		
		t.timeout = setTimeout(function() {
			// Task expired ...
			t.nextExecuted = true;
			bot.nextTask();
		}, t.maxTime);
		try {
			t.code.execute( bot ).done( function() {
				clearTimeout(t.timeout);
				if (!t.nextExecuted) bot.nextTask();
			} );
		} catch (ex) {
			clearTimeout(t.timeout);
			if (!t.nextExecuted) bot.nextTask();
		}
	},
	nextTask: function() {
		var tasks = this.tasks;
		if (tasks.length) {
			this.processTask( tasks.pop() );
		} else {
			console.log( "Good bye. Tschüß. Ciao." );
			this.logOut( function() {
				process.exit(0);
			} );
		}
	},
	logOut: function( callback ) {
		// Don't logout currently
		if ( callback ) callback();
		/*client.api.call({
			action: 'logout'
		}, callback || function(){}, 'POST');*/
	}
};

bot.launch();
}(nodemw));
