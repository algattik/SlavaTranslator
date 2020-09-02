from pathlib import Path
import json
import unicodedata
from lxml import etree
import pandas as pd
import os
import re
from progressbar import progressbar
from collections import defaultdict
from copy import deepcopy

def etree_deleteall(span):
            [bad.getparent().remove(bad) for bad in span]

normalize_char_map = {'ё':'е', 'Ё':'Е'}
def normalize_string_nolc(s):
   norms = unicodedata.normalize('NFC', s)
   noacc =        [c
                  for c in norms
                  if unicodedata.category(c) != 'Mn' #'Mark, Nonspacing' = accents
                  and (
                      not unicodedata.category(c).startswith('P') #Punctuation
                      or c == '-'
                  )]
   normalized = ''.join(normalize_char_map[c] if c in normalize_char_map else c
                  for c in noacc)
   return normalized


top_dir = Path("../build/download")
resources_dir = Path("../build/resources")

config = json.load(open("../conf/config.json"))

print("""
<html><head>
<base href="https://en.wiktionary.org">
<style>
</style>
</head>
<body>\n""")


def output_lemma(src_lang, lemma, base_names):
          if not lemma in base_names:
            print(f"<h1>not found {lemma}</h1>\n")
            return None
          with open(base_names[lemma]) as f:
            fc = json.load(f)
            t = fc['html']

            html = etree.fromstring(t)
            etree_deleteall(html.xpath("//div[contains(@class,'sister-project') or contains(@class,'thumb')]"))
            etree_deleteall(html.xpath("//*[contains(@class,'maintenance-line') or contains(@class,'mw-empty-elt') or contains(@class,'checksense')]" )) # -- лес спокойно
            etree_deleteall(html.xpath("//small")) #лес
            etree_deleteall(html.xpath("//hr")) #важно
            etree_deleteall(html.xpath("//div[contains(@class,'NavHead')]"))

            for i in html.xpath("//table[contains(@class,'inflection-table')]")[1:]:
              i.getparent().remove(i)

            for i in html.xpath("//table"):
              forms = i.xpath("//span[contains(@class,'form-of')]") #Cyrl form-of lang-ru 1|s|pres|ind-form-of origin-спа́ть

              s1p = s1f = s2p = s2f = p3p = p3f = None
              for form in forms:

                if " 1|s|pres|" in form.get("class"): #imperfective
                  s1p = form
                elif " 1|s|fut|" in form.get("class"): #perfective
                  s1f = form
                if " 2|s|pres|" in form.get("class"):
                  s2p = form
                if " 2|s|fut|" in form.get("class"):
                  s2f = form
                if " 3|p|pres|" in form.get("class"):
                  p3p = form
                if " 3|p|fut|" in form.get("class"):
                  p3f = form

              if s1p is not None:
                i.getparent().append(deepcopy(s1p))
              elif s1f is not None:
                i.getparent().append(deepcopy(s1f))
              if s2p is not None:
                e = etree.Element("span")
                e.text = ", "
                i.getparent().append(e)
                i.getparent().append(deepcopy(s2p))
              elif s2f is not None:
                e = etree.Element("span")
                e.text = ", "
                i.getparent().append(e)
                i.getparent().append(deepcopy(s2f))
              if p3p is not None:
                e = etree.Element("span")
                e.text = ", "
                i.getparent().append(e)
                i.getparent().append(deepcopy(p3p))
              elif p3f is not None:
                e = etree.Element("span")
                e.text = ", "
                i.getparent().append(e)
                i.getparent().append(deepcopy(p3f))
              i.getparent().remove(i)

            t = etree.tostring(html, encoding="UTF-8").decode('utf-8')

            r = re.compile(r"""<h2><span class="mw-headline" id="Russian">.*?</h2>(.*)""", re.DOTALL)
            r2 = re.compile(r"""\n<h2>.*""", re.DOTALL)
            r3 = re.compile(r"""(\s*&#8213;\s*)?<i lang="ru-Latn".*?</i>""", re.DOTALL)
            r4 = re.compile(r"""<span class="mw-editsection"><span.*?</span></span>""", re.DOTALL)
            r5 = re.compile(r"""\s*\(?<span lang="ru-Latn".*?</span>\)?""", re.DOTALL)
            r6 = re.compile(r"""<span class="mention-gloss-paren.*?</span>""", re.DOTALL)
            r7 = re.compile(r"""<a href="/wiki/Wiktionary:Russian_transliteration".*?</a>""", re.DOTALL)
            r8 = re.compile(r"""<h3><span class="mw-headline" id="(Alternative_forms|Pronunciation|Letter|References|Descendants|Declension|Derived_terms|Related_terms|See_also|Coordinate_terms).*?(?=<h3>|\Z)""", re.DOTALL)
            r8a = re.compile(r"""<h4><span class="mw-headline" id="(Alternative_forms|Pronunciation|Letter|References|Descendants|Declension|Derived_terms|Related_terms|See_also|Coordinate_terms).*?(?=<h4>|\Z)""", re.DOTALL)
            r8b = re.compile(r"""<h5><span class="mw-headline" id="(Alternative_forms|Pronunciation|Letter|References|Descendants|Declension|Derived_terms|Related_terms|See_also|Coordinate_terms).*?(?=<h5>|<h4>|\Z)""", re.DOTALL)
            r9 = re.compile(r"""<h3><span class="mw-headline" id="(Etymology).*?</h3>(.*?)(?=<(h3|h4)>)""", re.DOTALL)
            r9z = re.compile(r"""<(h4|h5)>(<span class="mw-headline".*?</span>)</\1>""")
            r10 = re.compile(r"""<p><strong class="Cyrl headword.*?</p>""", re.DOTALL)
            r11 = re.compile(r"""<p>From <span class="etyl">.*?</p>""", re.DOTALL)
            matched = r.search(t)
            if (matched):
              t = matched.group(1)
              t = r2.sub("", t)
              t = r3.sub("", t)
              t = r4.sub("", t)
              t = r5.sub("", t)
              t = r6.sub("", t)
              t = r7.sub("", t)
              t = r8.sub("", t)
              t = r8a.sub("", t)
              t = r8b.sub("", t)
              t = r9.sub("", t)
              t = r9z.sub(r"<h3>\2</h3>", t)
              #t = r10.sub("", t)
              t = r11.sub("", t)
              t = t.replace("<i>genitive</i>", "<i>gen</i>")
              t = t.replace("<i>nominative plural</i>", "<i>pl</i>")
              t = t.replace("<i>genitive plural</i>", "<i>gen pl</i>")
              t = t.replace("<i>feminine</i>", "<i>fem</i>")
              t = t.replace("<i>related adjective</i>", "<i>rel adj</i>")
            else:
              print(f"<h1>unmatched {lemma}</h1>\n")

            print(f"<h1>{lemma}</h1>\n")


            print(t)
            return fc


def build_ref(src_lang, target_lang):

    download_dir = Path(top_dir, src_lang)
    files = list(download_dir.glob("*.json"))
    base_names = dict()
    for f in files:
      string = os.path.basename(f).replace(".json", "")
      base_name = "".join(chr(int(string[0+i:4+i], 16)) for i in range(0, len(string), 4))
      base_names[base_name] = f
      base_names[normalize_string_nolc(base_name)] = f

    words = dict()
    forms = defaultdict(lambda : defaultdict(lambda : [set(), set()]))

    freqfile = Path(resources_dir, target_lang + ".freq.txt")
    p = pd.read_csv(freqfile, sep='\t')
    p = p.groupby('Lemma').sum()

    # Word frequency by number of docs in which the word appear
    # Break ties by dispersion index, then overall frequency
    p['Score'] = (
        p.Doc.rank() * len(p)**2
        + p.D.rank() * len(p)
        + p['Freq(ipm)']
    )
    p['Rank'] = p.Score.rank(method='min', ascending=False).astype(int)
    remaining_words = list(p.sort_values(by='Rank').head(5000).index)

    while remaining_words:
      i = remaining_words.pop(0)
      fc = output_lemma(src_lang, i, base_names)
      if not fc:
        continue
      text = fc['text']
      r = re.compile(r"""{{ru-verb\|(.*?)}""", re.DOTALL)
      verbs = r.findall(text)
      for verb in verbs:
        forms = verb.split('|')
        for verb_pair in forms:
          if "=" not in verb_pair:
            continue
          (pair_aspect, pair_accented) = verb_pair.split('=')
          pair_lemma = normalize_string_nolc(pair_accented)
          if pair_lemma in remaining_words:
            remaining_words = list(filter(lambda a: a != pair_lemma, remaining_words))
            output_lemma(src_lang, pair_lemma, base_names)


build_ref('en', 'ru')
