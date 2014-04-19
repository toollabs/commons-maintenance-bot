var dateFormat  = require('dateformat');
var jqDef       = require('jquery-deferred');
var esprima     = require('esprima');
var $           = require('../lib/jQuery.js');
var now         = new Date();


(function() {
var validator, client;

validator = {
	version: '0.0.0.1',
	config: {
		
	},
	launch: function() {
		console.log('User scripts validate here. Validating User script pages.');
		
		
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