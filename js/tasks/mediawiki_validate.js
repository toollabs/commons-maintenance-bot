var dateFormat  = require('dateformat');
var jqDef       = require('jquery-deferred');
var validateCss = require('css-validator');
var esprima     = require('esprima');
var jshint      = require('jshint');
var $           = require('../lib/jQuery.js');
var now         = new Date();


(function() {
var validator, client;

validator = {
	version: '0.0.0.1',
	config: {
		
	},
	launch: function() {
		console.log('MediaWiki validate here. Validating MediaWiki pages.');
		
		this.setworkUntil();
	},
	workUntil: null,
	setworkUntil: function() {
		if (!this.workUntil) {
			this.bot.connection.query('SELECT `s_value` FROM settings WHERE `s_key` = "mediawiki_last_rc_timestamp"', function(err, results) {
				console.log(results)
			});
		}
	},
	deferred: null,
	bot: null,
	execute: function( bot ) {
		validator.bot = bot;
		client = validator.client = bot.client;
		var $def = validator.deferred = jqDef.Deferred();
		
		validator.launch();
		return $def;
	}
};

module.exports = validator;
}());