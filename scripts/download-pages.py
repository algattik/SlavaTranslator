from pathlib import Path
import json
import os
import re
from collections import defaultdict
import progressbar

os.environ['PYWIKIBOT2_NO_USER_CONFIG']='1'
import pywikibot
from pywikibot import pagegenerators

download_dir = Path("../build/download")
config = json.load(open("../conf/config.json"))

includes = defaultdict(list)
excludes = defaultdict(list)
for src_lang, targets in config["langpairs"].items():
    for target_lang, langpair in targets.items():
        if "include" in langpair:
            includes[src_lang].extend(langpair["include"])
        if "exclude" in langpair:
            excludes[src_lang].extend(langpair["exclude"])

def toHex(x):
    return "".join([hex(ord(c))[2:].zfill(4) for c in x])

def download_cat(site, cat, callback):
    catName = cat["category"]
    recurse = cat["recurse"] if "recurse" in cat else None
    category = pywikibot.Category(site, catName)
    bar = progressbar.ProgressBar(max_value=category.categoryinfo['pages'])
    count = 0
    for page in pagegenerators.CategorizedPageGenerator(category, recurse=recurse, namespaces="0"):
        count = count + 1
        try:
          bar.update(count)
        except ValueError:
          pass
        callback(page)
    bar.finish()
    if count == 0:
      print("Category not found")
      raise ValueError(category)


for src_lang, incl in includes.items():
    print("Language: %s" % src_lang)
    site = pywikibot.Site(code=src_lang, fam='wiktionary')
    
    download_lang_dir = Path(download_dir, src_lang)
    download_lang_dir.mkdir(parents=True, exist_ok=True)
    
    excluded_pages = set()
    for excluded_cat in excludes[src_lang]:
        print("Excluding pages from category [%s]" % excluded_cat['category'])
        download_cat(site, excluded_cat, lambda page: excluded_pages.add(page.title()))
    
    for included_cat in incl:
    
        def download_page(page):
            title = page.title()
    
            if title in excluded_pages:
                return
            if len(title) > 63:
                return
    
            fileName = toHex(title)
            my_file = Path(download_lang_dir, fileName + ".json")
            if my_file.is_file():
                return
    
            html = site.get_parsed_page(title)
            html = re.sub("<!--.*?-->", "", html, flags=re.DOTALL)
    
            my_file.write_text(json.dumps({'title':title, 'text':page.text, 'html':html}, ensure_ascii=False), 'utf-8')
    
        print("Including pages from category [%s]" % included_cat['category'])
        download_cat(site, included_cat, download_page)

