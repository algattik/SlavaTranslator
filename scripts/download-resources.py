from pathlib import Path
import json
import requests

config = json.load(open("../conf/config.json"))

download_dir = Path("../build/resources")
download_dir.mkdir(parents=True, exist_ok=True)

for lang, conf in config["languages"].items():
    r = requests.get(conf["frequency_file"])
    file = Path(download_dir, lang + ".freq.txt")
    print(conf["frequency_file"])
    with open(file, 'wb') as f:  
        f.write(r.content)
