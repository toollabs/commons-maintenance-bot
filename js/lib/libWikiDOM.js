/**
 * [[MediaWiki:Gadget-libWikiDOM.js]]
 *
 * WikiDOM will parse one page's wikitext
 * and creates an object with properties
 * representing the "nodes" or "tokens" like
 * Templates and their parameters, plain text,
 * Internal and External Links, Files
 * 
 * It does *not* attempt to transform the wikitext
 * to HTML (? api action=parse or index.php action=render)
 *
 * It also provides easy ways for manipulating the wikitext
 * like replacing only areas that aren't comments or nowikis
 *
 * @rev 1 (2012-11-26)
 * @rev 2 (2013-06-13) Added DOM parser
 * @rev 3 (2014-04-16) Node.js integration
 * @author Rillke, 2012
 * @author [[:de:Benutzer:P.Copp]], 2009
 */
// List the global variables for jsHint-Validation. Please make sure that it passes http://jshint.com/
// Scheme: globalVariable:allowOverwriting[, globalVariable:allowOverwriting][, globalVariable:allowOverwriting]
/*global mediaWiki:false, module:false, require:false, jQuery:false*/

// Set jsHint-options. You should not set forin or undef to false if your script does not validate.
/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true, strict:true, undef:true, curly:false, browser:true, smarttabs:true*/

(function() {
	"use strict";
	
	var $;
	if (typeof jQuery === 'undefined') {
		$ = require('./jQuery.js');
	} else {
		$ = jQuery;
	}
	
	var mw;
	if (typeof mediaWiki === 'undefined') {
		mw = require('./mediaWiki.js');
	} else {
		mw = mediaWiki;
	}

	var wikiDOM;

	wikiDOM = {
		/**
		 *  A powerful and easily extensible way to preserve certain areas during (regex-)?replaces
		 *  (c) 2012 Rainer Rillke, License: GPL, Documentation: GFDL
		 *
		 * @constructormethod
		 *   @example
		 *      var nwe1 = mw.libs.wikiDOM.nowikiEscaper(pageText1);
		 *      var nwe2 = mw.libs.wikiDOM.nowikiEscaper(pageText2);
		 *   @description
		 *      You can pass an initial text to the object-function. 
		 *      The return value is an object. Perform all actions on the returned object!
		 *
		 * @methods
		 * -getText()
		 *   @example var newPageText = nwe.getText()
		 *   @description -> retrieves the stored text
		 *
		 * -setText(pageText)
		 *   @example nwe.setText(pageText) 
		 *   @description -> set a new text; overrides the old content
		 *
		 * -secureReplace(pattern, replace)
		 *   @example nwe.secureReplace(pattern, replace)
		 *   @description -> replace the pattern with replace; securely preserve nowikis
		 *
		 * -ordinaryReplace(pattern, replace)
		 *   @example nwe.ordinaryReplace('<!-- Comment to remove -->', '')
		 *   @description -> do an ordinary javaScript replace
		 *
		 * -replace(pattern, replace)
		 *   @example nwe.replace(/(.)abc(.)/, '$2abc$1')
		 *   @description -> replace the pattern with replace; allow extended use of substring () and $1..$9
		 *
		 * -doCleanUp(pattern, replace)
		 *   @example nwe.doCleanUp()
		 *   @description -> clean up the stored text
		 *
		 * -alsoPreserve(regexp)
		 *   @example nwe.alsoPreserve('(<gallery>(?:.|\n)*?<\/gallery>)')
		 *   @description -> allows preserving other areas than just the predefined ones
		 *
		 **/
		nowikiEscaper: function(inputText) {
			// Private
			// Data-variables
			var // The text is always kept up-to-date and contains the actual wikitext
			_text = inputText || '',
				// Contains the text where <nowikis> have been replaced by a placeholder
				placeholderText = '',
				// Contains the stripped nowikis from placeholderText
				nowikis = {},
				// An array of objects [{ preserve: bool, text: textfragment }, ... ]
				fragmentedText = [],
				// If the fragments are altered and this is not reflected in the placeholderText yet
				fragmentsAreDirty = false,
				// If the placeholderText is altered and this is not reflected in the fragmentedText yet
				placeholderTextDirty = false,
				// If the text was manipulated and this is not reflected in the "escaped" texts yet
				textDirty = false;

			// Constants
			// The order is important here in cases where they match the same, the fist will be used
			var reToPreserve = [
					/(<nowiki>(?:.|\n)*?<\/nowiki>)/i,
					/(<source [^\>]*>(?:.|\n)*?<\/source>)/i,
					/(<pre>(?:.|\n)*?<\/pre>)/i,
					/(<syntaxhighlight [^\>]*>(?:.|\n)*?<\/syntaxhighlight>)/i,
					/(<templatedata[^\>]*>(?:.|\n)*?<\/templatedata>)/i,
					/(<\!\-\-\s*categories\s*by\s*commonsense\s*\-\->)/i,
					/(<!\-\-(?:.|\n)*?\-\->)/
			];

			var reToPreservePattern = /^\s*(\/\(\)\/)\s*$/;

			// Functions
			var noMatchToInfinity = function(pos) {
				if (-1 === pos) return Infinity;
				return pos;
			};
			var eachPosition = function(text, fn) {
				while (text) {
					/*jshint loopfunc:true*/
					var arrPos = [];
					$.each(reToPreserve, function(i, regex) {
						arrPos.push(noMatchToInfinity(text.search(regex)));
					});
					text = fn(text, arrPos);
				}
			};
			var nearestMatch = function(paramArray) {
				var validArgs = [],
					a = paramArray.length - 1;

				for (; a >= 0; a--) {
					if (-1 !== paramArray[a]) validArgs.push(paramArray[a]);
				}
				// If validArgs.length is 0, Infinity (the biggest number possible) is returned
				return Math.min.apply(window, validArgs);
			};
			var buildFragmentsFromText = function() {
				fragmentedText = [];
				eachPosition(_text, function(text, arrPos) {
					var nearestPos = nearestMatch(arrPos);
					if (0 !== nearestPos) {
						// Slice until this position
						fragmentedText.push({
							preserve: false,
							text: text.slice(0, nearestPos)
						});
						return text.slice(nearestPos);
					} else {
						var newText;
						$.each(arrPos, function(i, pos) {
							if (0 === pos) {
								newText = text.replace(reToPreserve[i], '');
								fragmentedText.push({
									preserve: true,
									text: RegExp.$1
								});
								return false;
							}
						});
						return newText;
					}
				});
				return fragmentedText;
			};
			var buildPlaceholderText = function() {
				placeholderText = '';
				eachPosition(_text, function(text, arrPos) {
					var nearestPos = nearestMatch(arrPos);
					if (0 !== nearestPos) {
						// Slice until this position
						placeholderText += text.slice(0, nearestPos);
						return text.slice(nearestPos);
					} else {
						var newText, rdm = '%v%f%c%' + Math.round(Math.random() * 68719476736) + '%V%F%C%';
						$.each(arrPos, function(i, pos) {
							if (0 === pos) {
								newText = text.replace(reToPreserve[i], '');
								placeholderText += rdm;
								nowikis[rdm] = RegExp.$1;
								return false;
							}
						});
						return newText;
					}
				});
				return placeholderText;
			};
			var fragmentsToText = function() {
				_text = '';
				$.each(fragmentedText, function(i, fragmentObj) {
					_text += fragmentObj.text;
				});
				return _text;
			};
			var placeholderTextToText = function() {
				_text = placeholderText;
				$.each(nowikis, function(id, nowikiContent) {
					_text = _text.replace(id, nowikiContent);
				});
				return _text;
			};
			var updateFragments = function() {
				_text = placeholderTextToText();
				placeholderTextDirty = false;
				return buildFragmentsFromText();
			};
			var updatePlaceholderText = function() {
				_text = fragmentsToText();
				fragmentsAreDirty = false;
				return buildPlaceholderText();
			};
			var updateEscapedText = function() {
				buildFragmentsFromText();
				buildPlaceholderText();
				textDirty = false;
			};
			if (_text) {
				textDirty = true;
			}

			// Public interface
			return {
				setText: function(text) {
					_text = text;
					placeholderTextDirty = false;
					fragmentsAreDirty = false;
					textDirty = true;
				},
				getText: function() {
					if (placeholderTextDirty) placeholderTextToText();
					if (fragmentsAreDirty) fragmentsToText();
					return _text;
				},
				secureReplace: function(pattern, replace) {
					if (textDirty) updateEscapedText();
					if (placeholderTextDirty) updateFragments();
					$.each(fragmentedText, function(i, fragmentObj) {
						if (fragmentObj.preserve) return;
						fragmentObj.text = fragmentObj.text.replace(pattern, replace);
					});
					fragmentsAreDirty = true;
					return this;
				},
				ordinaryReplace: function(pattern, replace) {
					if (fragmentsAreDirty) updatePlaceholderText();
					if (placeholderTextDirty) updateFragments();
					_text = _text.replace(pattern, replace);
					textDirty = true;
					return this;
				},
				replace: function(pattern, replace) {
					if (textDirty) updateEscapedText();
					if (fragmentsAreDirty) updatePlaceholderText();
					placeholderText = placeholderText.replace(pattern, replace);
					placeholderTextDirty = true;
					return this;
				},
				alsoPreserve: function(regex) {
					if ('object' === typeof regex && regex.test) {
						reToPreserve.push(regex);
						return true;
					} else if ('string' === typeof regex) {
						var m = regex.match(reToPreservePattern);
						if (m && m[1]) {
							reToPreserve.push(new RegExp(m[1]));
							return true;
						}
					}
				},
				doCleanUp: function() {
					var i, l, rules = wikiDOM.cleanUpRules;
					for (i = 0, l = rules.length; i < l; ++i) {
						var rule = rules.headings[i],
							find = rule[0],
							regex = new RegExp('==\\s*[' + find.charAt(0).toUpperCase() + find.charAt(0).toLowerCase() + ']' + find.slice(1) + '\\s*==', '');

						this.secureReplace(regex, rule[1]);
					}
					for (i = 0, l = rules.wild.length; i < l; ++i) {
						this.secureReplace(rules.wild[i][0], rules.wild[i][1]);
					}
					return this.getText();
				}
			};
		},
		cleanUpRules: {
			// Rules can be found at [[Commons:File description page regular expressions]]
			headings: [
				//['Summary', '{{int:filedesc}}'],
				//['Beschreibung', '{{int:filedesc}}'],
			],
			// Rules picked from https://commons.wikimedia.org/w/index.php?title=Commons:File_description_page_regular_expressions&oldid=80416934
			wild: [
				[/(\n)?==[ ]*(?:summary|sumario|descri(?:ption|pción|ção do arquivo)|achoimriú)(?:[ ]*\/[ ]*(?:summary|sumario|descri(?:ption|pción|ção do arquivo)|achoimriú))?[ ]*==/i,
						'$1== {{int:filedesc}} =='
				],
				[/\n==[ ]*(?:\[\[.*?\|)?(?:licen[cs](?:e|ing|ia)(?:[ ]*\/[ ]*licen[cs](?:e|ing|ia))?|\{\{int:license\}\})(?:\]\])?:?[ ]*==/i,
						'\n== {{int:license-header}} =='
				],
				[/\n==[ ]*(?:original upload (?:log|history)|file history|ursprüngliche bild-versionen)[ ]*==/i, '\n== {{original upload log}} =='],
				[/(\|[ ]*permission[ ]*=)\s*(?:-|see(?: licens(?:e|ing))?(?: below)?|yes|oui)\.?[ ]*(\||\}\}|\r|\n)/i, '$1$2'],
				[/(\|[ ]*other[_ ]versions\s*=)[ ]*(?:<i>)?(?:-|no|none?(?: known)?)\.?(?:<\/i>)?[ ]*(\||\}\}|\r|\n)/i, '$1$2'],
				[/(\|[ ]*date[ ]*=\s*)(?:created|made|taken)?[ ]*([0-9]{4})(-| |\/|\.|)(0[1-9]|1[0-2])\3(1[3-9]|2[0-9]|3[01])(\||\}\}|\r|\n)/i, '$1$2-$4-$5$6'],
				[/(\|[ ]*date[ ]*=\s*)(?:created|made|taken)?[ ]*([0-9]{4})(-| |\/|\.|)(1[3-9]|2[0-9]|3[01])\3(0[1-9]|1[0-2])(\||\}\}|\r|\n)/i, '$1$2-$5-$4$6'],
				[/(\|[ ]*date[ ]*=\s*)(?:created|made|taken)?[ ]*(0[1-9]|1[0-2])(-| |\/|\.|)(1[3-9]|2[0-9]|3[01])\3([0-9]{4})(\||\}\}|\r|\n)/i, '$1$5-$2-$4$6'],
				[/(\|[ ]*date[ ]*=\s*)(?:created|made|taken)?[ ]*(1[3-9]|2[0-9]|3[01])(-| |\/|\.|)(0[1-9]|1[0-2])\3(2[0-9]{3}|1[89][0-9]{2})(\||\}\}|\r|\n)/i, '$1$5-$4-$2$6'],
				[/(\|[ ]*date[ ]*=\s*)(?:created|made|taken)?[ ]*\{\{date\|([0-9]{4})\|(0[1-9]|1[012])\|(0?[1-9]|1[0-9]|2[0-9]|3[01])\}\}(\||\}\}|\r|\n)/i,
						'$1$2-$3-$4$5'
				],
				[/__[ ]*NOTOC[ ]*__/, ''],
				[/(<!--)?[ ]*\{\{ImageUpload\|(?:full|basic)\}\}[ ]*(-->)?[ ]*\n?/, ''],
				[/[ ]*\[\[category[ ]*:[ ]*([^\]]*?)[ ]*(\|[^\]]*)?\]\][ ]*/, '[[Category:$1$2]]']
			]
		},
		
		// mw.Title does not work for stuff like "information\n"
		normalizeTitle: function(t) {
			return $.ucFirst($.trim(t.replace(/_/g, ' ')));
		},
		
		/**
		 * Normalize a template transclusion.
		 *
		 * @param {string} t
		 *  any transcluded template (e.g. 'Template:Abc\n' or 'abc '
		 * @return {string} normalized result (e.g. 'Abc')
		 */
		normalizeTemplateTransclusion: function(t) {
			var split = wikiDOM.normalizeTitle(t).split(':'),
				templateNS = wikiDOM.getNamespaceNumber('template'),
				maybeNS, shifted;
			switch (split.length) {
				case 0:
					return '';
				case 1:
					return split[0];
				default:
					maybeNS = split[0].toLowerCase().replace(/ /g, '_');
					$.each(mw.config.get('wgNamespaceIds'), function(key, n) {
						if (maybeNS === key && n === templateNS) {
							split.shift();
							shifted = true;
							return false;
						}
					});

					// Assume that the first part is a namespace
					if (!shifted) wikiDOM.normalizeTitle(split[1]);
					
					return wikiDOM.normalizeTitle(split.join(':'));
			}
		},
		
		/**
		 * Normalize a link (mostly useful for files and categories)
		 *
		 * @param {string} l
		 *  Any link (without the square-brackets) (e.g. 'Image:a.png')
		 * @return {string} normalized result (e.g. 'File:A.png')
		 */
		normalizeLink: function(l) {
			var split = wikiDOM.normalizeTitle(l).split(':'),
				ns, escape = '';
				
			switch (split.length) {
				case 0:
					return '';
				case 1:
					return split[0];
				default:
					if (!split[0]) {
						escape = ':';
						split.shift();
					}
					try {
						split[0] = wikiDOM.getLocalizedNamespace(split[0]);
						ns = split.shift();
						split = [ns, wikiDOM.normalizeTitle(split.join(':'))];
					} catch(ex) {}
					return escape + split.join(':');
			}
		},
		
		/**
		 * Namespace number from namespace-string.
		 *
		 * @param {string} ns Namespace
		 * @return {number} Namespace number
		 */
		getNamespaceNumber: function(ns) {
			return mw.config.get('wgNamespaceIds')[ns.toLowerCase().replace(/ /g, '_')];
		},

		/**
		 * Namespace in content language from any
		 * namespace alias.
		 *
		 * @param {string} ns Namespace
		 * @return {string} Namespace in content language
		 */
		getLocalizedNamespace: function(ns) {
			return mw.config.get('wgFormattedNamespaces')[ wikiDOM.getNamespaceNumber(ns) ];
		},
		
		
		/**
		 * @description
		 * mw.libs.wikiDOM.parser
		 *
		 *
		 * @methods
		 *   -text2Obj(wikiMarkup, forInclusion)
		 *   @param {string} wikiMarkup
		 *   @param {boolean} forInclusion [optional]
		 *   @return {Node} 
		 *
		 *   -obj2Text(Node)
		 *   @param {Node} A wikiDOM node that will be converted to a plain String.
		 *   @return {string} wikiMarkup
		 *
		 *
		 * @example
		    // parse into a DOMObject
		    var o = mw.libs.wikiDOM.parser.text2Obj( $('#wpTextbox1').val() );
		 
		    // manipulate the object
		    o.parts[0][2].parts[1][0] = "other text";
			 o.parts[0][2].after("text");
		 
		    // convert the DOMObject back to a string of raw wikitext
		    $('#wpTextbox1').val( mw.libs.wikiDOM.parser.obj2Text(o) );
		 *
		 *
		 The root node object has the following structure:
			{
				nodesByType: {
					nodetype: []
				},
				type: 'root',
				parts: [
					[node, string, string, node, ...]
				]
			}
			
		 Only the root node has the list "nodesByType"
		 This is how a node object looks like:
		 
			{
				len: number,
				lineStart: boolean,
				linktype: 'category'|'file',
				offset: number,
				parent: Node,
				parts: [[ Array of nodes and Strings ]],
				type: 'root'|'link'|'template'|'tplarg'|'h'|'comment'|'ignore'|'ext',
				extname: 'name', //only for ext nodes
				index, level : int, //only for heading nodes
				
				// Manipulation functions:
				after: function(String or Node){},
				before: function(String or Node){},
				append: function(String or Node){},
				prepend: function(String or Node){},
				insert: function(String or Node, Offset){}
			}
			// where link is everything [[enclosed by square brackets]], {{template}}, {{{tplarg}}}, h is a heading,
			// c a <!-- comment -->, ext an extension tag with content 
			
		 * Note that after using one of the manipulation functions, 
		 * the values len and offset may be wrong
		 *
		 *
		 * Files and Categories are reported as links but linktype specifies of what
		 * subtype they are.
		 * 
		 * The content of Extensiontags (ext) is not analyzed or parsed.
		 *
		 *
		 * preprocessor.js
		 * Wikitext preprocessor, based on MediaWiki's parser (Preprocessor_DOM.php r55795)
		 * http://svn.wikimedia.org/viewvc/mediawiki/trunk/phase3/includes/parser/Preprocessor_DOM.php
		 *
		 *
		 * @source
		 * Derivative work of https://de.wikipedia.org/w/index.php?curid=4150203&oldid=68296956
		 * [[:de:Benutzer:P.Copp/scripts/preprocessor.js]]
		 * which is in turn a port of the MediaWiki preprocessor to JavaScript
		 * Copyright by Benutzer:P.Copp at German Wikipedia and contributors to MediaWiki
		 * GPL, GFDL
		 */
		parser: (function() {

			var extensiontags = ['categorytree', 'charinsert', 'hiero', 'imagemap', 'inputbox',
					'languages', 'poem', 'ref', 'references', 'source', 'syntaxhighlight', 'timeline', 'templatedata'
			],
				defaulttags = ['nowiki', 'gallery', 'math', 'pre', 'noinclude', 'includeonly', 'onlyinclude'],
				nsIds = mw.config.get('wgNamespaceIds'),
				generateRE = function(nsId) {
					var nsTokens = [];
					$.each(nsIds, function(k, id) {
						if (nsId === id) {
							k = '[' + $.escapeRE(k.charAt(0).toUpperCase()) + $.escapeRE(k.charAt(0).toLowerCase()) + ']' + $.escapeRE(k.slice(1)).replace(/_/g, '[ _]');
							nsTokens.push(k);
						}
					});
					return new RegExp('^(?:' + nsTokens.join('|') + ')\\:');
				},
				linktypes = {
					category: generateRE(nsIds.category),
					file: generateRE(nsIds.file)
				};

			/**************************************************************************************************
			 * text2Obj()
			 *
			 * Turns a wikitext string into a document tree
			 * The returned data structure is a bit more compact than a real XML DOM, so
			 * some memory is saved, when the extra stuff is not needed.
			 *
			 * The returned object has the following structure:
			 * domnode = {
			 *     type  : ('root'|'link'|'template'|'tplarg'|'h'|'comment'|'ignore'|'ext'),
			 *     offset: int,
			 *     len   : int,
			 *     parts : [  [('text'|node)*],  ...  ],
			 *     index, level : int, //only for heading nodes
			 *     extname: 'name', //only for ext nodes
			 * }
			 *
			 * Dependencies: extensiontags, defaulttags
			 */
			var text2Obj = function(text, forInclusion) {
				if (text === false) return text;


				//DOM Node
				var Node = function(type, offset, content, count) {
					this.type = type;
					this.offset = offset;
					this.parts = [
						[]
					];
					this.linktype = '';

					// Some node types are not properly specified at this time
					if (type !== '[' && type !== '{') {
						nodesByType[type] = nodesByType[type] || [];
						nodesByType[type].push(this);
					}

					//cur and count are only for internal processing.
					//They will be cleaned up later by finish()
					this.cur = this.parts[0];
					if (content) add(this, content);
					if (count) this.count = count;
				};

				// Note that these methods invalidate the offset etc.
				Node.prototype = $.extend(Node.prototype, {
					append: function(x) {
						var t = this;
						if ('root' === t.type) {
							t.parts[0].push(x);
						} else {
							t.parts.push([x]);
						}
						return t;
					},
					prepend: function(x) {
						var t = this;
						if ('root' === t.type) {
							t.parts[0].unshift(x);
						} else {
							t.parts.unshift([x]);
						}
						return t;
					},
					after: function(x) {
						return this.insert(x, 1);
					},
					before: function(x) {
						return this.insert(x, 0);
					},
					insert: function(x, offset) {
						var t = this,
							p = t.parent;

						// Error: Cannot insert before or after root node
						if (!p) return false;

						var pplen = p.parts.length,
							i, pi, pilen;

						for (i = 0; i < pplen; i++) {
							pi = p.parts[i];
							// Don't loop over Strings!
							if (!$.isArray(pi)) return;
							pilen = pi.length;
							
							for (var idx = 0; idx < pilen; idx++) {
								var el = pi[idx];
								if (el === t) {
									pi.splice(idx + offset, 0, x);
									return this;
								}
							}
						}
						return false;
					}
				});

				var lastindex = 0,
					stack = [],
					nodesByType = {},
					top = new Node('root', 0),
					headings = 0,
					skipnewline = false,
					tag = null,
					enableonlyinclude = false,
					search = false,
					match;

				//Line 145-156
				if (forInclusion && text.indexOf('<onlyinclude>') > -1 && text.indexOf('</onlyinclude>') > -1) {
					enableonlyinclude = true;
					tag = new Node('ignore', 0);
					search = /<onlyinclude>|^$/;
				}
				var ignoredtag = forInclusion ? /includeonly/i : /noinclude|onlyinclude/i;
				var ignoredelement = forInclusion ? 'noinclude' : 'includeonly';

				//Construct our main regex
				var tags = '(' + defaulttags.concat(extensiontags).join('|') + ')';
				var specials = '\\{\\{+|\\[\\[+|\\}\\}+|\\]\\]+|\\||(\n)(=*)|(^=+)';
				var regex = new RegExp(specials + '|<' + tags + '(?:\\s[^>]*)?\\/?>|<\\/' + tags + '\\s*>|<!--|-->|$', 'ig');

				while (!!(match = regex.exec(text))) {
					var s = match[0];

					//If we're in searching mode, skip all tokens until we find a matching one
					if (search) {
						if (s.match(search)) {
							search = false;
							if (tag.type !== 'comment') {
								add(tag, text.substring(lastindex, match.index));
								lastindex = match.index + s.length;
								if (tag.type !== 'ignore') tag.parts.push(tag.cur = []);
								add(tag, s);
								processToken('tag', finish(tag, match.index + s.length));
							}
						}
						continue;
					}

					if (s === '<!--') { //Comment found
						var span = getCommentSpan(match.index);
						processToken('text', text.substring(lastindex, span[0]));
						lastindex = span[1];
						tag = new Node('comment', span[0], text.substring(span[0], span[1]));
						processToken('tag', finish(tag, span[1]));
						search = /-->|^$/;
						//If we put a trailing newline in the comment, make sure we don't double output it
						if (text.charAt(span[1] - 1) === '\n') skipnewline = true;
						continue;
					}

					//Process all text between the last and the current token
					if (match.index > lastindex)
						processToken('text', text.substring(lastindex, match.index));
					lastindex = match.index + s.length;
					if (!s) break; //End of text

					if (match[1] || match[3]) { //Line start/end
						if (skipnewline || match[3]) skipnewline = false;
						else {
							processToken('lineend', '', match.index);
							processToken('text', '\n');
						}
						//processToken( 'linestart' );
						if (match[2] || match[3])
							processToken('=', match[2] || match[3], match.index + (match[1] ? 1 : 0));
						continue;
					}

					if (match[4]) { //Open <tag /?> found
						if (match[4].match(ignoredtag)) {
							processToken('tag', finish(new Node('ignore', match.index, s), lastindex));
							continue;
						}
						var lc = match[4].toLowerCase();
						if (lc === 'onlyinclude') {
							//This can only happen, if we're in template mode (forInclusion=true) and
							//the token we found is sth. like '<ONLYINCLUDE >'(i.e. unusual case or whitespace)
							//Output it literally then, to match MediaWiki's behavior
							processToken('text', s);
						} else {
							if (lc === ignoredelement) tag = new Node('ignore', match.index, s);
							else {
								tag = new Node('ext', match.index, s);
								tag.extname = lc;
							}
							if (s.charAt(s.length - 2) === '/') {
								//Immediately closed tag (e.g. <nowiki />)
								processToken('tag', finish(tag, match.index + s.length));
							} else {
								//Search for the matching closing tag
								search = new RegExp('<\\/' + lc + '\\b|^$', 'i');
								//For ext nodes, we split the opening tag, content and closing tag into
								//separate parts. This is to simplify further processing since we already have
								//the information after all
								if (lc !== ignoredelement) tag.parts.push(tag.cur = []);
							}
						}
						continue;

					} else if (match[5]) { //Close </tag> found
						if (match[5].match(ignoredtag)) {
							processToken('ignore',
								finish(new Node('ignore', match.index, s), lastindex));
						} else if (enableonlyinclude && s === '</onlyinclude>') {
							//For onlyinclude, the closing tag is the start of the ignored part
							tag = new Node('ignore', match.index, s);
							search = /<onlyinclude>|^$/;
						} else {
							//We don't have a matching opening tag, so output the closing literally
							processToken('text', s);
						}
						continue;
					} else if (s === '-->') { //Comment endings without openings are output normally
						processToken('text', s);
						continue;
					}
					//Special token found: '|', {+, [+, ]+, }+
					var ch = s.charAt(0);
					processToken(ch, s, match.index);
				}
				//End of input. Put an extra line end to make sure all headings get closed properly
				processToken('lineend', text.length);
				processToken('end', text.length);
				postProcess();

				return stack[0];

				function postProcess() {
					var lts = linktypes;
					nodesByType.link = nodesByType.link || [];
					$.each(nodesByType.link, function(i, n) {
						for (var lt in lts) {
							if (lts.hasOwnProperty(lt)) {
								var re = lts[lt];
								if (n.parts[0] && re.test(n.parts[0])) {
									n.linktype = lt;
									nodesByType[lt] = nodesByType[lt] || [];
									nodesByType[lt].push(n);
									break;
								}
							}
						}
					});
					stack[0].nodesByType = nodesByType;
				}

				//Handle some token and put it in the stack

				function processToken(type, token, offset) {
					var next, len;
					
					switch (type) {
						case 'text':
						case 'ignore':
						case 'tag':
							return add(top, token);
						case 'lineend': //Check if we can close a heading
							if (top.type === 'h') {
								next = stack.pop();
								if (top.closing) {
									//Some extra info for headings
									top.index = ++headings;
									top.level = Math.min(top.count, top.closing, 6);
									add(next, finish(top, offset));
								} else {
									//No correct closing, break the heading and continue
									addBrokenNode(next, top);
								}
								top = next;
							}
							return;
						case '=':
							//Check if we can open a heading
							len = token.length;
							//Line 352-355: Single '=' within a template part isn't treated as heading
							if (len === 1 && top.type === '{' && top.parts.length > 1 && top.cur.splitindex === undefined) {
								add(top, token);
							} else {
								stack.push(top);
								top = new Node('h', offset, token, len);
								//Line 447-455: More than two '=' means we already have a correct closing
								top.closing = Math.floor((len - 1) / 2);
							}
							return;
						case '|':
							//For brace nodes, start a new part
							if (top.type === '[' || top.type === '{') top.parts.push(top.cur = []);
							else add(top, token);
							return;
						case '{':
						case '[':
							stack.push(top);
							top = new Node(type, offset, '', token.length);
							return;
						case '}':
						case ']':
							//Closing brace found, try to close as many nodes as possible
							var open = type === '}' ? '{' : '[';
							len = token.length;
							while (open === top.type && len >= 2) {
								while (len >= 2 && top.count >= 2) {
									//Find the longest possible match
									var mc = Math.min(len, top.count, open === '{' ? 3 : 2);
									top.count -= mc;
									len -= mc;
									//Record which type of node we found
									if (open === '{') top.type = mc === 2 ? 'template' : 'tplarg';
									else top.type = 'link';

									nodesByType[top.type] = nodesByType[top.type] || [];
									nodesByType[top.type].push(top);

									if (top.count >= 2) {
										//if we're still open, create a new parent and embed the node there
										var child = top;
										top = new Node(open, child.offset, child, child.count);
										//Correct the child offset by the number of remaining open braces
										child.offset += top.count;
										finish(child, offset + token.length - len);
									}
								}
								if (top.count < 2) {
									//Close the current node
									next = stack.pop();
									//There might be one remaining brace open, add it to the parent first
									if (top.count === 1) add(next, open);
									top.offset += top.count;
									add(next, finish(top, offset + token.length - len));
									top = next;
								}
							}
							//Remaining closing braces are added as plain text
							if (len) add(top, (new Array(len + 1)).join(type));
							return;
						case 'end':
							//We've reached the end, expand any remaining open pieces
							stack.push(top);
							for (var i = 1; i < stack.length; i++)
								addBrokenNode(stack[0], stack[i]);
							finish(stack[0], offset);
					}
				}

				//Helper function to calculate the start and end position of a comment
				//We need this, because comments sometimes include the preceding and trailing whitespace
				//See lines 275-313

				function getCommentSpan(start) {
					var endpos = text.indexOf('-->', start + 4);
					if (endpos === -1) return [start, text.length];
					for (var lead = start - 1; text.charAt(lead) === ' '; lead--);
					if (text.charAt(lead) !== '\n') return [start, endpos + 3];
					for (var trail = endpos + 3; text.charAt(trail) === ' '; trail++);
					if (text.charAt(trail) !== '\n') return [start, endpos + 3];
					return [lead + 1, trail + 1];
				}

				//Append text or a child to a node

				function add(node, el) {
					if (!el) return;
					var newstr = typeof el === 'string';
					var oldstr = typeof node.cur[node.cur.length - 1] === 'string';

					el.parent = node;

					if (newstr && oldstr) node.cur[node.cur.length - 1] += el;
					else node.cur.push(el);

					//For template nodes, record if and where an equal sign was found
					if (newstr && node.type === '{' && node.cur.splitindex === undefined && el.indexOf('=') > -1) node.cur.splitindex = node.cur.length - 1;

					//For heading nodes, record if we have a correct closing
					//A heading must end in one or more equal signs, followed only by
					//whitespace or comments
					if (node.type === 'h') {
						if (newstr) {
							var match = el.match(/(=+)[ \t]*$/);
							if (match) node.closing = match[1].length;
							else if (!el.match(/^[ \t]*$/)) node.closing = false;
						} else if (el.type !== 'comment') node.closing = false;
					}
				}

				//Break and append a child to a node

				function addBrokenNode(node, el) {
					//First add the opening braces
					if (el.type !== 'h') add(node, (new Array(el.count + 1)).join(el.type));
					//Then the parts, separated by '|'
					for (var i = 0; i < el.parts.length; i++) {
						if (i > 0) add(node, '|');
						for (var j = 0; j < el.parts[i].length; j++) add(node, el.parts[i][j]);
					}
				}

				//Clean up the extra stuff we put into the node for easier processing

				function finish(node, endOffset) {
					node.len = endOffset - node.offset;
					node.lineStart = text.charAt(node.offset - 1) === '\n';
					delete node.cur;
					delete node.count;
					delete node.closing;
					return node;
				}
			};

			/**************************************************************************************************
			 * PPFrame : Basic expansion frame, transforms a document tree back to the original wikitext
			 */

			function PPFrame() {
				this.self = PPFrame;
			}
			PPFrame.prototype = $.extend(PPFrame.prototype, {
				onEvent: $.noop, // function(evt, node, result, info) {}

				expand: function(obj) {
					var result;
					if (typeof obj === 'string') {
						result = this.expandString(obj);
						this.onEvent('text', obj, result);
						return result;
					}
					var type = obj.type.charAt(0).toUpperCase() + obj.type.substring(1);
					var func = this['expand' + type];
					if (!func) throw new Error('Unknown node type: ' + obj.type);
					this.onEvent('enter' + type, obj);
					result = func.call(this, obj);
					this.onEvent('leave' + type, obj, result);
					return result;
				},

				expandDeleted: function() {
					return '';
				},
				expandString: function(s) {
					return s;
				},
				expandRoot: function(obj) {
					return this.expandPart(obj.parts[0]);
				},
				expandLink: function(obj) {
					return this.expand('[[') + this.expandParts(obj.parts, '|') + this.expand(']]');
				},
				expandTemplate: function(obj) {
					return this.expand('{{') + this.expandParts(obj.parts, '|') + this.expand('}}');
				},
				expandTplarg: function(obj) {
					return this.expand('{{{') + this.expandParts(obj.parts, '|') + this.expand('}}}');
				},
				expandH: function(obj) {
					return this.expandPart(obj.parts[0]);
				},
				expandComment: function(obj) {
					return this.expand(obj.parts[0][0]);
				},
				expandIgnore: function(obj) {
					return this.expand(obj.parts[0][0]);
				},
				expandExt: function(obj) {
					return this.expandParts(obj.parts);
				},

				expandPart: function(part) {
					var result = '';
					for (var i = 0; i < part.length; i++) result += this.expand(part[i]);
					return result;
				},
				expandParts: function(parts, joiner) {
					var result = '';
					for (var i = 0; i < parts.length; i++) {
						if (joiner && i > 0) result += this.expand(joiner);
						result += this.expandPart(parts[i]);
					}
					return result;
				},

				splitPart: function(part) {
					var i = part.splitindex;
					if (i === undefined) return false;
					var pos = part[i].indexOf('=');
					var name = part.slice(0, i);
					name.push(part[i].substring(0, pos));
					var value = [part[i].substring(pos + 1)].concat(part.slice(i + 1));
					return [name, value];
				},

				extractParams: function(obj) {
					var params = { //numbered and named arguments must be stored separately
						numbered: {},
						named: {},
						obj: obj
					};
					var num = 1;
					for (var i = 1; i < obj.parts.length; i++) {
						var split = this.splitPart(obj.parts[i]);
						if (split) {
							var name = this.expandArgName(obj, split[0], i);
							params.named[name] = {
								value: split[1],
								part: i
							};
						} else params.numbered[num++] = {
								part: i
						};
					}
					return params;
				},
				getParam: function(params, name) {
					for (var i = 0; i < 2; i++) {
						var type = i ? 'named' : 'numbered';
						var param = params[type][name];
						if (!param) continue;
						if (typeof param.value === 'string') return param.value; //cached
						//Param exists, but not yet expanded. Expand it and put the result in the cache
						param.value = i ? this.expandArgValue(params.obj, param.value, param.part) : this.expandArg(params.obj, param.part);
						return param.value;
					}
					return false;
				},

				expandArgName: function(obj, part, num) {
					this.onEvent('enterArgName', obj, null, [part, num]);
					var result = this.expandPart(part).trim();
					this.onEvent('leaveArgName', obj, result, [part, num]);
					return result;
				},
				expandArgValue: function(obj, part, num) {
					this.onEvent('enterArgValue', obj, null, [part, num]);
					var result = this.expandPart(part).trim();
					this.onEvent('leaveArgValue', obj, result, [part, num]);
					return result;
				},
				expandArg: function(obj, num) {
					if (obj.parts[num] === undefined) return '';
					this.onEvent('enterArg', obj, null, num);
					var result = this.expandPart(obj.parts[num]);
					this.onEvent('leaveArg', obj, result, num);
					return result;
				}
			});

			var ppFrame = new PPFrame();

			return {
				text2Obj: text2Obj,
				obj2Text: function(o) {
					return ppFrame.expand(o);
				}
			};
		}())
	};

	if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
		module.exports = wikiDOM;
	} else {
		// Expose globally
		mw.libs.wikiDOM = wikiDOM;
	}
}());