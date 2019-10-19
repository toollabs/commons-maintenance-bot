var dateFormat = require('dateformat');
var jqDef      = require('jquery-deferred');
var request    = require("request")
var now	       = new Date();


(function() {
// pass configuration object
var copyUplDomUpdBot, client;

copyUplDomUpdBot = {
	version: '0.0.0.1',
	// TODO: Load this config from Commons.
	config: {
		page: 'User:CommonsMaintenanceBot/wgCopyUploadsDomains.json',
		summary: 'Updating with data from ',
		source: 'https://tools.wmflabs.org/expose-data/jsonapi.php?action=copyuploadsdomains'
	},
	launch: function() {
		console.log('Hi. This is wgCopyUploadsDomains update bot.');
		setTimeout( function() {
			copyUplDomUpdBot.runUpdate();
		}, 10000 );
	},
	runUpdate: function() {
		request({
			url: copyUplDomUpdBot.config.source,
			json: true,
			headers: {
				'User-Agent': 'CMB Fetch Client - Reporting fraudulent values will be punished.'
			}
		}, function (error, response, body) {
			if (!error && response.statusCode === 200 && body && body.copyuploadsdomains && body.copyuploadsdomains.length ) {
				client.edit(
					copyUplDomUpdBot.config.page,
					JSON.stringify( body.copyuploadsdomains, null, '\t' ),
					copyUplDomUpdBot.config.summary + copyUplDomUpdBot.config.source,
					function() {
						copyUplDomUpdBot.deferred.resolve();
				} );
			} else {
				console.error( error, response );
				copyUplDomUpdBot.deferred.reject();
			}
		});
	},
	deferred: null,
	bot: null,
	execute: function( bot ) {
		copyUplDomUpdBot.bot = bot;
		client = copyUplDomUpdBot.client = bot.client;
		var $def = copyUplDomUpdBot.deferred = jqDef.Deferred();
		
		copyUplDomUpdBot.launch();
		return $def;
	}
};

module.exports = copyUplDomUpdBot;
}());
