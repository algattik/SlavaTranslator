from lxml import etree
from iso639 import languages
import unicodedata
from pathlib import Path
import json

download_dir = Path("../build/download")
parsed_dir = Path("../build/parsed")

marker_dir = Path(parsed_dir, "_done")
marker_dir.mkdir(parents=True, exist_ok=True)

def normalize_string(s):
   noacc = ''.join(c for c in unicodedata.normalize('NFC', s.lower())
                  if unicodedata.category(c) != 'Mn' #'Mark, Nonspacing' = accents
                  and (
                      not unicodedata.category(c).startswith('P')) #Punctuation
                      or c == '-'
                  )
   stress=None
   for p, c in enumerate(s):
       if unicodedata.category(c) == 'Mn':  # 'Mark, Nonspacing' = accents
           stress = p
           break

   return tuple([noacc, stress])

def add_norm(forms, inflected):
    for s in inflected:
        forms.add(normalize_string(s))

langref = languages.inverted

for f in sorted(download_dir.glob("*.json")):

    marker = Path(marker_dir, Path(f).name)
    if marker.is_file():
        continue

    pageJson=json.load(open(f))
    of=pageJson['html']
    title = pageJson['title']
    print(title)
    html = etree.fromstring(of)
    langs = html.xpath("//h2/span[contains(@class,'mw-headline')]")

    for lang in langs:
        langid = lang.get("id");
        langn = lang.text
        if not langn in langref: #e.g. Translingual
            continue
        langcode = langref[langn].part1
        forms = set()
        if not langcode: #does not work for Serbo-Croatian
            continue

        inflected = html.xpath("//*[preceding-sibling::h2[1]/span[@id='%s']]//table[contains(@class,'inflection-table')]/tr/td/span[@lang='%s']//text()" % (langid, langcode))
        add_norm(forms, inflected)
        headword = html.xpath("//*[preceding-sibling::h2[1]/span[@id='%s']]//strong[contains(@class,'headword') and @lang='%s']//text()" % (langid, langcode))
        add_norm(forms, headword)

        dir = Path(parsed_dir, langcode)
        dir.mkdir(parents=True, exist_ok=True)
        file = Path(dir, Path(f).with_suffix('.dat').name)
        s = ''.join(["%s\t%s\t%s\n" % (form[0], title, form[1] if form[1] else 0) for form in forms])
        file.write_text(s, encoding='utf8')

        marker.write_bytes(b'')

