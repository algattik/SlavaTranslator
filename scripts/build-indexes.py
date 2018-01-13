from pathlib import Path
import json
from collections import defaultdict

parsed_top_dir = Path("../build/parsed")
index_top_dir = Path("../build/index")

for lang in ['ru']:
        index_dir=Path(index_top_dir, lang)
        parsed_dir=Path(parsed_top_dir, lang)
        index_dir.mkdir(parents=True, exist_ok=True)
        words = dict()
        forms = defaultdict(lambda : defaultdict(set))

        word_counter = 0
        for parsed in parsed_dir.glob('*.dat'):
            with open(parsed) as p:
                for line in p:
                    s = line.rstrip('\n')
                    (declined, base, stress) = s.split('\t')
                    if not base in words:
                        words[base] = word_counter
                        word_counter = word_counter + 1
                    word_i = words[base]
                    forms[declined][word_i].add(int(stress))

        words_sorted = sorted(words, key=words.get)
        for declined, d in forms.items():
            words_new = []
            for word_i, stresses in d.items():
                ct = [word_i]
                if 0 in stresses:
                    stresses.remove(0)
                ct.extend(stresses)
                words_new.append(ct)
            forms[declined] = words_new

        with open(Path(index_dir, "words.json"), "w") as f:
            json.dump(words_sorted, f, ensure_ascii=False, separators=(',', ':'))
        with open(Path(index_dir, "forms.json"), "w") as f:
            json.dump(forms, f, ensure_ascii=False, separators=(',', ':'))
