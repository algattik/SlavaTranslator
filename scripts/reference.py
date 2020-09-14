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

def tostring(elem):
            return etree.tostring(elem, encoding="UTF-8").decode('utf-8')

normalize_char_map = {'ё':'е', 'Ё':'Е'}
def normalize_string_nolc(s):
   norms = unicodedata.normalize('NFC', s)
   noacc =        [c
                  for c in norms
                  if unicodedata.category(c) != 'Mn' #'Mark, Nonspacing' = accents
                  ]
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
a {
  color: black;
  text-decoration: none;
}
i {
  font-style: normal;
}
body {
 font-family: Optima, Helvetica, "Segoe UI", Arial, sans-serif;
}
.freq, .freq a {
  color: lightgray;
  font-size: small;
}
h1.first {
  page-break-before: always;
}
</style>
</head>
<body>\n""")

def output_lemma(src_lang, lemma, base_names, lemma_number, html_class):
          if not lemma in base_names:
            print(f"<!-- ERROR: not found {lemma} -->\n")
            return None
          with open(base_names[lemma]) as f:
            fc = json.load(f)
            t = fc['html']
            html = etree.fromstring(t)
            if html.xpath("//h2[span[@id='Russian']]"):
              etree_deleteall(html.xpath("//*[preceding-sibling::h2[1][span[@id!='Russian']]]"))
              etree_deleteall(html.xpath("//*[following-sibling::h2[1][span[@id='Russian']]]"))
              etree_deleteall(html.xpath("//h2"))
              etree_deleteall(html.xpath("//*[@id='toc']"))

              etree_deleteall(html.xpath("//div[contains(@class,'sister-project') or contains(@class,'thumb')]"))
              etree_deleteall(html.xpath("//*[contains(@class,'maintenance-line') or contains(@class,'mw-empty-elt') or contains(@class,'checksense')]" )) # -- лес спокойно
              etree_deleteall(html.xpath("//small")) #лес
              etree_deleteall(html.xpath("//hr")) #важно
              etree_deleteall(html.xpath("//div[contains(@class,'NavHead')]"))
              etree_deleteall(html.xpath("//div[contains(@class,'disambig-see-also')]")) # с

              inflection = html.xpath("//table[contains(@class,'inflection-table')]")
              
              if inflection:
                i = inflection[0] # звать has 2 inflection tables, the second is pre-reform. пропадать has 2 tables, one per etymology
                forms = i.xpath("//span[contains(@class,'form-of')]") #Cyrl form-of lang-ru 1|s|pres|ind-form-of origin-спа́ть
              
              
                s1p = s1f = s2p = s2f = p3p = p3f = None
                loc = None
              
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
                  if " loc|" in form.get("class"):
                    loc = form
              
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
              
                if loc is not None:
                  genpl = i.xpath("""//i[text()="genitive plural"]""")
                  if not genpl:
                    genpl = i.xpath("""//i[text()="genitive"]""")
                  if genpl:
                    genpl[0].getnext().addnext(etree.XML(f"""<span>, <i>locative</i> <b class="Cyrl" lang="ru">{tostring(loc)}</b></span>"""))
                  else:
                    print(f"ERROR: inserting locative {lemma}")
              
              etree_deleteall(html.xpath("//table"))
              t = tostring(html)
              
              r3 = re.compile(r"""(\s*―\s*)?<i lang="ru-Latn".*?</i>""", re.DOTALL)
              r4 = re.compile(r"""<span class="mw-editsection"><span.*?</span></span>""", re.DOTALL)
              r5 = re.compile(r"""\s*\(?<span lang="ru-Latn".*?</span>\)?\s*""", re.DOTALL)
              r6 = re.compile(r"""\s*<span class="mention-gloss-paren.*?</span>""", re.DOTALL)
              r7 = re.compile(r"""<a href="/wiki/Wiktionary:Russian_transliteration".*?</a>""", re.DOTALL)
              r8 = re.compile(r"""<h3><span class="mw-headline" id="(Conjugation_|Alternative_forms|Pronunciation|Letter|References|Descendants|Declension|Derived_terms|Related_terms|See_also|Further_reading|Coordinate_terms).*?(?=<h3>|\Z)""", re.DOTALL)
              r8a = re.compile(r"""<h4><span class="mw-headline" id="(Conjugation_|Alternative_forms|Pronunciation|Letter|References|Descendants|Declension|Derived_terms|Related_terms|See_also|Further_reading|Coordinate_terms).*?(?=<(h4|h3)>|\Z)""", re.DOTALL)
              r8b = re.compile(r"""<h5><span class="mw-headline" id="(Conjugation_|Alternative_forms|Pronunciation|Letter|References|Descendants|Declension|Derived_terms|Related_terms|See_also|Further_reading|Coordinate_terms).*?(?=<(h5|h4|h3)>|\Z)""", re.DOTALL)
              r9 = re.compile(r"""<h3><span class="mw-headline" id="(Etymology).*?</h3>(.*?)(?=<(h3|h4)>)""", re.DOTALL)
              r9z = re.compile(r"""<(h4|h5)>(<span class="mw-headline".*?</span>)</\1>""")
              r10 = re.compile(r"""<p><strong class="Cyrl headword.*?</p>""", re.DOTALL)
              r11 = re.compile(r"""<p>From <span class="etyl">.*?</p>""", re.DOTALL)
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
              print(f"<h1>ERROR: unmatched {lemma}</h1>\n")

            if not lemma_number:
              lemma_number = ""

            print(f"""<h1 class="{html_class}"><a href="https://en.wiktionary.org/wiki/{lemma}#Russian">{lemma}</a> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class='freq'>{lemma_number}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://context.reverso.net/translation/russian-english/{lemma}">[R]</a></span></h1>\n""")
            print(t)
            print("</div>")
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
    p = p.replace({'Lemma': 'говорят'}, 'говоря')
    p = p.replace({'Lemma': 'взаимоотношения'}, 'взаимоотношение')
    p = p.replace({'Lemma': 'несмотря'}, 'несмотря на')
    p = p[p.PoS != 's.PROP'].groupby('Lemma').sum()

    # Word frequency by number of docs in which the word appear
    # Break ties by dispersion index, then overall frequency
    p['Score'] = (
        p.Doc.rank() * len(p)**2
        + p.D.rank() * len(p)
        + p['Freq(ipm)']
    )
    p['Rank'] = p.Score.rank(method='min', ascending=False).astype(int)
    remaining_words = list(p.sort_values(by='Rank').index)
    #remaining_words = [ "судьба"]

    lemma_number=1
    while remaining_words:
      if lemma_number >5000:
        break
      lemma = remaining_words.pop(0)
      fc = output_lemma(src_lang, lemma, base_names, lemma_number, "first")
      if not fc:
        continue
      lemma_number = lemma_number + 1
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
            output_lemma(src_lang, pair_lemma, base_names, None, "second")


build_ref('en', 'ru')
