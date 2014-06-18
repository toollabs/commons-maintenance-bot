var dateFormat  = require('dateformat');
var jqDef       = require('jquery-deferred');
var wikiDOM     = require('../lib/libWikiDOM.js');
var now         = new Date();
var tomorrow    = (function() {
							var d = new Date();
							d.setHours( now.getHours() + 48 );
							return d;
						}());
var $           = require('../lib/jQuery.js');


(function() {
var watchlistNoticeArchBot, client;

watchlistNoticeArchBot = {
	version: '0.0.0.1',
	config: {
		templateName: 'WatchlistNotice',
		untilRE: /^\s*until\s*=\s*(\d{4}\-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?)/,
		dateFormat: "yyyy-mm-dd hh:MM:ss",
		listing: 'User:Rillke/WLNTest',//MediaWiki:WatchlistNotice
		editSummary: "Bot: Removing expired messages."
	},
	launch: function() {
		console.log('Watchlist notice archive bot here. How can I help you?');
		
		var cfg = watchlistNoticeArchBot.config;
		client.getArticle(cfg.listing, function(text) {
			console.log('Got text, evaluating');
			var newText = watchlistNoticeArchBot.processText(text);
			
			if ($.trim(newText) !== $.trim(text)) {
				console.log('Oh, I see ... food at ' + cfg.listing);
				console.log(newText);
				client.edit(cfg.listing, newText, cfg.editSummary + ' v.' + watchlistNoticeArchBot.version, function() {
					console.log('Tasty. Indeed. Thank you!');
					watchlistNoticeArchBot.deferred.resolve();
				});
			} else {
				console.log('Starving.');
				watchlistNoticeArchBot.deferred.resolve();
			}
		});
	},
	processText: function(txt) {
		var cfg       = watchlistNoticeArchBot.config;
		var page      = wikiDOM.parser.text2Obj(txt);
		var tomorrowS = dateFormat(tomorrow, this.config.dateFormat);

		console.log(tomorrowS);

		var getUntil  = function(tl) {
				var u;
				$.each(tl.parts, function(i, arr) {
					var m = arr[0].match(cfg.untilRE);
					if (m && m[1]) {
						u = m[1];
						return false;
					}
				});
				return u;
			},
			eachWLT = function(templatelist, cb) {
				$.each(templatelist, function(i, tl) {
					if ($.ucFirst(tl.parts[0][0]).replace(/_/g, ' ').indexOf(cfg.templateName) === 0) {
						return cb(i, tl);
					}
				});
			};
			
		eachWLT(page.nodesByType.template, function(i, tl) {
			d = getUntil(tl);
			if (d && d < tomorrowS) {
				// Remove this template
				// TODO: There should be a ``.remove()`` in wikiDOM
				$.each(tl.parent.parts[0], function(i, node) {
					if (node === tl) {
						tl.parent.parts[0][i] = '';
						return false;
					}
				});
			}
		});
		// Finally, clean up superflous new lines and comments
		var consecSpace = 0;
		$.each(page.parts[0], function(i, p) {
			if (p.type === 'comment' || (typeof p === 'string' && '' === $.trim(p))) {
				consecSpace++;
				if (consecSpace > 1) {
					page.parts[0][i] = '';
				}
			} else {
				consecSpace = 0;
			}
		});
		
		return wikiDOM.parser.obj2Text(page);
	},
	deferred: null,
	bot: null,
	execute: function( bot ) {
		watchlistNoticeArchBot.bot = bot;
		client = watchlistNoticeArchBot.client = bot.client;
		var $def = watchlistNoticeArchBot.deferred = jqDef.Deferred();
		
		watchlistNoticeArchBot.launch();
		return $def;
	}
};

module.exports = watchlistNoticeArchBot;
}());
