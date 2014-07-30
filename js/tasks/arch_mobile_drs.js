var dateFormat = require('dateformat');
var jqDef      = require('jquery-deferred');
var now	       = new Date();


(function() {
// pass configuration object
var mobArchBot, client;

mobArchBot = {
	version: '0.0.0.1',
	// TODO: Load this config from Commons.
	config: {
		pages: [{
			from: 'Commons:Mobile app/deletion request tracking',
			to: (function() {
				return ('Commons:Mobile app/deletion request tracking/archive/' + dateFormat(now, 'yyyy-W'));
			}()),
			summary: "Archiving mobile uploads deletion request page. Issues with this bot? Contact [[User:Rillke|Rillke]]!",
			newContent: '{{Commons:Mobile app/deletion request tracking/header}}\n'
		}, {
			from: 'Commons:Deletion requests/mobile tracking',
			to: (function() {
				return ('Commons:Deletion requests/mobile tracking/archive/' + dateFormat(now, 'yyyy-W'));
			}()),
			summary: "Archiving mobile uploads deletion request page. Issues with this bot? Contact [[User:Rillke|Rillke]]!",
			newContent: '__TOC__\n[[Category:MobileUpload-related deletion requests archives]]\n'
		}]
	},
	launch: function() {
		console.log('Hi. This is mobile deletion request archive bot.');
		this.nextPage();
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
			console.log("Moved deletion request archives.");
			this.deferred.resolve();
		}
	},
	deferred: null,
	bot: null,
	execute: function( bot ) {
		mobArchBot.bot = bot;
		client = mobArchBot.client = bot.client;
		var $def = mobArchBot.deferred = jqDef.Deferred();
		
		mobArchBot.launch();
		return $def;
	}
};

module.exports = mobArchBot;
}());
