import { defineConfig } from "wxt";

const wiktionaryHosts = [
  "https://en.wiktionary.org/*",
  "https://ru.wiktionary.org/*",
  "https://uk.wiktionary.org/*",
  "https://de.wiktionary.org/*",
  "https://fr.wiktionary.org/*",
  "https://es.wiktionary.org/*",
  "https://pt.wiktionary.org/*",
  "https://zh.wiktionary.org/*",
  "https://ja.wiktionary.org/*",
  "https://ko.wiktionary.org/*",
  "https://ar.wiktionary.org/*",
  "https://hi.wiktionary.org/*",
  "https://he.wiktionary.org/*",
  "https://pl.wiktionary.org/*",
  "https://ro.wiktionary.org/*",
  "https://tr.wiktionary.org/*",
  "https://it.wiktionary.org/*",
  "https://kk.wiktionary.org/*",
  "https://lv.wiktionary.org/*",
  "https://et.wiktionary.org/*",
  "https://lt.wiktionary.org/*",
] as const;

export default defineConfig({
  manifest: {
    name: "Slava Russian Dictionary",
    description:
      "Adds Russian stress marks and retrieves definitions on hover or explicit lookup.",
    icons: {
      16: "/owl_16.png",
      48: "/owl_48.png",
      128: "/owl_128.png",
    },
    action: {
      default_icon: {
        16: "/owl_face_16.png",
        32: "/owl_face_32.png",
        48: "/owl_face_48.png",
      },
    },
    permissions: ["activeTab", "offscreen", "scripting", "storage"],
    host_permissions: [...wiktionaryHosts],
    optional_host_permissions: ["http://*/*", "https://*/*"],
  },
});
