(function () {
    'use strict';

    var entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;',
    };

    var accent = '\u0301';
    var re = /[\wа-я\-\u0301]+/ig;

    function escapeHtml(string) {
        return String(string).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s];
        });
    }

    function getTextNodesIn(node, includeWhitespaceNodes) {
        var textNodes = [], nonWhitespaceMatcher = /\S/;

        function getTextNodes(node) {
            if (node.nodeType == 3) {
                if (includeWhitespaceNodes || nonWhitespaceMatcher.test(node.nodeValue)) {
                    textNodes.push(node);
                }
            } else {
                for (var i = 0, len = node.childNodes.length; i < len; ++i) {
                    getTextNodes(node.childNodes[i]);
                }
            }
        }

        getTextNodes(node);
        return textNodes;
    }

    function parse_table(table) {
        var rows = table.children('tbody').children('tr');
        var t = [];
        for (var i = 0; i < rows.length; i++) {
            var r = [];
            var row = rows[i];
            var td = $(row).children('td,th');
            for (var j = 0; j < td.length; j++) {
                var c = td.get(j);
                // apply colspan
                for (var j2 = 0; j2 < c.colSpan; j2++) {
                    r.push([c, c.rowSpan, $(c).text()]);
                }
            }
            t.push(r);
        }
        for (var i = 0; i < t.length; i++) {
            var r = t[i];
            for (var j = 0; j < r.length; j++) {
                var c = r[j];
                var c0 = $(c[0]);
                // apply rowspan
                if (c[1] > 1) {
                    t[i + 1].splice(j, 0, [c[0], c[1] - 1, c[2]]);
                }
                // remove span e.g. animate / inanimate in Владимир
                if (c[0].tagName == 'TH') {
                    c0.children('span[style]').remove();
                }
            }
        }
        return t;
    }

    function add_grammar(grammar, element) {
        var text = $(element).text();
        if (!grammar.includes(text)) {
            grammar.push(text);
        }
    }

    function grammar_from_table(table, element, cases) {
        var t = parse_table(table);

        for (var i = 0; i < t.length; i++) {
            for (var j = 0; j < t[i].length; j++) {
                var c = t[i][j];
                //multiple elements can match because of colspan
                if (c[0] != element) { continue; }

                var grammar_tokens = [];
                var in_th = false;
                for (var i2 = i - 1; i2 >= 0; i2--) {
                    if (t[i2][j][0].tagName == 'TH') {
                        add_grammar(grammar_tokens, t[i2][j][0]);
                        in_th = true;
                    }
                    else if (in_th) {
                        break;
                    }
                }
                in_th = false;
                for (var j2 = j - 1; j2 >= 0; j2--) {
                    if (t[i][j2][0].tagName == 'TH') {
                        add_grammar(grammar_tokens, t[i][j2][0]);
                        in_th = true;
                    }
                    else if (in_th) {
                        break;
                    }
                }
                if (grammar_tokens) {
                    var grammarText = grammar_tokens.reverse().join(" ");
                    if (!cases.includes(grammarText)) {
                        cases.push(grammarText);
                    }
                }
            }
        }
    }



    function parse_wiki(dom, word, page_url, freq) {
        var langspan = dom.find("h2 > span#Russian.mw-headline");
        var langsection = langspan.parent().nextUntil('h2');

        var wordClasses = _.object(_.map([
            "Circumfix",
            "Interfix",
            "Prefix",
            "Affix",
            "Suffix",
            "Abbreviation",
            "Adjective",
            "Adverb",
            "Conjunction",
            "Combining form",
            "Diacritical mark",
            "Determiner",
            "Interjection",
            "Idiom",
            "Morpheme",
            "Letter",
            "Noun",
            "Numeral",
            "Particle",
            "Participle",
            "Phrase",
            "Predicative",
            "Preposition",
            "Prepositional phrase",
            "Pronoun",
            "Proper noun",
            "Proverb",
            "Symbol",
            "Verb"
        ], function (v) { return [v, 1]; }));
        //Words may have multiple classes, e.g. под
        //Will be h3, or h4 if multiple etymologies, e.g. погрузиться
        var wordClassHeadings = langsection.find("span.mw-headline").filter(function () { return wordClasses[$(this).text()]; });


        // Add word class within definition (since word class heading is removed)
        // Add frequency within definition
        wordClassHeadings.each(function () {
            var s = $('<span class="slava-wordclass">' + $(this).text() + '</span>');
            $(this).parent().next().children(':first-child').after(s).after(' ');
            s.after(' <span class="slava-wordfreq">' + freq + '</span>');
        });


        var defn = wordClassHeadings.parent().nextUntil('hr,h1,h2,h3,h4,h5'); // e.g. with hr: после
        var full_def = wordClassHeadings.parent().nextUntil(wordClassHeadings.prop('tagName'));

        var cases = [];
        $.each(full_def.get(), function (i, e) {
            // JQuery can't understand this XPath query - use DOM XPath instead
            var expr = '//td/span[@lang="ru"][translate(.,"' + accent + '", "")=translate("' + escapeHtml(word) + '","' + accent + '", "")]';
            expr = expr + '/..';
            var pa = wordClassHeadings.parent().get(0);
            var iterator = document.evaluate(expr, e, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            var thisNode = iterator.iterateNext();
            var nodes = [];
            while (thisNode) {
                nodes.push(thisNode);
                thisNode = iterator.iterateNext();
            }

            $.each(nodes, function (i, thisNode) {
                grammar_from_table($(thisNode).closest('table'), thisNode, cases);
            });
        });



        // Remove transliterations

        defn.find("a[title='Wiktionary:Russian transliteration']").remove();

        var translit = defn.find("span.tr, i.tr"); //e.g. with <i>: свет

        // Remove parentheses / dashes before / after transliteration
        $.each(translit.get(), function (i, e) {
            var prev = e.previousSibling;
            var next = e.nextSibling;
            if (prev && next) {
                if (prev.textContent.slice(-1) == "(" && next.textContent.slice(0, 1) == ")") {
                    prev.textContent = prev.textContent.slice(0, -1);
                    next.textContent = next.textContent.slice(1);
                }
                if (prev.textContent == " ― ") { //e.g. свет
                    prev.textContent = "";
                }
                if (next.textContent.slice(0, 2) == ", ") { //e.g. погрузиться
                    next.textContent = next.textContent.slice(2);
                }
            }
        });


        translit.remove();


        // Add hyperlink to original wiktionary page
        // NB e.g. не#Prefix has no headword
        var page_link = document.createElement('a');
        page_link.href = page_url;
        var headword = defn.find("strong.headword");
        headword.wrap(page_link);


        // Change relative hyperlinks to absolute
        var page_base = page_link.protocol + "//" + page_link.host; // e.g. "https://en.wiktionary.org"
        defn.find('a:not([href*="://"],[href^="mailto:"])').each(function () {
            $(this).attr('href', function (index, value) {
                if (!value) {
                    return value;
                }
                if (value.slice(0, 1) == "#") {
                    return null;
                }
                if (value.slice(0, 1) == "/") {
                    return page_base + value;
                }
                return page_base + page_link.path + value;
            });

            return defn;
        });

        // Remove images
        defn.find('img').remove();



        // Add cases
        var casesdiv = $("<div class='slava-cases'/>");
        $.each(cases, function (i, e) {
            var casediv = $("<div class='slava-case'/>");
            casediv.append(e);
            casesdiv.append(casediv);
        });

        // Build output structure
        var res = $("<div class='slava-res'/>");
        res.append(defn);
        res.append(casesdiv);
        return res;

    }

    $(document).ready(function () {


        $('head').append('<style>div.h-usage-example {font-size:80%} span.slava-wordclass{font-variant:small-caps} span.slava-wordfreq{font-size:70%} .slava-cases{font-size:70%; color:gray} a.slava-pop {color:inherit; text-decoration: none;} a.slava-pop:hover { text-decoration: none; border-bottom: #666666; border-width: 0px 0px 1px 0px; border-style: none none dotted none;}</style>');

        var v = getTextNodesIn(document.body);

        $.each(v, function (i, val) {
            var t1 = $(val).text();

            var allWords = Array();
            var match;
            while (match = re.exec(t1)) {
                var matched_word = match[0].replace(accent, '');
                var normalized_word = matched_word.toLowerCase();
                allWords.push(normalized_word);
            }

            chrome.runtime.sendMessage({ type: "resolve", payload: allWords }, function (response) {
                var forms = response.payload.forms;

                var str = t1.replace(re, function (match, group) {
                    var matched_word = match.replace(accent, '');
                    var normalized_word = matched_word.toLowerCase();
                    if (forms[normalized_word]) {
                        var entry0 = forms[normalized_word];
                        var ref = matched_word;
                        var stress_chars = Array();
                        var lemmasf = {};
                        $.each(entry0, function (i, entry) {
                            var lemma_entry = entry[0];
                            var stress_char = entry[1];
                            lemmasf[lemma_entry[0]] = lemma_entry[1];
                            if (stress_char) {
                                stress_chars.push(stress_char);
                            }
                        });

                        // match capitalization
                        if (matched_word[0].toLowerCase() != matched_word[0]) {
                            if (matched_word.length > 1 && matched_word[1].toLowerCase() != matched_word[1]) {
                                ref = ref.toUpperCase();
                            }
                            else {
                                ref = ref.charAt(0).toUpperCase() + ref.slice(1);
                            }
                        }

                        // mark stress with accent character
                        if (stress_chars) {
                            var stress_pos = _.uniq(stress_chars).sort();
                            var chars = ref;
                            var accented = "";
                            var s_pos = 0;
                            $.each(stress_pos, function (i, stress_char) {
                                accented += chars.slice(s_pos, stress_char) + accent;
                                s_pos = stress_char;
                            });
                            accented += chars.slice(s_pos);
                            ref = accented;
                        }

                        var slemmas = JSON.stringify(lemmasf);
                        // a and tabindex required, seee https://v4-alpha.getbootstrap.com/components/popovers/#dismiss-on-next-click
                        return "</span>" + '<a tabindex="0" class="slava-pop" data-lemmas="' + escapeHtml(slemmas) + '">' + ref + '</a><span>';
                    }
                    else {
                        return match;
                    }
                }); // replace
                str = "<span>" + str + "</span>";
                var span = $(str);
                $(val).replaceWith(span);
            });
        });

        $("body").on("mouseover", "a.slava-pop", function (event) {
            $(".popover").css("display", "none");
            event.target.setAttribute("data-popover_on", "1");
            setTimeout(function () {
                if (!event.target.getAttribute("data-popover_on")) {
                    return;
                }
                var word = event.target.textContent;
                var lemmas = JSON.parse(event.target.getAttribute("data-lemmas"));
                if (lemmas) {
                    var ajax_queries = $.map(_.keys(lemmas), function (lemma) {
                        var url = 'https://en.wiktionary.org/w/api.php?action=parse&format=json&page=' + lemma + '&prop=text&origin=*';
                        return $.getJSON(url);
                    });

                    $.when.apply($, ajax_queries).done(function () {
                        if (!event.target.getAttribute("data-popover_on")) {
                            return;
                        }
                        var odom = $('<div/>');
                        var res = arguments;
                        if (ajax_queries.length < 2) {
                            res = [arguments];
                        }
                        $.each(res, function (i, a1) {
                            var parsed = a1[0].parse;
                            var html = parsed.text['*'];
                            var dom = $(html);
                            var page_url = 'https://en.wiktionary.org/wiki/' + parsed.title;
                            var freq = lemmas[parsed.title];
                            dom = parse_wiki(dom, word, page_url, freq);
                            odom.append(dom);
                        });
                        var tgt = $(event.target);
                        tgt.popover({
                            trigger: 'manual',
                            content: odom,
                            container: 'body',
                            html: true
                        });
                        $(event.target).popover("show");
                    });
                }
            }, 100);

        }); // on mouseover

        $("body").on("mouseout", "a.slava-pop", function (event) {
            event.target.removeAttribute("data-popover_on");
            setTimeout(function () { $(event.target).popover("hide"); }, 10000);
        }); // on mouseout

    }); // document.ready

})(); //outer function
