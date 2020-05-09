/*jslint node: true */
'use strict';

const escapeHtml = require('./md-html-util').escapeHtml

const unescapeMd = require('./md-html-util').unescapeMd;

// Test if potential opening or closing delimieter
// Assumes that there is a "$" at state.src[pos]
function isValidDelim(state, pos) {
    var prevChar, nextChar,
        max = state.posMax,
        can_open = true,
        can_close = true;

    prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
    nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;

    // Check non-whitespace conditions for opening and closing, and
    // check that closing delimeter isn't followed by a number
    if (prevChar === 0x20/* " " */ || prevChar === 0x09/* \t */ ||
            (nextChar >= 0x30/* "0" */ && nextChar <= 0x39/* "9" */)) {
        can_close = false;
    }
    if (nextChar === 0x20/* " " */ || nextChar === 0x09/* \t */) {
        can_open = false;
    }

    return {
        can_open: can_open,
        can_close: can_close
    };
}

function math_inline(state, silent) {
    var start, match, token, res, pos, esc_count;

    if (state.src[state.pos] !== "$") { return false; }

    res = isValidDelim(state, state.pos);
    if (!res.can_open) {
        if (!silent) { state.pending += "$"; }
        state.pos += 1;
        return true;
    }

    // First check for and bypass all properly escaped delimieters
    // This loop will assume that the first leading backtick can not
    // be the first character in state.src, which is known since
    // we have found an opening delimieter already.
    start = state.pos + 1;
    match = start;
    while ( (match = state.src.indexOf("$", match)) !== -1) {
        // Found potential $, look for escapes, pos will point to
        // first non escape when complete
        pos = match - 1;
        while (state.src[pos] === "\\") { pos -= 1; }

        // Even number of escapes, potential closing delimiter found
        if ( ((match - pos) % 2) == 1 ) { break; }
        match += 1;
    }

    // No closing delimter found.  Consume $ and continue.
    if (match === -1) {
        if (!silent) { state.pending += "$"; }
        state.pos = start;
        return true;
    }

    // Check if we have empty content, ie: $$.  Do not parse.
    if (match - start === 0) {
        if (!silent) { state.pending += "$$"; }
        state.pos = start + 1;
        return true;
    }

    // Check for valid closing delimiter
    res = isValidDelim(state, match);
    if (!res.can_close) {
        if (!silent) { state.pending += "$"; }
        state.pos = start;
        return true;
    }

    if (!silent) {
        token         = state.push('math_inline', 'math', 0);
        token.markup  = "$";
        token.content = state.src.slice(start, match);
    }

    state.pos = match + 1;
    return true;
}

function math_block(state, start, end, silent){
    var firstLine, lastLine, next, lastPos, found = false, token,
        pos = state.bMarks[start] + state.tShift[start],
        max = state.eMarks[start]

    if(pos + 2 > max){ return false; }
    if(state.src.slice(pos,pos+2)!=='$$'){ return false; }

    pos += 2;
    firstLine = state.src.slice(pos,max);

    if(silent){ return true; }
    if(firstLine.trim().slice(-2)==='$$'){
        // Single line expression
        firstLine = firstLine.trim().slice(0, -2);
        found = true;
    }

    for(next = start; !found; ){

        next++;

        if(next >= end){ break; }

        pos = state.bMarks[next]+state.tShift[next];
        max = state.eMarks[next];

        if(pos < max && state.tShift[next] < state.blkIndent){
            // non-empty line with negative indent should stop the list:
            break;
        }

        if(state.src.slice(pos,max).trim().slice(-2)==='$$'){
            lastPos = state.src.slice(0,max).lastIndexOf('$$');
            lastLine = state.src.slice(pos,lastPos);
            found = true;
        }

    }

    state.line = next + 1;

    token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '')
    + state.getLines(start + 1, next, state.tShift[start], true)
    + (lastLine && lastLine.trim() ? lastLine : '');
    token.map = [ start, state.line ];
    token.markup = '$$';
    return true;
}



module.exports = function math_plugin(md, options) {
    // Default options

    options = options || {};

    var inlineRenderer = function(tokens, idx){
        return '<img eeimg="1" src="//www.zhihu.com/equation?tex=' + encodeURI(tokens[idx].content) + '" alt="' + escapeHtml(tokens[idx].content).trim() + '"/>'
    };

    var blockRenderer = function(tokens, idx){
        return '<p><img eeimg="1" src="//www.zhihu.com/equation?tex=' + encodeURI(tokens[idx].content) + '" alt="' + escapeHtml(tokens[idx].content).trim() + '"/></p>'
    }

    var imageRenderer = function(tokens, idx) {
        let link = tokens[idx].attrs[0][1];
        let src = link.replace(/^(https:\/\/.+)(\.\w+)$/g, '$1');
        let ext = link.replace(/^(https:\/\/.+)(\.\w+)$/g, '$2');

        const SrcReg = /^(https:\/\/.+)(\.\w+)$/g
        return `<img src="${src}_1440w${ext}" data-caption="${tokens[idx].content}" data-size="normal" data-watermark="original" data-original-src="${src}_r${ext}"/>`
    }

    md.inline.ruler.after('escape', 'math_inline', math_inline);
    md.block.ruler.after('blockquote', 'math_block', math_block, {
        alt: [ 'paragraph', 'reference', 'blockquote', 'list' ]
    });
    md.renderer.rules.math_inline = inlineRenderer;
    md.renderer.rules.math_block = blockRenderer;
    md.renderer.rules.fence = fenceRenderer;
    md.renderer.rules.image = imageRenderer;
    md.renderer.rules.link_open = linkOpenRenderer;
    let render = md.renderer.render;
    md.renderer.render = function(tokens, options, env) {
        return render.call(md.renderer, tokens, options, env).replace(/(<\/[^<>]+>)\n/g, '$1');
    }
};

function linkOpenRenderer(tokens, idx, options, env, slf) {
    var i, l, result;
    result = "<" + tokens[idx].tag;
    for (i = 0, l = tokens[idx].attrs.length; i < l; i++) {
        result += ' ' + escapeHtml(tokens[idx].attrs[i][0]) + '="' + escapeHtml(tokens[idx].attrs[i][1]) + '"';
        if (tokens[idx].attrs[i][0] == "title" && tokens[idx].attrs[i][1] == "card") {
            result += ' draft-data-node="block"  draft-data-type="link-card"';
        }
    }
    result += '/>';
    return result;
}

function fenceRenderer(tokens, idx, options, env, slf) {
	var token = tokens[idx],
		info = token.info ? unescapeMd(token.info).trim() : '',
		langName = '',
		highlighted, i, tmpAttrs, tmpToken;

	if (info) {
		langName = info.split(/\s+/g)[0];
	}

	if (options.highlight) {
		highlighted = options.highlight(token.content, langName) || escapeHtml(token.content);
	} else {
		highlighted = escapeHtml(token.content);
	}

	if (highlighted.indexOf('<pre') === 0) {
		return highlighted + '\n';
	}

	// If language exists, inject class gently, without modifying original token.
	// May be, one day we will add .clone() for token and simplify this part, but
	// now we prefer to keep things local.
	if (info) {
		i = token.attrIndex('lang');
		tmpAttrs = token.attrs ? token.attrs.slice() : [];

		if (i < 0) {
			tmpAttrs.push(['lang', langName]);
		} else {
			tmpAttrs[i][1] += ' ' + langName;
		}

		// Fake token just to render attributes
		tmpToken = {
			attrs: tmpAttrs
		};

		return '<pre' + slf.renderAttrs(tmpToken) + '>'
			+ highlighted
			+ '</pre>\n';
	}


	return '<pre' + slf.renderAttrs(token) + '>'
		+ highlighted
		+ '</pre>\n';
};