/*jshint node:true, expr:true*/
var dateFormat  = require('dateformat');
var jqDef       = require('jquery-deferred');
var $           = require('../lib/jQuery.js');
var now         = new Date();
var oldText     = '';


(function() {
'use strict';
var uug, client, metaClient, cfg,
	ST_OK = 1,
	ST_WARNING = 2,
	ST_ERROR = 3,
	ST_UNKNOWN = 0;

uug = {
	version: '0.0.1.1',
	config: {
		reportPage: 'MediaWiki:Gadget-markAdmins-data.js',
		reportSummary: 'Bot: Updating user group members.'
	},
	changesByRevId: {},
	reportNeedsUpdate: false,
	launch: function() {
		console.log('User group member update here.');
		cfg = uug.config;

		var tasks = [
			this.$fetchCrats,
			this.$fetchAdmins,
			this.$fetchStewards,
			this.$fetchImageReviewers,
			this.$fetchMetaOTRS,
			this.$fetchOversight,
			this.$fetchCU,
			this.$fetchOldText,
			this.$updateReport,
		];

		uug.usersByGroup = {};
		uug.groupsByUsers = {};

		// ECMAScript Language Specification 5.1th Edition (ECMA-262); IE 9
		tasks.reduce(function(current, following) {
			return current.then(following);
		}, jqDef.Deferred().resolve()).then(function() {
			console.log('User group update: okay, all done!');
			uug.deferred.done();
		});
	},
	$fetchFromCommons: function( ug ) {
		var $def = jqDef.Deferred(),
			params = {
				action: 'query',
				list: 'allusers',
				augroup: ug,
				aulimit: 'max'
			};

		uug.client.api.call( params, function( r ) {
			$def.resolve( r );
		}, 'POST' );
		return $def;
	},
	$fetchFromMeta: function( ug ) {
		var $def = jqDef.Deferred(),
			params = {
				action: 'query',
				list: 'globalallusers',
				agugroup: ug,
				agulimit: 'max'
			};

		uug.metaClient.api.call( params, function( r ) {
			$def.resolve( r );
		}, 'POST' );
		return $def;
	},
	evalResultFunction: function( ug, key ) {
		return function( r ) {
			$.each( r[key || 'allusers'], function( i, user ) {
				if (!uug.usersByGroup[ug]) uug.usersByGroup[ug] = [];
				if (!uug.groupsByUsers[user.name]) uug.groupsByUsers[user.name] = [];

				uug.usersByGroup[ug].push( user.name );
				uug.groupsByUsers[user.name].push( ug );
			} );
		};
	},
	$fetchAdmins: function() {
		var ugName = 'sysop';
		return uug.$fetchFromCommons( ugName ).done( uug.evalResultFunction( ugName ) );
	},
	$fetchCrats: function() {
		var ugName = 'bureaucrat';
		return uug.$fetchFromCommons( ugName ).done( uug.evalResultFunction( ugName ) );
	},
	$fetchImageReviewers: function() {
		var ugName = 'Image-reviewer';
		return uug.$fetchFromCommons( ugName ).done( uug.evalResultFunction( ugName ) );
	},
	$fetchOversight: function() {
		var ugName = 'oversight';
		return uug.$fetchFromCommons( ugName ).done( uug.evalResultFunction( ugName ) );
	},
	$fetchCU: function() {
		var ugName = 'checkuser';
		return uug.$fetchFromCommons( ugName ).done( uug.evalResultFunction( ugName ) );
	},
	$fetchStewards: function() {
		var ugName = 'steward';
		return uug.$fetchFromMeta( ugName ).done( uug.evalResultFunction( ugName, 'globalallusers' ) );
	},
	$fetchMetaOTRS: function() {
		var ugName = 'OTRS-member';
		return uug.$fetchFromMeta( ugName ).done( uug.evalResultFunction( ugName, 'globalallusers' ) );
	},
	$fetchOldText: function() {
		var $def = jqDef.Deferred();
		if (oldText) {
			console.log('User group update: Old text stored. Proceeding.');
			$def.resolve();
		} else {
			console.log('User group update: Old text not in store. Fetching.');
			client.getArticle(cfg.reportPage, function(text) {
				oldText = $.trim(text);
				$def.resolve();
			});
		}
		return $def;
	},
	$updateReport: function() {
		var $def = jqDef.Deferred();
		var newText = $.trim('mw.hook(\'userjs.script-loaded.markadmins\').fire(' + uug.sortStringifyJSON( uug.groupsByUsers ) + ');');

		console.log('User group update: Updating report if necessary.');

		if (oldText === newText) {
			$def.resolve();
		} else {
			oldText = newText;
			client.edit(cfg.reportPage, newText, cfg.reportSummary + ' v.' + uug.version, function() {
				$def.resolve();
			});
		}

		return $def;
	},
	sortStringifyJSON: function( data ) {
		var out = [],
			userNames, userName, userGroups,
			i;

		userNames = $.map( data, function( groups, userName ) {
			return userName;
		} );
		userNames.sort();

		for ( i = 0; i < userNames.length; ++i ) {
			userName = userNames[i];
			userGroups = JSON.stringify( data[userName] ).replace( /\n/g, '\n\t' );
			out.push( '\t' + JSON.stringify( userName ) + ': ' + userGroups );
		}
		return '{\n' + out.join( ',\n' ) + '\n}';
	},
	deferred: null,
	bot: null,
	execute: function( bot ) {
		uug.bot = bot;
		client = uug.client = bot.client;
		metaClient = uug.metaClient = bot.metaClient;
		var $def = uug.deferred = jqDef.Deferred();
		
		uug.launch();
		return $def;
	}
};

module.exports = uug;
}());
