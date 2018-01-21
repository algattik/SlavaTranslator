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
    var re = /[\wА-яЁё\-\u0301]+/g;

    function normalize(str) {
        str = str.replace(accent, '');
        str = str.toLowerCase();
        str = str.replace('ё', 'е');
        return str;
    }

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


    function genCharArray(charA, charZ) {
        var a = [], i = charA.charCodeAt(0), j = charZ.charCodeAt(0);
        for (; i <= j; ++i) {
            a.push(String.fromCharCode(i));
        }
        return a.join("");
    }

    function parse_wiki(dom, word, lemma, freq, lang_pair) {
        var page_url = 'https://' + lang_pair.src_lang + '.wiktionary.org/wiki/' + lemma;
        var lang_span_id = lang_pair.lang_span_id;
        var lang_conf = slavaConfig.wiktionary[lang_pair.src_lang];
        var language_heading = lang_conf.language_heading;
        var langspan = dom.find(language_heading + " > span#" + lang_span_id + ".mw-headline");
        var langsection = langspan.parent().nextUntil(language_heading);

        var wordClasses = _.object(_.map(lang_conf.definition_headings, function (v) { return [v, 1]; }));
        //Words may have multiple classes, e.g. под
        //Will be h3, or h4 if multiple etymologies, e.g. погрузиться
        var wordClassHeadings = langsection.find("span.mw-headline").filter(function () { return wordClasses[$(this).text().trim()]; });

        // Add word class within definition (since word class heading is removed)
        // Add frequency within definition
        var freq_span = ' <span class="slava-wordfreq">' + freq + '</span>';
        wordClassHeadings.each(function () {
            var s = $('<span class="slava-wordclass">' + $(this).text() + '</span>');
            if (lang_conf.heading_is_class) {
                $(this).parent().next().children(':first-child').after(s).after(' ');
                s.after(freq_span);
            }
            else {
                $(this).parent().next().prepend(freq_span);
            }
        });


        var defn = wordClassHeadings.parent().nextUntil('hr,h1,h2,h3,h4,h5'); // e.g. with hr: после
        var full_def = wordClassHeadings.parent().nextUntil(wordClassHeadings.prop('tagName'));

        var cases = [];
        $.each(full_def.get(), function (i, e) {
            var upper = genCharArray('A', 'Z') + genCharArray('А', 'Я') + 'Ë';
            var lower = upper.toLowerCase();
            // JQuery can't understand this XPath query - use DOM XPath instead
            var expr = '//td/span[@lang="ru"][translate(.,"' + upper + accent + '", "' + lower + '")=translate("' + escapeHtml(word) + '","' + upper + accent + '", "' + lower + '")]';
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

        defn = defn.filter(":not(table.flextable)");

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
        if (headword.length) {
            headword.wrap(page_link);
        } else {
            page_link.innerText = lemma;
            defn.prepend('<br/>').prepend(page_link);
        }


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

    function generate_popup(target, lemmas, langs) {
        var src_lang = langs[0];
        var word = target.text;
        var target_lang = 'ru';
        var lang_pair = $.grep(slavaConfig.langpairs, function (n) {
            return n.src_lang === src_lang && n.target_lang === target_lang;
        })[0];
        var ajax_queries = $.map(_.keys(lemmas), function (lemma) {
            var url = 'https://' + src_lang + '.wiktionary.org/w/api.php?action=parse&format=json&page=' + lemma + '&prop=text&origin=*';
            return $.getJSON(url);
        });

        $.when.apply($, ajax_queries).done(function () {
            if (!target.attr("data-popover_on")) {
                return;
            }
            var odom = $('<div/>');
            var res = arguments;
            if (ajax_queries.length < 2) {
                res = [arguments];
            }
            $.each(res, function (i, a1) {
                var parsed = a1[0].parse;
                if (parsed) {
                    var html = parsed.text['*'];
                    var dom = $(html);
                    var freq = lemmas[parsed.title];
                    dom = parse_wiki(dom, word, parsed.title, freq, lang_pair);
                    odom.append(dom);
                }
            });
            if (odom.children().length) {
                target.popover({
                    trigger: 'manual',
                    content: odom,
                    container: 'body',
                    html: true
                });
                target.popover("show");
            }
            else if (langs.length > 1) {
                generate_popup(target, lemmas, langs.slice(1));
            }
        });
    }

    $(document).ready(function () {


        $('head').append('<style>div.h-usage-example {font-size:80%} .mw-empty-elt{display:none} span.slava-wordclass{font-variant:small-caps} span.slava-wordfreq{font-size:70%} .slava-cases{font-size:70%; color:gray} .slava-pop {color:inherit; text-decoration: none;} .slava-pop:hover { text-decoration: none; border-bottom: #666666; border-width: 0px 0px 1px 0px; border-style: none none dotted none;}</style>');

        var v = getTextNodesIn(document.body);

        $.each(v, function (i, val) {
            var t1 = $(val).text();

            var allWords = Array();
            var match;
            while (match = re.exec(t1)) {
                allWords.push(normalize(match[0]));
            }

            chrome.runtime.sendMessage({ type: "resolve", payload: _.unique(allWords) }, function (response) {
                var forms = response.payload.forms;

                var str = t1.replace(re, function (match, group) {
                    var normalized_word = normalize(match);
                    if (forms[normalized_word]) {
                        var entry0 = forms[normalized_word];
                        var stress_chars = Array();
                        var lemmasf = {};
                        var spellings = {};
                        $.each(entry0, function (i, entry) {
                            var lemma_entry = entry[0];
                            stress_chars = stress_chars.concat(entry[1]);
                            lemmasf[lemma_entry[0]] = lemma_entry[1];
                            var spelling = entry[2].length ? entry[2][0] : normalized_word;
                            spellings[spelling] = 1;
                        });
                        var matchn = match.replace(accent, '');
                        var ref;
                        if (!spellings || spellings[matchn]) { ref = matchn }
                        else {
                            ref = _.keys(spellings)[0];

                            // match capitalization
                            if (match[0].toLowerCase() != match[0]) {
                                if (match.length > 1 && match[1].toLowerCase() != match[1]) {
                                    ref = ref.toUpperCase();
                                }
                                else {
                                    ref = ref.charAt(0).toUpperCase() + ref.slice(1);
                                }
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
                        return "</span>" + '<span class="slava-pop" data-lemmas="' + escapeHtml(slemmas) + '">' + ref + '</span><span>';
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

        $("body").on("mouseenter", ".slava-pop", function (event) {
            $(".popover").css("display", "none");
            event.target.setAttribute("data-popover_on", "1");
            setTimeout(function () {
                if (!event.target.getAttribute("data-popover_on")) {
                    return;
                }
                var lemmas = JSON.parse(event.target.getAttribute("data-lemmas"));
                if (lemmas) {
                    chrome.runtime.sendMessage({ type: "get-language_pref" }, function (response) { generate_popup($(event.target), lemmas, response) });
                }
            }, 100);

        }); // on mouseenter

        $("body").on("mouseleave", ".slava-pop", function (event) {
            event.target.removeAttribute("data-popover_on");
            setTimeout(function () { $(event.target).popover("hide"); }, 10000);
        }); // on mouseleave

    }); // document.ready

})(); //outer function
