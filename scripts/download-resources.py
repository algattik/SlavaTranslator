from pathlib import Path
import json
import requests
import zipfile
import io
import shutil

config = json.load(open("../conf/config.json"))

download_dir = Path("../build/resources")
download_dir.mkdir(parents=True, exist_ok=True)

for lang, conf in config["languages"].items():
    (zip_file, csv_file) = conf["frequency_file"].split("!")
    r = requests.get(zip_file)
    file = Path(download_dir, lang + ".freq.txt")
    # Create a ZipFile Object and load sample.zip in it
    with zipfile.ZipFile(io.BytesIO(r.content), 'r') as zipObj:
        a = zipObj.extract(csv_file, download_dir)
        shutil.move(a, file)

