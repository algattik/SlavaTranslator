from pathlib import Path
import json
from collections import defaultdict

parsed_top_dir = Path("../build/parsed")
index_top_dir = Path("../build/index")
resources_dir = Path("../build/resources")

config = json.load(open("../conf/config.json"))

for langpair in config["langpairs"]:
        src_lang = langpair["src_lang"]
        target_lang = langpair["target_lang"]

        print("%s => %s" % (src_lang, target_lang))
        index_dir=Path(index_top_dir, src_lang, target_lang)
        parsed_dir=Path(parsed_top_dir, src_lang, target_lang)
        index_dir.mkdir(parents=True, exist_ok=True)
        words = dict()
        forms = defaultdict(lambda : defaultdict(lambda : [set(), set()]))

        freqfile = Path(resources_dir, target_lang + ".freq.txt")
        freq2 = defaultdict(lambda : 0)
        with open(freqfile) as p:
            for line in p:
                (form, count) = line.rstrip('\n').split(' ')
                c = int(count)
                freq2[form] = freq2[form] + c

        word_counter = 0
        for parsed_i, parsed in enumerate(sorted(parsed_dir.glob('*.dat'))):
            if parsed_i % 5000 == 0:
                print("%s..." % parsed_i)
            with open(parsed) as p:
                for line in p:
                    s = line.rstrip('\n')
                    (declined, base, stress, canonical) = s.split('\t')
                    if not base in words:
                        words[base] = [word_counter, 0]
                        word_counter = word_counter + 1
                    b = words[base]
                    word_i = b[0]
                    if stress != "0":
                        forms[declined][word_i][0].add(int(stress))
                    forms[declined][word_i][1].add(canonical)
                    if declined in freq2:
                        b[1] = b[1] + freq2[declined]

        print("Processing...")
        all_freqs = sorted((f[1] for f in words.values()), reverse=True)

        words_arr = sorted(list(words.items()), key = lambda e: e[1][0])
        words_arr = [[i[0], next(j+1 for j,x in enumerate(all_freqs) if i[1][1]>=x)] for i in words_arr]

        for declined, d in forms.items():
            words_new = []
            for word_i, entry in d.items():
                (stresses, canonicals) = entry
                if len(canonicals) == 1 and next(iter(canonicals)) == declined:
                    canonicals = []
                words_new.append([word_i, list(stresses), list(canonicals)])
            forms[declined] = words_new

        print("Writing output...")
        with open(Path(index_dir, "words.json"), "w") as f:
            json.dump(words_arr, f, ensure_ascii=False, separators=(',', ':'))
        with open(Path(index_dir, "forms.json"), "w") as f:
            json.dump(forms, f, ensure_ascii=False, separators=(',', ':'))

print("Completed.")
