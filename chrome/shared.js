
    // Unicode COMBINING ACUTE ACCENT character, used to mark stress on Russian words
    UNICODE_COMBINING_ACUTE_ACCENT = '\u0301';

console.log("loading shared");
    function normalize(str) {
        str = str.replace(UNICODE_COMBINING_ACUTE_ACCENT, '');
        str = str.toLowerCase();
        str = str.replace('ё', 'е');
        return str;
    }
