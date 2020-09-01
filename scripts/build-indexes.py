from pathlib import Path
import json
import pandas as pd
from progressbar import progressbar
from collections import defaultdict

parsed_top_dir = Path("../build/parsed")
index_top_dir = Path("../build/index")
resources_dir = Path("../build/resources")

config = json.load(open("../conf/config.json"))

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
        freq = pd.Series(p.Rank,index=p.index).to_dict()

        print("Listing files...")
        files = sorted(parsed_dir.glob('*.dat'))

        print("Parsing files...")
        word_counter = 0
        for parsed in progressbar(files):
            with open(parsed) as p:
                for line in p:
                    s = line.rstrip('\n')
                    (declined, base, stress, canonical) = s.split('\t')
                    if not base in words:
                        words[base] = [word_counter, None]
                        word_counter = word_counter + 1
                    b = words[base]
                    word_i = b[0]
                    if stress != "0":
                        forms[declined][word_i][0].add(int(stress))
                    forms[declined][word_i][1].add(canonical)
                    if base in freq:
                        if b[1]:
                          b[1] = min(b[1], freq[base])
                        else:
                          b[1] = freq[base]

        print("Assembling words...")
        words_arr = sorted(list(words.items()), key = lambda e: e[1][0])
        word_ranks = [(w[0], w[1][1] or 0) for w in words_arr]

        print("Assembling forms...")
        for declined, d in progressbar(forms.items()):
            words_new = []
            for word_i, entry in d.items():
                (stresses, canonicals) = entry
                if len(canonicals) == 1 and next(iter(canonicals)) == declined:
                    canonicals = []
                words_new.append([word_i, list(stresses), list(canonicals)])
            forms[declined] = words_new

        print("Writing output in [%s]..." % index_dir)
        with open(Path(index_dir, "words.json"), "w") as f:
            json.dump(word_ranks, f, ensure_ascii=False, separators=(',', ':'))
        with open(Path(index_dir, "forms.json"), "w") as f:
            json.dump(forms, f, ensure_ascii=False, separators=(',', ':'))

print("Completed.")
