from pathlib import Path
import json
import unicodedata
import pandas as pd
import os
import re
from progressbar import progressbar
from collections import defaultdict

def toHex(x):
    return "".join([hex(ord(c))[2:].zfill(4) for c in x])

normalize_char_map = {'ё':'е', 'Ё':'Е'}
def normalize_string(s):
   norms = unicodedata.normalize('NFC', s)
   noacc =        [c
                  for c in norms
                  if unicodedata.category(c) != 'Mn' #'Mark, Nonspacing' = accents
                  and (
                      not unicodedata.category(c).startswith('P') #Punctuation
                      or c == '-'
                  )]
   normalized = ''.join(normalize_char_map[c] if c in normalize_char_map else c
                  for c in noacc).lower()
   return normalized


parsed_top_dir = Path("../build/parsed")
index_top_dir = Path("../build/index")
resources_dir = Path("../build/resources")

config = json.load(open("../conf/config.json"))

print("""<html><head><base href="https://en.wiktionary.org"></head><body>\n""")

def output_lemma(lemma):
          fn = f"../build/download/{src_lang}/{toHex(lemma)}.json"
          if not os.path.isfile(fn):
            print(f"<h1>not found {lemma}</h1>\n")
            return None
          with open(fn) as f:
            fc = json.load(f)
            t = fc['html']

            r = re.compile(r"""\n<h2><span class="mw-headline" id="Russian">.*?</h2>(.*)""", re.DOTALL)
            r2 = re.compile(r"""\n<h2>.*""", re.DOTALL)
            r3 = re.compile(r"""( ― )?<i lang="ru-Latn".*?</i>""", re.DOTALL)
            r4 = re.compile(r"""<span class="mw-editsection"><span.*?</span></span>""", re.DOTALL)
            r5 = re.compile(r"""\(?<span lang="ru-Latn".*?</span>\)?""", re.DOTALL)
            r6 = re.compile(r"""<span class="mention-gloss-paren.*?</span>""", re.DOTALL)
            r7 = re.compile(r"""<a href="/wiki/Wiktionary:Russian_transliteration".*?</a>""", re.DOTALL)
            r8 = re.compile(r"""<h3><span class="mw-headline" id="(Alternative_forms|Pronunciation|Letter|References|Descendents|Declension|Conjugation|Derived_terms|Related_terms|Coordinate_terms).*?(?=<h3>|\Z)""", re.DOTALL)
            r8a = re.compile(r"""<h4><span class="mw-headline" id="(Alternative_forms|Pronunciation|Letter|References|Descendents|Declension|Conjugation|Derived_terms|Related_terms|Coordinate_terms).*?(?=<h4>|\Z)""", re.DOTALL)
            r8b = re.compile(r"""<h5><span class="mw-headline" id="(Alternative_forms|Pronunciation|Letter|References|Descendents|Declension|Conjugation|Derived_terms|Related_terms|Coordinate_terms).*?(?=<h5>|<h4>|\Z)""", re.DOTALL)
            r9 = re.compile(r"""<h3><span class="mw-headline" id="(Etymology).*?</h3>(.*?)(?=<(h3|h4)>)""", re.DOTALL)
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
              #t = r10.sub("", t)
              t = r11.sub("", t)
            else:
              print(f"<h1>unmatched {lemma}</h1>\n")

            print(f"<h1>{lemma}</h1>\n")
            print(t)
            return fc


for src_lang, targets in config["langpairs"].items():
    for target_lang, langpair in targets.items():

        print("%s => %s" % (src_lang, target_lang))
        index_dir=Path(index_top_dir, src_lang, target_lang)
        parsed_dir=Path(parsed_top_dir, src_lang, target_lang)
        index_dir.mkdir(parents=True, exist_ok=True)
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
          fc = output_lemma(i)
          if not fc:
            continue
          text = fc['text']
          r = re.compile(r"""{{ru-verb\|(.*?)}""", re.DOTALL)
          verbs = r.findall(text)
          print("VERBS:")
          print(verbs)
          for verb in verbs:
            forms = verb.split('|')
            for verb_pair in forms:
              if "=" not in verb_pair:
                continue
              print(f"PAIR:{verb_pair}")
              (pair_aspect, pair_accented) = verb_pair.split('=')
              pair_lemma = normalize_string(pair_accented)
              print(f"{pair_aspect}:{pair_lemma}")
              if pair_lemma in remaining_words:
                print("EXCCC")
                remaining_words = list(filter(lambda a: a != pair_lemma, remaining_words))
                output_lemma(pair_lemma)


