// Sceau électronique (PAdES) : certificat de l'entreprise + signature cryptographique du PDF.
import {Buffer} from "buffer";
import forge from "node-forge";
import {PDFDocument} from "pdf-lib";
import {pdflibAddPlaceholder} from "@signpdf/placeholder-pdf-lib";
import {SignPdf} from "@signpdf/signpdf";
import {P12Signer} from "@signpdf/signer-p12";
import {SUBFILTER_ETSI_CADES_DETACHED} from "@signpdf/utils";

// Clés RSA 2048 : générateur natif du navigateur (rapide), sinon forge en secours.
async function generateKeys() {
  if (globalThis.crypto?.subtle) {
    const kp = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
    const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
    const privateKey = forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(forge.util.binary.raw.encode(der)));
    return {privateKey, publicKey: forge.pki.setRsaPublicKey(privateKey.n, privateKey.e)};
  }
  return forge.pki.rsa.generateKeyPair({bits: 2048, workers: 0});
}

// Crée un certificat de cachet auto-émis (valable 10 ans) et le renvoie en .p12 protégé par mot de passe.
export async function createSeal({org, taxId, country = "ES", email = "", password}) {
  const keys = await generateKeys();
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(15));
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(); cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  const attrs = [{name: "commonName", value: org}, {name: "organizationName", value: org}, {name: "countryName", value: country}];
  if (taxId) attrs.push({type: "2.5.4.97", value: "VAT" + country + "-" + taxId, valueTagClass: forge.asn1.Type.UTF8});
  if (email) attrs.push({name: "emailAddress", value: email});
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.setExtensions([{name: "basicConstraints", cA: false}, {name: "keyUsage", digitalSignature: true, nonRepudiation: true}, {name: "subjectKeyIdentifier"}]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {algorithm: "aes256", friendlyName: org});
  const der = forge.asn1.toDer(p12).getBytes();
  return {p12: Uint8Array.from(der, c => c.charCodeAt(0)), fingerprint: forge.md.sha256.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex(), notAfter: cert.validity.notAfter.toISOString()};
}

// Lit le certificat d'un .p12 (vérifie aussi le mot de passe).
export function sealInfo(p12, password) {
  const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(p12));
  const pk = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  const bag = pk.getBags({bagType: forge.pki.oids.certBag})[forge.pki.oids.certBag][0];
  const c = bag.cert;
  const get = n => c.subject.getField(n)?.value || "";
  return {org: get("O") || get("CN"), notAfter: c.validity.notAfter.toISOString(),
    fingerprint: forge.md.sha256.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes()).digest().toHex()};
}

// Scelle le PDF : toute modification ultérieure sera signalée par les lecteurs PDF.
export async function sealPdf(pdfBytes, p12, password, {reason = "Document scellé", location = "", contact = "", name = ""} = {}) {
  const doc = await PDFDocument.load(pdfBytes, {updateMetadata: false});
  pdflibAddPlaceholder({pdfDoc: doc, reason, location, contactInfo: contact, name, signatureLength: 16384, subFilter: SUBFILTER_ETSI_CADES_DETACHED});
  const withPh = Buffer.from(await doc.save({useObjectStreams: false}));
  const signer = new P12Signer(Buffer.from(p12), {passphrase: password});
  const signed = await new SignPdf().sign(withPh, signer, new Date());
  return new Uint8Array(signed);
}
