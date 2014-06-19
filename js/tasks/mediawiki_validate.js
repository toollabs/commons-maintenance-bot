/*jshint node:true, expr:true*/
var dateFormat  = require('dateformat');
var jqDef       = require('jquery-deferred');
var validateCss = require('css-validator');
var prettyCss   = require('PrettyCSS');
var esprima     = require('esprima');
var jshint      = require('jshint');
var $           = require('../lib/jQuery.js');
var now         = new Date();


(function() {
'use strict';
var validator, client, cfg,
	ST_OK = 1,
	ST_WARNING = 2,
	ST_ERROR = 3,
	ST_UNKNOWN = 0;

validator = {
	version: '0.0.0.1',
	config: {
		baseReportDir: 'Commons:User scripts/reports',
		reportSummary: 'Updating validation report'
	},
	changesByRevId: {},
	reportNeedsUpdate: false,
	launch: function() {
		console.log('MediaWiki validate here. Validating MediaWiki pages.');
		cfg = validator.config;

		var tasks = [
			this.$fetchworkUntil,
			this.$queryRecentChanges,
			this.$filterRecentChanges,
			this.$saveRecentChangesLastTimestamp,
			this.$requestPageContents,
			this.$updateReport,
		];
		// ECMAScript Language Specification 5.1th Edition (ECMA-262); IE 9
		tasks.reduce(function(current, following) {
			return current.then(following);
		}, jqDef.Deferred().resolve()).then(function() {
			console.log('okay, all done!');
		});
	},

	dBRecord2TableRow: function(record, i) {
		var status2color = {};
		status2color[ST_OK] = '#6f6';
		status2color[ST_WARNING] = '#ff6';
		status2color[ST_ERROR] = '#f66';
		status2color[ST_UNKNOWN] = '#DDD';

		var status2text = {};
		status2text[ST_OK] = 'okay';
		status2text[ST_WARNING] = 'WARNING';
		status2text[ST_ERROR] = 'ERRORS';
		status2text[ST_UNKNOWN] = '-';

		var getStatusCell = function(status) {
			return '<td style="background:' + status2color[Number(status)] + ';">' + status2text[Number(status)] + '</td>';
		}
		
		return '<tr><td>[[' + record.pg_title + ']], [[' + cfg.baseReportDir  + '/' + record.pg_title +  '|view report]]</td>' +
			getStatusCell(record.pg_jshint_status) +
			getStatusCell(record.pg_css_validator_status) +
			getStatusCell(record.pg_esprima_status) +
			'</tr>';
	},
	$updateReport: function() {
		var $def = $.Deferred();
		if (!validator.reportNeedsUpdate) return $def.resolve();
		validator.reportNeedsUpdate = false;

		validator.bot.fetchPages(function(err, res) {
			if (err) console.log(err);
			var reportPage = 'Script health report for {{SITENAME}}\n<table class="wikitable sortable">\n' +
			'<tr><th>Title</th><th>JSHint</th><th>PrettyCSS</th><th>Esprima</th></tr>' +
			$.map(res, validator.dBRecord2TableRow).join('\n') + '\n</table>\n';
			client.edit(cfg.baseReportDir, reportPage, cfg.reportSummary + ' v.' + validator.version, function() {
				$def.resolve();
			});
		});
		
		return $def;
	},

	$validate: function(rev) {
		var $def = $.Deferred();
		var content = rev['*'];

		if (!content) $def.resolve({});
		
		switch (rev.contentmodel) {
			case 'css':
				console.log("Validating rev." + rev.revid + " as CSS.");

				var prettycssdata = prettyCss.parse(content);
				$def.resolve({
					prettyCss: ( prettycssdata.errors.length + prettycssdata.warnings.length ) ? prettycssdata : true
				});
				
				break;
			case 'javascript':
				console.log("Validating rev." + rev.revid + " as JavaScript.");

				var esprimadata = {};
				var jshintdata = {};
				try {
					esprima.parse(content);
					esprimadata = true;
				} catch (parseError) {
					esprimadata = parseError;
				}
				jshintdata = jshint.JSHINT(content);
				if (jshintdata === false) {
					jshintdata = jshint.JSHINT.data();
				}
				$def.resolve({
					jshint: jshintdata,
					esprima: esprimadata
				});

				break;
			default:
				$def.resolve({});
		}
		return $def;
	},

	parse: {
		esprima: function( errObj ) {
			return {
				status: ST_ERROR,
				report: '<li>ERROR: Cannot parse <code>line ' + errObj.lineNumber + ' column ' + errObj.column + '</code>: <nowiki>' + errObj.description + '</nowiki></li>'
			};
		},
		jshint: function( data ) {
			var report = [];
			$.each(data.errors, function(i, err) {
				if (!err) return;
				report.push('<li>ISSUE: <code>line ' + err.line + ' character ' + err.character + '</code>: <nowiki>' + err.reason + '</nowiki> - Evidence: <code><nowiki>' + err.evidence + '</nowiki></code></li>');
			});
			return {
				status: ST_WARNING,
				report: report.join('\n')
			}
		},
		prettyCss: function( parseResult ) {
			var report = [];
			var push2Report = function(status, obj) {
					var t = obj.token;
					report.push('<li>' + status + ': ' + obj.code + ': ' + '<code>line ' + t.line + ' char number ' + t.charNum + '</code> - Evidence: <code><nowiki>' + t.content + '</nowiki></code></li>');
				},
				pushError = function(i, err) {
					push2Report('ERROR', err);
				},
				pushWarning = function(i, warn) {
					push2Report('WARNING', warn);
				};
			$.each(parseResult.errors, pushError);
			$.each(parseResult.warnings, pushWarning);
			return {
				status: parseResult.errors.length ? ST_ERROR : ST_WARNING,
				report: report.join('\n')
			}
		}
	},
	/**
	 * Updates the page status in the database and at Wikimedia Commons
	 */
	$updatePageStatus: function( pg ) {
		var $def = $.Deferred(),
			report = [];
		
		// 
		var latestRev = pg.revisions[0],
			res = latestRev.validatorResult;
		
		if (!res) {
			// Nothing to update
			return $def.resolve();
		}
		
		validator.reportNeedsUpdate = true;
		var stati = {},
			head = "This is the report page for [[" + pg.title + "]]. It is bot-maintained. All manual changes might be overwritten.\n",
			allOkay = true;

		$.each(res, function(k, v) {
			if ( v === true ) {
				stati[k] = ST_OK;
				console.log( pg.title + ' free of ' + k + ' issues.' );
			} else {
				allOkay = false;
				var parsedErrors = validator.parse[k]( v );
				console.log( pg.title + ' has ' + k + ' issues.' );
				report.push( '== ' + k + ' ==' + '\n<ol>\n' + parsedErrors.report + '</ol>');
				stati[k] = parsedErrors.status;
			}
		});
		
		var text;
		if (allOkay) {
			text = head + '{{speedydelete|1=Code is now free of errors. This page is therefore obsolete.}}';
		} else {
			text = head + report.join('\n');
		}
		client.getArticle(cfg.baseReportDir + '/' + pg.title, function(r) {
			if (!r && allOkay) {
				// Don't do anything
			} else {
				client.edit(cfg.baseReportDir + '/' + pg.title, text, cfg.reportSummary + ' v.' + validator.version, function() {
					console.log('Update to ' + cfg.baseReportDir + '/' + pg.title + ' has been successful.');
					if (allOkay) {
						client.delete(cfg.baseReportDir + '/' + pg.title, 'Clean up. No issues detected.', $.noop);
					}
					console.log('Okay, continue');
				});
			}
			// Just continue updating the DB without waiting...
			validator.bot.savePage(pg.pageid, pg.title, pg.ns, stati['jshint'], stati['prettyCss'], stati['esprima'], function(err, results) {
				if (err) console.log(err);
				$def.resolve();
			});
		});
		return $def;
	},
	evaluate: {
		esprima: function( errObj ) {
			return {
				maxLevel: ST_ERROR,
				count: 1
			};
		},
		jshint: function( data ) {
			return {
				maxLevel: ST_WARNING,
				count: data.errors.length
			}
		},
		prettyCss: function( parseResult ) {
			return {
				maxLevel: parseResult.errors.length ? ST_ERROR : ST_WARNING,
				count: parseResult.errors.length + parseResult.warnings.length
			}
		}
	},
	$processTitleValidationResults: function( pg ) {
		var $def = $.Deferred();
		
		validator.$updatePageStatus( pg ).done(function() {
			var previousRev,
				revs = pg.revisions,
				pendingDBActions = 0,
				pendingEdits = 0,
				notificationsByUser = {};
			
			var decrementAndContinue = function( which ) {
				if (which === 'db') {
					pendingDBActions--;
				} else {
					pendingEdits--;
				}
				if (pendingDBActions === 0 && pendingEdits === 0) {
					$def.resolve();
				}
			};
			$.each(revs, function(i, rev) {
				pendingDBActions++;
				var rChange = validator.changesByRevId[rev.revid] || {},
					status = ST_OK,
					details = {};

				if (rev.validatorResult) {
					$.each( rev.validatorResult, function(k, v) {
						if ( v !== true ) {
							var evaluatedErrors = validator.evaluate[k]( v );
							status = Math.max(status, evaluatedErrors.maxLevel);
							details[k] = evaluatedErrors.count;
						}
					} );
				} else {
					details = JSON.parse( rev.storedResult.pd_details );
					status = Number( rev.storedResult.pd_status );
				}
				// Check whether the change we checked before introduced a new regression
				if (previousRev && previousRev.status > ST_OK && previousRev.validatorResult) {
					// Look for the details
					$.each(previousRev.details, function(k, v) {
						var newIssueCount = (v - ( details[k] || 0));

						if (newIssueCount > 0) {
							console.log('regression found ... user: ' + previousRev.user + ' ... type ... ' + k);

							var parsedErrors = validator.parse[k]( previousRev.validatorResult[k] );
							if (!notificationsByUser[previousRev.user]) {
								notificationsByUser[previousRev.user] = [];
								pendingEdits++
							}
							
							notificationsByUser[previousRev.user]
								.push( {
									message: '{{subst:code-validation-notification' +
										'|status=' + previousRev.status +
										'|title=' + pg.title +
										'|type=' + k +
										'|contentmodel=' + previousRev.contentmodel +
										'|newissuescount=' + newIssueCount +
										'|diff=' + previousRev.revid +
										'|report=' + '\n<ol>\n' + parsedErrors.report + '</ol>\n}}',
									summary: 'Look here, something might be *broken*! Posting validation result. [[Special:Diff/' + previousRev.revid + '|Your change]] to [[' + pg.title + ']] introduced ' + newIssueCount + ' new issues.',
									title: 'User talk:' + previousRev.user
								} );
						}
					});
				}
				
				rev.details = details;
				rev.status = status;
				previousRev = rev;
				validator.bot.saveRev(rChange.rcid || 0, rev.timestamp, status, pg.pageid, rev.revid, JSON.stringify(details), function(err) {
					decrementAndContinue( 'db' );
				});
			});
			// Dispatch messages
			$.each(notificationsByUser, function(user, msgs) {
				var summary, title,
					msg = msgs.reduce(function(prevVal, currVal, idx, arr) {
						summary = currVal.summary;
						title = currVal.title;
						return prevVal + '\n' + currVal.message;
					}, '');

				validator.bot.appendText(title, msg, summary + ' v.' + validator.version, function() {
					decrementAndContinue( 'notification' );
				});
			});
		});
		
		return $def;
	},
	$requestPageContents: function() {
		// Don't use the database (timely action is critical here)
		console.log('requestPageContents');
		var $def = jqDef.Deferred(),
			params = {
				action: 'query',
				prop: 'revisions',
				titles: 'to be replaced',
				rvprop: 'ids|timestamp|user|content',
				rvlimit: 'to be replaced',
				rvstartid: 'to be replaced',
				rvdir: 'older'
			};
		
		var processedTitles = {};
		var processTitle = function( changesOnTitle, title ) {
			// Find latest revid
			var latestRevId = 0;
			$.each(changesOnTitle, function(i, rChange) {
				latestRevId = rChange.revid > latestRevId ? rChange.revid : latestRevId;
			});
			// Set specific params
			// We need one more revision to be able to compare with the status before
			var requestParams = $.extend({}, params, { titles: title, rvlimit: changesOnTitle.length + 1, rvstartid: latestRevId });
			console.log(requestParams);
			validator.client.api.call( requestParams, function( r ) {
				console.log(r);
				if ( !(r && r.pages) ) {
					// Skip page
					return nextTitle();
				}
				
				// Since grouped by title, there should be only one pageId in the result
				var pg = validator.bot.firstItem(r.pages);
				if ( !pg ) {
					return nextTitle();
				}
				
				var revs = pg.revisions;
				if ( !pg.revisions ) {
					return nextTitle();
				}
				
				var pending = 0;
				var decrementAndContinue = function() {
					pending--;
					if (pending === 0) {
						validator.$processTitleValidationResults( pg ).done( nextTitle );
					}
				};
				var oneRev = function(i, rev) {
					// Analyze each revision if not yet in DB
					console.log("Analyzing rev." + rev.revid);
					pending++;
					validator.bot.fetchRev( rev.revid, function(err, results) {
						if (err) {
							pending--;
							$def.reject(err);
						} else {
							var validatorProcessed = results[0];
							rev.storedResult = validatorProcessed;
							if (!validatorProcessed) {
								// New validation is due
								validator.$validate(rev).done(function(result) {
									rev.validatorResult = result;
									decrementAndContinue();
								});
							} else {
								decrementAndContinue();
							}
						}
					} );
				};
				// Iterate over revisions
				$.each(revs, oneRev);
				
			}, 'POST' );
		};
		var nextTitle = function() {
			var title, changesOnTitle;
			for ( title in validator.recentChangesByTitle ) {
				if (processedTitles[title]) continue;
				processedTitles[title] = true;
				changesOnTitle = validator.recentChangesByTitle[title];
				break;
			}
			if (changesOnTitle) {
				processTitle( changesOnTitle, title );
			} else {
				$def.resolve();
			}
		};
		nextTitle();
		return $def;
	},
	$saveRecentChangesLastTimestamp: function() {
		console.log('saveRecentChangesLastTimestamp');
		var $def = jqDef.Deferred();
		validator.bot.saveSetting( 'mediawiki_last_rc_timestamp',  validator.workUntil, function(err, results) {
			if (err) {
				$def.reject(err);
			} else {
				console.log(validator.workUntil);
				$def.resolve();
			}
		} );
		return $def;
	},
	$filterRecentChanges: function() {
		console.log('filterRecentChanges');
		var $def = jqDef.Deferred();
		
		validator.recentChanges = $.grep(validator.recentChanges, function(change, i) {
			// rcend is inclusive
			if (validator.workUntil === change.timestamp) return false;

			// First item is the newest item
			if (i === 0 && change.timestamp) {
				// Set new workUntil date
				validator.workUntil = change.timestamp;
			}

			return (/\.(?:css|js)$/).test(change.title);
		});

		// Group by title
		validator.recentChangesByTitle = {};
		$.each(validator.recentChanges, function(i, change) {
			validator.recentChangesByTitle[change.title] = validator.recentChangesByTitle[change.title] || [];
			validator.recentChangesByTitle[change.title].push(change);
			validator.changesByRevId[change.revid] = change;
		});
		$def.resolve();
		
		return $def;
	},
	recentChanges: null,
	$queryRecentChanges: function() {
		console.log('queryRecentChanges');
		var $def = jqDef.Deferred(),
			params = {
				action: 'query',
				list: 'recentchanges',
				rclimit: 50,
				rcnamespace: 8,
				rcprop: 'user|timestamp|ids|title|flags|tags',
				rcshow: '!bot|!redirect',
				rctype: 'new|edit'
			};

		if (validator.workUntil) params.rcend = validator.workUntil;
		validator.client.api.call(params, function( r ) {
			validator.recentChanges = r.recentchanges;
			$def.resolve( r );
		}, 'POST');
		return $def;
	},
	workUntil: null,
	$fetchworkUntil: function() {
		console.log('setworkUntil');
		var $def = jqDef.Deferred();
		
		if (!validator.workUntil) {
			validator.bot.fetchSetting( 'mediawiki_last_rc_timestamp', function(err, results) {
				if (err) {
					$def.reject(err);
				} else {
					validator.workUntil = results[0].s_value;
					$def.resolve();
				}
			} );
		} else {
			$def.resolve();
		}
		return $def;
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
