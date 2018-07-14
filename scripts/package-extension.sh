#!/bin/sh
set -euo pipefail
mkdir -p ../chrome/generated/resources/ru
cd ../chrome
cp ../build/index/en/ru/words.json generated/resources/ru
cp ../build/index/en/ru/forms.json generated/resources/ru
wget -qO generated/underscore.js "https://cdnjs.cloudflare.com/ajax/libs/underscore.js/1.8.3/underscore-min.js"
wget -qO generated/jquery.js "https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js"
wget -qO generated/bootstrap.js "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"
wget -qO generated/bootstrap.css "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css"
wget -qO generated/bootstrap-toggle.css "https://gitcdn.github.io/bootstrap-toggle/2.2.2/css/bootstrap-toggle.min.css"
wget -qO generated/bootstrap-toggle.js "https://gitcdn.github.io/bootstrap-toggle/2.2.2/js/bootstrap-toggle.min.js"
wget -qO generated/Sortable.js "https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.6.0/Sortable.min.js"
(echo "slavaConfig = "; cat ../conf/config.json) > generated/slavaConfig.js
rm -f ../build/slava-package.zip && zip -r ../build/slava-package.zip .
echo Downloads complete.
