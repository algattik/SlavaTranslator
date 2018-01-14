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

def add_norm(forms, html, xpath):
    inflected = html.xpath(xpath)
    for s in inflected:
        t = s.xpath("string(.)")
        forms.add(normalize_string(t))

langref = languages.inverted

files = sorted(download_dir.glob("*.json"))

new_pages = 0

for f_i, f in enumerate(files):
    if f_i % 1000 == 0:
        print("%s..." % f_i)

    marker = Path(marker_dir, Path(f).name)
    if marker.is_file():
        continue

    new_pages = new_pages + 1
    pageJson=json.load(open(f))
    of=pageJson['html']
    title = pageJson['title']
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

        add_norm(forms, html, "//*[preceding-sibling::h2[1]/span[@id='%s']]//table[contains(@class,'inflection-table')]/tr/td/span[@lang='%s']" % (langid, langcode))
        add_norm(forms, html, "//*[preceding-sibling::h2[1]/span[@id='%s']]//strong[contains(@class,'headword') and @lang='%s']" % (langid, langcode))

        dir = Path(parsed_dir, langcode)
        dir.mkdir(parents=True, exist_ok=True)
        file = Path(dir, Path(f).with_suffix('.dat').name)
        s = ''.join(["%s\t%s\t%s\n" % (form[0], title, form[1] if form[1] else 0) for form in forms])
        file.write_text(s, encoding='utf8')

        marker.write_bytes(b'')

print("Parsed %d new pages out of %d total pages." % (new_pages, len(files)))
