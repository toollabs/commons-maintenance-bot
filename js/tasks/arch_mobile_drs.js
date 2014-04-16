var nodemw	= require('nodemw');
var dateFormat	= require('dateformat');
var now = new Date();


(function(bot) {
// pass configuration object
var client = new bot('.node-bot.config.json'),
	mobArchBot;

mobArchBot = {
	version: '0.0.0.1',
	// TODO: Load this config from Commons.
	config: {
		pages: [{
			from: 'Commons:Mobile app/deletion request tracking',
			to: (function() {
				return ('Commons:Mobile app/deletion request tracking/archive/' + dateFormat(now, 'yyyy-W'));
			}()),
			summary: "Archiving mobile uploads deletion request page.",
			newContent: '{{Commons:Mobile app/deletion request tracking/header}}\n'
		}, {
			from: 'Commons:Deletion requests/mobile tracking',
			to: (function() {
				return ('Commons:Deletion requests/mobile tracking/archive/' + dateFormat(now, 'yyyy-W'));
			}()),
			summary: "Archiving mobile uploads deletion request page.",
			newContent: '__TOC__\n[[Category:MobileUpload-related deletion requests archives]]\n'
		}]
	},
	launch: function() {
		var mobArchiver = this;
		console.log('Hi. This is mobile deletion request archive bot.');
		mobArchiver.logOut(function() {
			client.logIn(function() {
				// Make the server creating an editToken for our session.
				// If we do that later while processing multiple pages, the sever
				// would create a lot of different tokens due to replecation lag.
				setTimeout(function() {
					client.api.call({
						action: 'tokens'
					}, function(r) {
						setTimeout(function() {
							mobArchiver.nextPage();
						}, 1000);
					});
				}, 1000);
			});
		});

		// Kill myself if running too long
		setTimeout(function() {
			mobArchiver.logOut();
			process.exit(1);
		}, 90000);
	},
	processPage: function( pg ) {
		var mobArchiver = this;

		// First, move page
		console.log("Moving " + pg.from + " " + pg.to);
		client.move( pg.from, pg.to, pg.summary, function() {
			// Then, replace the redirect with the default content
			client.edit( pg.from, pg.newContent, pg.summary, function() {
				mobArchiver.nextPage();
			} );
		} );
	},
	nextPage: function() {
		var pgs = this.config.pages;
		if (this.config.pages.length) {
			this.processPage( pgs.pop() );
		} else {
			console.log("Good night.");
			this.logOut(function() {
				process.exit(0);
			});
		}
	},
	logOut: function( callback ) {
		client.api.call({
			action: 'logout'
		}, callback || function(){}, 'POST');
	}
};

mobArchBot.launch();
}(nodemw));
