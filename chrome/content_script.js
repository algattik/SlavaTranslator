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

    // Regexp for matching Russian words
    var re = /[А-яЁё\-\u0301]+/g;

    // parse document without loading images. See https://stackoverflow.com/questions/15113910
    var virtualDocument = document.implementation.createHTMLDocument('virtual');

    function escapeHtml(string) {
        return String(string).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s];
        });
    }

    function getTextNodesIn(node, includeWhitespaceNodes) {
        var textNodes = [], nonWhitespaceMatcher = /\S/;

        function getTextNodes(node) {
            if (node.nodeType == Node.TEXT_NODE) {
                if (includeWhitespaceNodes || nonWhitespaceMatcher.test(node.nodeValue)) {
                    textNodes.push(node);
                }
            } else if (!["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.nodeName)) {
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
        var text = $(element).text().trim();
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

    function xpath_list(jquery_elements, expr) {

        var nodes = [];
        $.each(jquery_elements.get(), function (i, e) {
            var iterator = document.evaluate(expr, e, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
            var thisNode = iterator.iterateNext();
            while (thisNode) {
                nodes.push(thisNode);
                thisNode = iterator.iterateNext();
            }
        });
        return nodes;
    }

    function parse_wiki(dom, word, lemma, freq, src_lang, lang_pair) {
        var page_url = 'https://' + src_lang + '.wiktionary.org/wiki/' + lemma;
        var lang_span_id = lang_pair.lang_span_id; // FIXME may be _1
        var lang_conf = slavaConfig.wiktionary[src_lang];
        var language_heading = lang_conf.language_heading;
        var langspan = dom.find(language_heading + " > span#" + lang_span_id + ".mw-headline");
        var langsection = langspan.parent().nextUntil(language_heading);

        var wordClasses = _.object(_.map(lang_conf.definition_headings, function (v) { return [v, 1]; }));
        //Words may have multiple classes, e.g. под
        //Will be h3, or h4 if multiple etymologies, e.g. погрузиться
        var wordClassHeadings = langsection.find("span.mw-headline").filter(function () { return wordClasses[$(this).text().trim()]; });

        // Add word class within definition (since word class heading is removed)
        // Add frequency within definition
        if (freq) {
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
        }


        var defn = wordClassHeadings.parent().nextUntil('hr,h1,h2,h3,h4,h5'); // e.g. with hr: после
        var full_def = wordClassHeadings.parent().nextUntil(wordClassHeadings.prop('tagName'));



        var upper = genCharArray('A', 'Z') + genCharArray('А', 'Я') + 'Ë';
        var lower = upper.toLowerCase();
        var expr1 = '//td/span[@lang="ru"]';
        var expr2s = ['', '/a']; // свое́й under свой is once not full content of the cell
        var expr3 = '[translate(.,"' + upper + UNICODE_COMBINING_ACUTE_ACCENT + '", "' + lower + '")=translate("' + escapeHtml(word) + '","' + upper + UNICODE_COMBINING_ACUTE_ACCENT + '", "' + lower + '")]/ancestor::td[1]';

        var cases = [];
        $.each(expr2s, function (i, expr2) {
            var nodes = xpath_list(full_def, expr1 + expr2 + expr3);

            $.each(nodes, function (j, element) {
                grammar_from_table($(element).closest('table'), element, cases);
            });
        });

        var comparatives = xpath_list(full_def, "b[@lang='ru' and preceding-sibling::*[1][name()='i' and text()='comparative']]");
        $.each(comparatives, function (i, element) {
            var comparative = element.textContent;
            var prefix = "по";
            var test;
            if (comparative.startsWith("(" + prefix + ")")) {
                comparative = comparative.slice(prefix.length + 2);
                test = [comparative, prefix + comparative];
            }
            else {
                test = [comparative];
            }
            for (var i = 0; i < test.length; i++) {
                if (test[i] == word) {
                    cases.push("comparative");
                    break;
                }
            }
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
                if (prev.textContent.trim() == "―") { //e.g. свет
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
        document.body.style.cursor = "progress";
        get_entries(target, lemmas, langs, function (target, items) {
            if (!target.attr("data-popover_on")) {
                return;
            }
            var odom = $('<div class="slava-popover"/>');
            $.each(items, function () {
                odom.append($(this));
            });
            document.body.style.cursor = "auto";

            var placement = 'bottom';
            if ((target.offset().top - $(window).scrollTop()) / window.innerHeight > .5)
                placement = 'top';

            target.popover({
                trigger: 'manual',
                content: odom,
                container: 'body',
                placement: placement,
                html: true
            });
            target.popover("show");
        });
    }

    function get_entries(target, lemmas, langs, callback) {
        var src_lang = langs[0];
        var word = target.text();
        var target_lang = 'ru';
        var lang_pair = slavaConfig.langpairs[src_lang][target_lang];
        var ajax_queries = $.map(_.keys(lemmas), function (lemma) {
            var url = 'https://' + src_lang + '.wiktionary.org/w/api.php?action=parse&format=json&page=' + lemma + '&prop=text&origin=*';
            return $.getJSON(url);
        });

        $.when.apply($, ajax_queries).done(function () {
            var odom = Array();

            var res = arguments;
            if (ajax_queries.length < 2) {
                res = [arguments];
            }
            $.each(res, function (i, a1) {
                var parsed = a1[0].parse;
                if (parsed) {
                    var html = parsed.text['*'];
                    var dom = $(html, virtualDocument);
                    var freq = lemmas[parsed.title];
                    dom = parse_wiki(dom, word, parsed.title, freq, src_lang, lang_pair);
                    if (dom.children().children().length) {
                        odom.push(dom);
                    }

                }
            });
            if (odom.length || langs.length <= 1) {
                callback(target, odom);
            }
            else {
                get_entries(target, lemmas, langs.slice(1), callback);
            }
        });

    }

    function slava_mouseenter(event) {
        $(".popover").css("display", "none");
        event.target.setAttribute("data-popover_on", "1");
        setTimeout(function () {
            if (!event.target.getAttribute("data-popover_on")) {
                return;
            }
            var lemmas = JSON.parse(event.target.getAttribute("data-lemmas"));
            if (lemmas) {
                chrome.runtime.sendMessage({ type: "get-language_pref" }, function (response) {

                    if (response) {
                        generate_popup($(event.target), lemmas, response);
                    }
                    else {
                        console.log("No response to get-language_pref");
                    }
                });
            }
        }, 100);

    }

    function slava_mouseleave(event) {
        event.target.removeAttribute("data-popover_on");
        setTimeout(function () { $(event.target).popover("hide"); }, 10000);
    }

    function mark_words() {


        $('head').append('<style>div.h-usage-example {font-size:80%} .mw-empty-elt{display:none} .slava-popover { all: initial; align-content: normal ; align-items: normal ; align-self: auto ; alignment-baseline: auto ; all: ; animation-delay: 0s ; animation-direction: normal ; animation-duration: 0s ; animation-fill-mode: none ; animation-iteration-count: 1 ; animation-name: none ; animation-play-state: running ; animation-timing-function: ease ; backface-visibility: visible ; background-attachment: scroll ; background-blend-mode: normal ; background-clip: border-box ; background-color: rgba(0, 0, 0, 0) ; background-image: none ; background-origin: padding-box ; background-position-x: 0% ; background-position-y: 0% ; background-repeat-x: ; background-repeat-y: ; background-size: auto ; baseline-shift: 0px ; border-bottom-color: rgb(51, 51, 51) ; border-bottom-left-radius: 0px ; border-bottom-right-radius: 0px ; border-bottom-style: none ; border-bottom-width: 0px ; border-collapse: separate ; border-image-outset: 0px ; border-image-repeat: stretch ; border-image-slice: 100% ; border-image-source: none ; border-image-width: 1 ; border-left-color: rgb(51, 51, 51) ; border-left-style: none ; border-left-width: 0px ; border-right-color: rgb(51, 51, 51) ; border-right-style: none ; border-right-width: 0px ; border-top-color: rgb(51, 51, 51) ; border-top-left-radius: 0px ; border-top-right-radius: 0px ; border-top-style: none ; border-top-width: 0px ; bottom: auto ; box-shadow: none ; box-sizing: border-box ; break-after: auto ; break-before: auto ; break-inside: auto ; buffered-rendering: auto ; caption-side: top ; caret-color: rgb(51, 51, 51) ; clear: none ; clip: auto ; clip-path: none ; clip-rule: nonzero ; color: rgb(51, 51, 51) ; color-interpolation: sRGB ; color-interpolation-filters: linearRGB ; color-rendering: auto ; column-count: auto ; column-fill: balance ; column-gap: normal ; column-rule-color: rgb(51, 51, 51) ; column-rule-style: none ; column-rule-width: 0px ; column-span: none ; column-width: auto ; contain: none ; content: ; counter-increment: none ; counter-reset: none ; cursor: auto ; cx: 0px ; cy: 0px ; d: none ; direction: ltr ; display: block ; dominant-baseline: auto ; empty-cells: show ; fill: rgb(0, 0, 0) ; fill-opacity: 1 ; fill-rule: nonzero ; filter: none ; flex-basis: auto ; flex-direction: row ; flex-grow: 0 ; flex-shrink: 1 ; flex-wrap: nowrap ; float: none ; flood-color: rgb(0, 0, 0) ; flood-opacity: 1 ; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif ; font-feature-settings: normal ; font-kerning: auto ; font-size: 14px ; font-stretch: 100% ; font-style: normal ; font-variant-caps: normal ; font-variant-east-asian: normal ; font-variant-ligatures: normal ; font-variant-numeric: normal ; font-variation-settings: normal ; font-weight: 400 ; grid-auto-columns: auto ; grid-auto-flow: row ; grid-auto-rows: auto ; grid-column-end: auto ; grid-column-gap: 0px ; grid-column-start: auto ; grid-row-end: auto ; grid-row-gap: 0px ; grid-row-start: auto ; grid-template-areas: none ; grid-template-columns: none ; grid-template-rows: none ; hyphens: manual ; image-rendering: auto ; isolation: auto ; justify-content: normal ; justify-items: normal ; justify-self: auto ; left: auto ; letter-spacing: normal ; lighting-color: rgb(255, 255, 255) ; line-break: auto ; line-height: 20px ; list-style-image: none ; list-style-position: outside ; list-style-type: disc ; margin-bottom: 0px ; margin-left: 0px ; margin-right: 0px ; margin-top: 0px ; marker-end: none ; marker-mid: none ; marker-start: none ; mask: none ; mask-type: luminance ; max-block-size: none ; max-height: 95vh ; max-inline-size: none ; max-width: none ; min-block-size: 0px ; min-height: 0px ; min-inline-size: 0px ; min-width: 0px ; mix-blend-mode: normal ; object-fit: fill ; object-position: 50% 50% ; offset-distance: 0px ; offset-path: none ; offset-rotate: auto 0deg ; opacity: 1 ; order: 0 ; orphans: 2 ; outline-color: rgb(51, 51, 51) ; outline-offset: 0px ; outline-style: none ; outline-width: 0px ; overflow-anchor: auto ; overflow-wrap: normal ; overflow-x: visible ; overflow-y: auto ; overscroll-behavior-x: auto ; overscroll-behavior-y: auto ; padding-bottom: 0px ; padding-left: 0px ; padding-right: 0px ; padding-top: 0px ; page: ; paint-order: fill stroke markers ; perspective: none ; pointer-events: auto ; position: static ; quotes: ; r: 0px ; resize: none ; right: auto ; rx: auto ; ry: auto ; scroll-behavior: auto ; shape-image-threshold: 0 ; shape-margin: 0px ; shape-outside: none ; shape-rendering: auto ; size: ; speak: normal ; stop-color: rgb(0, 0, 0) ; stop-opacity: 1 ; stroke: none ; stroke-dasharray: none ; stroke-dashoffset: 0px ; stroke-linecap: butt ; stroke-linejoin: miter ; stroke-miterlimit: 4 ; stroke-opacity: 1 ; stroke-width: 1px ; tab-size: 8 ; table-layout: auto ; text-align: start ; text-align-last: auto ; text-anchor: start ; text-combine-upright: none ; text-decoration-color: rgb(51, 51, 51) ; text-decoration-line: none ; text-decoration-skip-ink: auto ; text-decoration-style: solid ; text-indent: 0px ; text-orientation: mixed ; text-overflow: clip ; text-rendering: auto ; text-shadow: none ; text-size-adjust: 100% ; text-transform: none ; text-underline-position: auto ; top: auto ; touch-action: auto ; transform: none ; transform-box: view-box ; transform-style: flat ; transition-delay: 0s ; transition-duration: 0s ; transition-property: all ; transition-timing-function: ease ; unicode-bidi: normal ; user-select: auto ; vector-effect: none ; vertical-align: baseline ; visibility: visible ; white-space: normal ; widows: 2 ; will-change: auto ; word-break: normal ; word-spacing: 0px ; word-wrap: normal ; writing-mode: horizontal-tb ; x: 0px ; y: 0px ; z-index: auto ; zoom: 1 ; } span.slava-wordclass{font-variant:small-caps} span.slava-wordfreq{font-size:70%} .slava-cases{font-size:70%; color:gray} .slava-pop {color:inherit; text-decoration: none;} .slava-pop:hover { text-decoration: none; border-bottom: #666666; border-width: 0px 0px 1px 0px; border-style: none none dotted none;}</style>');

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
                    var ref = match;
                    var lemmasf = {};
                    if (forms[normalized_word]) {
                        var entry0 = forms[normalized_word];
                        var stress_chars = Array();
                        var spellings = {};
                        $.each(entry0, function (i, entry) {
                            var lemma_entry = entry[0];
                            stress_chars = stress_chars.concat(entry[1]);
                            lemmasf[lemma_entry[0]] = lemma_entry[1];
                            var is_derived = entry[3];
                            if (!is_derived) {
                                var spelling = entry[2].length ? entry[2][0] : normalized_word;
                                spellings[spelling] = 1;
                            }
                        });
                        var matchn = match.replace(UNICODE_COMBINING_ACUTE_ACCENT, '');
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
                                accented += chars.slice(s_pos, stress_char) + UNICODE_COMBINING_ACUTE_ACCENT;
                                s_pos = stress_char;
                            });
                            accented += chars.slice(s_pos);
                            ref = accented;
                        }
                    }
                    else {
                        if (match.length > 3 && match[0] === match[0].toLowerCase()) {
                            console.log("[Slava] No match:" + match);
                        }
                        lemmasf[match] = 0;
                    }
                    var slemmas = JSON.stringify(lemmasf);
                    return "</span>" + '<span class="slava-pop" data-lemmas="' + escapeHtml(slemmas) + '">' + ref + '</span><span>';
                }); // replace
                str = "<span>" + str + "</span>";
                var span = $(str);
                $(val).replaceWith(span);
            });
        });

    }

    $(document).ready(mark_words)

    $("body").on("mouseenter", ".slava-pop", slava_mouseenter);
    $("body").on("mouseleave", ".slava-pop", slava_mouseleave);

    $('#slava-try').on("input", function () {
        console.log($(this).val());
        $('#slava-try-res').text($(this).val());
        mark_words();
    });

})(); //outer function
