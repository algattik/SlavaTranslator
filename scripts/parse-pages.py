from lxml import etree
import unicodedata
from pathlib import Path
from progressbar import progressbar
import json

config = json.load(open("../conf/config.json"))

download_dir = Path("../build/download")
parsed_dir = Path("../build/parsed")
normalize_char_map = {'ё':'е', 'Ё':'Е'}
vowels = 'аэыуояеёюи'

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
   stress=None
   if vowel_count(normalized) > 1:
       for p, c in enumerate(norms):
           if unicodedata.category(c) == 'Mn':  # 'Mark, Nonspacing' = accents
               stress = p
               break

   return tuple([normalized, stress, ''.join(noacc)])

def add_norm(forms, html, xpath):
    inflected = html.xpath(xpath)
    for s in inflected:
        t = s.xpath("string(.)")
        forms.add(normalize_string(t))

def vowel_count(txt):
    count = 0
    txt = txt.lower()
    for vowel in vowels:
        count = count + txt.count(vowel)
    return count

def parse_file(f, src_lang, destdir):

    pageJson=json.load(open(str(f)))
    of=pageJson['html']
    title = pageJson['title']
    html = etree.fromstring(of)

    for target_lang, langpair in config["langpairs"][src_lang].items():
        lang_name = langpair["lang_span_name"]
        langs = html.xpath("//h2/span[text()='%s' and contains(@class,'mw-headline')]" % lang_name)
        if not langs: #does not work for Serbo-Croatian
            continue
        forms = set()

        span_selector = "//*[preceding-sibling::h2[1]/span[text()='%s']]" % lang_name
        td_selector_template = "%s//table[contains(@class,'inflection-table')]/%s/tr/td//span[@lang='%s']"
        for tbody_selector in ['tbody', '.']:
            td_selector = td_selector_template % (span_selector, tbody_selector, target_lang)
            add_norm(forms, html, td_selector)
        add_norm(forms, html, "%s//strong[contains(@class,'headword') and @lang='%s']" % (span_selector, target_lang))

        dir = Path(destdir, target_lang)
        dir.mkdir(parents=True, exist_ok=True)
        file = Path(dir, Path(f).with_suffix('.dat').name)
        s = ''.join(["%s\t%s\t%s\t%s\n" % (form[0], title, form[1] if form[1] else 0, form[2]) for form in forms])
        file.write_text(s, encoding='utf8')

        marker.write_bytes(b'')


for src_lang, targets in config["langpairs"].items():
    lang_dir = Path(download_dir, src_lang)

    destdir = Path(parsed_dir, src_lang)
    marker_dir = Path(destdir, "_done")
    marker_dir.mkdir(parents=True, exist_ok=True)

    print("Source language: [%s]" % src_lang)
    print("Listing files...")
    files = sorted(lang_dir.glob("*.json"))

    new_pages = 0

    print("Parsing files...")
    for f in progressbar(files):

        marker = Path(marker_dir, Path(f).name)
        if marker.is_file():
            continue

        new_pages = new_pages + 1

        parse_file(f, src_lang, destdir)

    print("Parsed %d new pages out of %d total pages." % (new_pages, len(files)))

