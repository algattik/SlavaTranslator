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

    function escapeHtml(string) {
        return String(string).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s];
        });
    }

    function parse_wiki(dom, page_url, freq) {
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
            var s = $('<span class="wordclass">' + $(this).text() + '</span>');
            $(this).parent().next().children(':first-child').after(s).after(' ');
            s.after(' <span class="wordfreq">' + freq + '</span>');
        });

        var defn = wordClassHeadings.parent().nextUntil('hr,h1,h2,h3,h4,h5'); // e.g. with hr: после

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


        return defn;

    }

    var forms_q = $.getJSON(chrome.extension.getURL('generated/resources/ru/forms.json'));
    var lemmas_q = $.getJSON(chrome.extension.getURL('generated/resources/ru/words.json'));

    $.when(forms_q, lemmas_q).done(function (forms_r, lemmas_r) {
        var forms = forms_r[0];
        var lemmas = lemmas_r[0];
        $(document).ready(function () {


            $('head').prepend('<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" type="text/css" />');
            $('head').append('<style>div.h-usage-example {font-size:80%} span.wordclass{font-variant:small-caps} span.wordfreq{font-size:70%} a.tm-pop {color:inherit; text-decoration: none;} a.tm-pop:hover { text-decoration: none; border-bottom: #666666; border-width: 0px 0px 1px 0px; border-style: none none dotted none;}</style>');

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
            var v = getTextNodesIn(document.body);

            var accent = '\u0301';
            var re = /[\wа-я\u0301]+/ig;
            $.each(v, function (i, val) {
                var t1 = $(val).text();
                if (!t1.includes("Миха")) {
                    //  return;
                }


                var str = t1.replace(re, function (match, group) {
                    var match2 = match.replace(accent, '');
                    var vk = match2.toLowerCase();
                    if (forms[vk]) {
                        var entry0 = forms[vk];
                        var ref = match2;
                        var lemma = null;
                        var stress_chars = Array();
                        var lemmasf = {};
                        $.each(entry0, function (i, entry) {
                            var word_idx = entry[0];
                            var stress_char = entry[1];
                            var lemma_entry = lemmas[word_idx];
                            lemmasf[lemma_entry[0]] = lemma_entry[1];
                            if (stress_char) {
                                stress_chars.push(stress_char);
                            }
                        });

                        // match capitalization
                        if (match2[0].toLowerCase() != match2[0]) {
                            if (match2.length > 1 && match2[1].toLowerCase() != match2[1]) {
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
                        return "</span>" + '<a tabindex="0" class="tm-pop" data-lemmas="' + escapeHtml(slemmas) + '">' + ref + '</a><span>';
                    }
                    else {
                        return match;
                    }
                }); // replace
                str = "<span>" + str + "</span>";
                var span = $(str);
                $(val).replaceWith(span);
            });

            // });

            $("body").on("mouseover", "a.tm-pop", function (event) {
                $(".popover").css("display", "none");
                event.target.setAttribute("data-popover_on", "1");
                setTimeout(function () {
                    if (!event.target.getAttribute("data-popover_on")) {
                        return;
                    }
                    var data = { "words": [event.target.textContent] };
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
                                dom = parse_wiki(dom, page_url, freq);
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

            $("body").on("mouseout", "a.tm-pop", function (event) {
                event.target.removeAttribute("data-popover_on");
                setTimeout(function(){$(event.target).popover("hide");}, 10000);
            }); // on mouseout

        }); // document.ready
    });

})(); //outer function
