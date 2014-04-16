(function() {

	var hasOwn = Object.prototype.hasOwnProperty;
	var $ = require('./jQuery.js');
	mw = {
		config: {
			values: {
				wgNamespaceIds: {"media":-2,"special":-1,"":0,"talk":1,"user":2,"user_talk":3,"commons":4,"commons_talk":5,"file":6,"file_talk":7,"mediawiki":8,"mediawiki_talk":9,"template":10,"template_talk":11,"help":12,"help_talk":13,"category":14,"category_talk":15,"creator":100,"creator_talk":101,"timedtext":102,"timedtext_talk":103,"sequence":104,"sequence_talk":105,"institution":106,"institution_talk":107,"campaign":460,"campaign_talk":461,"gwtoolset":490,"gwtoolset_talk":491,"module":828,"module_talk":829,"translations":1198,"translations_talk":1199,"museum":106,"museum_talk":107,"com":4,"image":6,"image_talk":7,"project":4,"project_talk":5},
				wgFormattedNamespaces: {"0":"","1":"Talk","2":"User","3":"User talk","4":"Commons","5":"Commons talk","6":"File","7":"File talk","8":"MediaWiki","9":"MediaWiki talk","10":"Template","11":"Template talk","12":"Help","13":"Help talk","14":"Category","15":"Category talk","100":"Creator","101":"Creator talk","102":"TimedText","103":"TimedText talk","104":"Sequence","105":"Sequence talk","106":"Institution","107":"Institution talk","460":"Campaign","461":"Campaign talk","490":"GWToolset","491":"GWToolset talk","828":"Module","829":"Module talk","-2":"Media","-1":"Special","1198":"Translations","1199":"Translations talk"},
				
			},
			get: function (selection, fallback) {
				"use strict";
				var results, i;
				fallback = arguments.length > 1 ? fallback : null;
				if ($.isArray(selection)) {
					selection = slice.call(selection);
					results = {};
					for (i = 0; i < selection.length; i++) {
						results[selection[i]] = this.get(selection[i], fallback);
					}
					return results;
				}
				if (typeof selection === 'string') {
					if (!hasOwn.call(this.values, selection)) {
						return fallback;
					}
					return this.values[selection];
				}
				if (selection === undefined) {
					return this.values;
				}
				return null;
			}
		}
	};
	module.exports = mw;
}());