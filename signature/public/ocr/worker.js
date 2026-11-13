// Les fichiers de langue sont publiés en .wasm (format accepté par l'hébergeur) : on redirige les téléchargements du moteur.
const nativeFetch = self.fetch.bind(self);
self.fetch = (url, opts) => nativeFetch(String(url).replace(/\.traineddata(\.gz)?$/, ".lang.wasm"), opts);
importScripts("worker.min.js");
