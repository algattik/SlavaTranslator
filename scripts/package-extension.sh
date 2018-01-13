#!/bin/sh
set -euo pipefail
mkdir -p ../chrome/generated/resources/ru
cd ../chrome
cp ../build/index/ru/words.json generated/resources/ru
cp ../build/index/ru/forms.json generated/resources/ru
wget -qO generated/underscore-min.js "https://cdnjs.cloudflare.com/ajax/libs/underscore.js/1.8.3/underscore-min.js"
wget -qO generated/jquery.min.js "https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js"
wget -qO generated/bootstrap.min.js "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"
