from pathlib import Path
import json
from progressbar import progressbar
from collections import defaultdict

parsed_top_dir = Path("../build/parsed")
index_top_dir = Path("../build/index")
resources_dir = Path("../build/resources")

config = json.load(open("../conf/config.json"))

# ranking, adapted from https://stackoverflow.com/a/30801799

def rank_simple(vector, reverse):
    return sorted(range(len(vector)), key=vector.__getitem__, reverse=reverse)

def rankdata(a, method='average', reverse=False):
    n = len(a)
    ivec=rank_simple(a, reverse)
    svec=[a[rank] for rank in ivec]
    sumranks = 0
    dupcount = 0
    newarray = [0]*n
    for i in range(n):
        sumranks += i
        dupcount += 1
        if i==n-1 or svec[i] != svec[i+1]:
            for j in range(i-dupcount+1,i+1):
                if method=='average':
                    averank = sumranks / float(dupcount) + 1
                    newarray[ivec[j]] = averank
                elif method=='max':
                    newarray[ivec[j]] = i+1
                elif method=='min':
                    newarray[ivec[j]] = i+1 -dupcount+1
                else:
                    raise NameError('Unsupported method')

            sumranks = 0
            dupcount = 0


    return newarray


for src_lang, targets in config["langpairs"].items():
    for target_lang, langpair in targets.items():

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
                        words[base] = [word_counter, 0]
                        word_counter = word_counter + 1
                    b = words[base]
                    word_i = b[0]
                    if stress != "0":
                        forms[declined][word_i][0].add(int(stress))
                    forms[declined][word_i][1].add(canonical)
                    if declined in freq2:
                        b[1] = b[1] + freq2[declined]

        print("Assembling words...")
        words_arr = sorted(list(words.items()), key = lambda e: e[1][0])

        print("Computing frequency ranks...")
        freq_ranks = rankdata([f[1] for f in words.values()], method='min', reverse=True)
        words_with_freq = list(zip([w[0] for w in words_arr], freq_ranks))

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
            json.dump(words_with_freq, f, ensure_ascii=False, separators=(',', ':'))
        with open(Path(index_dir, "forms.json"), "w") as f:
            json.dump(forms, f, ensure_ascii=False, separators=(',', ':'))

print("Completed.")
