/*
 * grunt-inline-alt
 * https://github.com/marcusklaas/grunt-inline-alt
 *
 * Copyright (c) 2015 Auguest G. casper & IMWEB TEAM
 */

'use strict';

module.exports = function(grunt) {

	var path = require('path');
	var datauri = require('datauri');
	var UglifyJS = require("uglify-js");
	var CleanCSS = require('clean-css');
	
	grunt.registerMultiTask('inline', "Replaces <link>, <script> and <img> tags to their inline contents", function() {

		var options = this.options({
                tag: '__inline',
                inlineTagAttributes: {
                    js: '',
                    css: ''
                }
            }),
		    relativeTo = this.options().relativeTo,
		    absoluteTo = this.options().absoluteTo,
		    exts = options.exts,
			isExpandedPair;

		this.files.forEach(function(filePair) {
			isExpandedPair = filePair.orig.expand || false;

			filePair.src.forEach(function(filepath) {
				var fileType = path.extname(filepath).replace(/^\./, '');
				var fileContent = grunt.file.read(filepath);
				var destFilepath = '';

				grunt.log.write('Processing ' + filepath + '... ');

				if(fileType==='html' || fileType==='htm' || (exts && exts.indexOf(fileType) > -1)) {
					fileContent = html(filepath, fileContent, relativeTo, absoluteTo, options);
				} else if(fileType==='css') {
					fileContent = css(filepath, fileContent, relativeTo, absoluteTo, options);
				}

				if(pathIsDirectory(filePair.dest)) {
                    destFilepath = (isExpandedPair) ? filePair.dest : unixifyPath(path.join(filePair.dest, path.basename(filepath)));
				} else {
					destFilepath = filePair.dest || filepath;
				}
				
				grunt.file.write(destFilepath, fileContent);
				grunt.log.ok();
			});
		});
	});

	function isRemotePath(url) {
		return url.match(/^'?https?:\/\//) || url.match(/^\/\//);
	}

	function isBase64Path(url) {
		return url.match(/^'?data.*base64/);
	}

	// code from grunt-contrib-copy, with a little modification
	function pathIsDirectory(dest) {
		return grunt.util._.endsWith(dest, '/');
	}

	function unixifyPath(filepath) {
		if (process.platform === 'win32') {
			return filepath.replace(/\\/g, '/');
		} else {
			return filepath;
		}
	}

    function getDataAttribs(attrs) {
        var reg = /(data-[\a-z-]+="[\w-]+")/gm;
        return attrs.match(reg) || [];
    }

	function html(filepath, fileContent, relativeTo, absoluteTo, options) {
/*	    if(relativeTo) {
	        filepath = filepath.replace(/[^\/]+\//, relativeTo);
	    }
*/
        function cssReplacement(matchedWord, src) {
/*            if(isRemotePath(src) || isBase64Path(src) || src.indexOf(options.tag) == -1) {
				return matchedWord;
			}
*/
			var inlineFilePath;
			if(grunt.file.isPathAbsolute(src) && absoluteTo)
				inlineFilePath=path.join(absoluteTo,src);
			else if(relativeTo)
				inlineFilePath=path.join(relativeTo,src);

			if (grunt.file.exists(inlineFilePath)) {
				var styleSheetContent = grunt.file.read(inlineFilePath);

				return '<style ' + options.inlineTagAttributes.css + '>\n' + cssInlineToHtml(filepath, inlineFilePath, styleSheetContent, relativeTo, absoluteTo, options) + '\n</style>';
			} else {
				grunt.log.error("Couldn't find " + inlineFilePath + '!');

				return matchedWord;
			}
        }

        function imageReplacement(matchedWord, src) {
        	var inlineFilePath;
        	if(grunt.file.isPathAbsolute(src) && absoluteTo)
        		inlineFilePath=path.join(absoluteTo,src);
        	else if(relativeTo)
        		inlineFilePath=path.join(relativeTo,src);

            if(src.indexOf(options.tag)!=-1) {
                if(grunt.file.exists(inlineFilePath)) {
                    return matchedWord.replace(src, (new datauri(inlineFilePath)).content);
                } else {
                    grunt.log.error("Couldn't find " + inlineFilePath + '!');
                }
            }

            return matchedWord;
        }

        function scriptReplacement(matchedWord, src, attrs) {
            if( ! isRemotePath(src) && src.indexOf(options.tag)!=-1) {
                var dataAttribs = getDataAttribs(attrs);
                var inlineFilePath;
                if(grunt.file.isPathAbsolute(src) && absoluteTo)
                	inlineFilePath=path.join(absoluteTo,src);
                else if(relativeTo)
                	inlineFilePath=path.join(relativeTo,src);

                var c = options.uglify ? UglifyJS.minify(inlineFilePath).code : grunt.file.read(inlineFilePath);

                if(grunt.file.exists(inlineFilePath)) {
                    var inlineTagAttributes = options.inlineTagAttributes.js;
                    return '<script ' + inlineTagAttributes + ' ' + dataAttribs.join(' ') +' >\n' + c + '\n</script>';
                } else {
                    grunt.log.error("Couldn't find " + inlineFilePath + '!');
                }
            }

            return matchedWord;
        }

        function htmlInclusion(matchedWord, src) {
			/*if( ! isRemotePath(src) && grunt.file.isPathAbsolute(src)) {
				return matchedWord;
			}
*/
			var inlineFilePath;
			if(grunt.file.isPathAbsolute(src) && absoluteTo)
				inlineFilePath=path.join(absoluteTo,src);
			else if(relativeTo)
				inlineFilePath=path.join(relativeTo,src);

			if( ! grunt.file.exists(inlineFilePath)) {
				grunt.log.error("Couldn't find " + inlineFilePath + '!');

				return matchedWord;
			}

			var ret = grunt.file.read(inlineFilePath);
			// @otod need to be checked, add bye herbert
			var _more = src.match(/^(..\/)+/ig);

			if( ! _more || !_more[0]) {
				return ret;
			}

			var _addMore = function(_ret, _, _src) {
				if( ! _src.match(/^http\:\/\//)) {
					return arguments[1] +  _more + arguments[2] + arguments[3];
				}

				return _ret;
			};

			return ret.replace(/(<script.+?src=["'])([^"']+?)(["'].*?><\/script>)/g, _addMore);
        }

		return fileContent.replace(/<inline.+?src=["']([^"']+?)["']\s*?\/>/gi, htmlInclusion)
            .replace(/<script.+?src=["']\/?([^"']+?)["'](.*?)>\s*<\/script>/gi, scriptReplacement)
            .replace(/<link.+?href=["']\/?([^"']+?)["'].*?rel=["'][^"']*?icon[^"']*?["'].*?\/?>/gi, imageReplacement)
            .replace(/<link.+?rel=["'][^"']*?icon[^"']*?["'].*?href=["']\/?([^"']+?)["'].*?\/?>/gi, imageReplacement)
            .replace(/<link.+?href=["']\/?([^"']+?)["'].*?\/?>/gi, cssReplacement)
            .replace(/<img.+?src=["']([^"':]+?)["'].*?\/?\s*?>/gi, imageReplacement);
	}

	function css(filepath, fileContent, relativeTo, absoluteTo, options) {
	    return cssInlineToHtml(filepath, filepath, fileContent, relativeTo, absoluteTo, options);
	}

	function cssInlineToHtml(htmlFilepath, filepath, fileContent, relativeTo, absoluteTo, options) {
/*	    if(relativeTo) {
	        filepath = filepath.replace(/[^\/]+\//g, relativeTo);
	    }
*/
		fileContent = fileContent.replace(/url\(["']*([^)'"]+)["']*\)/g, function(matchedWord, imgUrl) {
            var flag = imgUrl.indexOf(options.tag) != -1;	// urls like "img/bg.png?__inline" will be transformed to base64

			if(isBase64Path(imgUrl) || isRemotePath(imgUrl)) {
				return matchedWord;
			}

			var absoluteImgurl = path.resolve(path.dirname(filepath), imgUrl);	// img url relative to project root
			var newUrl = path.relative(path.dirname(htmlFilepath), absoluteImgurl);	// img url relative to the html file

			absoluteImgurl = absoluteImgurl.replace(/\?.*$/, '');

			if(flag && grunt.file.exists(absoluteImgurl)) {
				newUrl = datauri(absoluteImgurl);
			} else {
				newUrl = newUrl.replace(/\\/g, '/');
			}

			return matchedWord.replace(imgUrl, newUrl);
		});

		return options.cssmin ? CleanCSS.process(fileContent) : fileContent;
	}
};
