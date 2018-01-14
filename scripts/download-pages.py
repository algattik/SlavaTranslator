from pathlib import Path
import json
import os
from time import time
import re

os.environ['PYWIKIBOT2_NO_USER_CONFIG']='1'
import pywikibot
from pywikibot import pagegenerators

download_dir = Path("../build/download")

site = pywikibot.Site(code='en', fam='wiktionary')

download_dir.mkdir(parents=True, exist_ok=True)

def toHex(x):
    return "".join([hex(ord(c))[2:].zfill(4) for c in x])

include_cats = [
    ["Russian lemmas", 1],
    ["Russian proper nouns", 0],
]

exclude_cats = [
    ["Russian spellings with е instead of ё", 0],
    ["Russian phrases", 0],
    ["Russian proverbs", 0],
    ["Russian obsolete forms", 0]
]

def download_cat(catName, recurse, callback):
    print(catName)
    cat = pywikibot.Category(site, catName)
    for page in pagegenerators.CategorizedPageGenerator(cat, recurse=recurse, namespaces="0"):
        callback(page)


excluded_pages = set()
for e in exclude_cats:
    download_cat(e[0], e[1], lambda page: excluded_pages.add(page.title()))
    print("Total %d excluded pages" % len(excluded_pages))


for e in include_cats:

    def download_page(page):
        title = page.title()

        if title in excluded_pages:
            return
        if len(title) > 63:
            return

        fileName = toHex(title)
        my_file = Path(download_dir, fileName + ".json")
        if my_file.is_file():
            return

        print(title)
        html = site.get_parsed_page(title)
        html = re.sub("<!--.*?-->", "", html, flags=re.DOTALL)

        my_file.write_text(json.dumps({'title':title, 'text':page.text, 'html':html}, ensure_ascii=False), 'utf-8')

    download_cat(e[0], e[1], download_page)

