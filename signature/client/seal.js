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

// Vérifie un PDF signé avec un certificat électronique (PAdES, par exemple avec AutoFirma, DNIe ou FNMT).
// Contrôle l'empreinte du contenu signé et la signature elle-même. La chaîne de confiance jusqu'à l'autorité
// (FNMT, Policía Nacional…) n'est pas vérifiée ici : l'émetteur est affiché pour contrôle.
const DIGEST = {"2.16.840.1.101.3.4.2.1": "SHA-256", "2.16.840.1.101.3.4.2.2": "SHA-384", "2.16.840.1.101.3.4.2.3": "SHA-512", "1.3.14.3.2.26": "SHA-1"};
export async function verifyPades(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const out = {valid: false};
  let txt = ""; for (let i = 0; i < u8.length; i += 65536) txt += String.fromCharCode.apply(null, u8.subarray(i, i + 65536));
  const at = txt.lastIndexOf("/ByteRange");
  if (at < 0) return {...out, reason: "Ce PDF ne contient aucune signature électronique."};
  const m = txt.slice(at, at + 200).match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  if (!m) return {...out, reason: "Signature illisible."};
  const [a, b, c, d] = m.slice(1).map(Number);
  if (a !== 0 || c + d > u8.length || c <= b) return {...out, reason: "Signature mal formée."};
  out.coversWholeFile = c + d === u8.length;
  out.signedLength = c + d;
  const hex = txt.slice(b + 1, c - 1).replace(/[^0-9a-fA-F]/g, "");
  const der = forge.util.hexToBytes(hex);
  let si, certs = [];
  try {
    const cms = forge.asn1.fromDer(der, {parseAllBytes: false});
    const sd = cms.value[1].value[0];              // SignedData
    for (const node of sd.value) {
      if (node.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && node.type === 0) certs = node.value;
      if (node.tagClass === forge.asn1.Class.UNIVERSAL && node.type === forge.asn1.Type.SET && node.value[0]?.value?.length >= 5) si = node.value[0];
    }
  } catch { return {...out, reason: "Signature illisible."}; }
  if (!si) return {...out, reason: "Signature illisible."};
  const digestOid = forge.asn1.derToOid(si.value[2].value[0].value), hash = DIGEST[digestOid];
  const attrsNode = si.value.find(n => n.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && n.type === 0);
  const sigNode = si.value.find(n => n.tagClass === forge.asn1.Class.UNIVERSAL && n.type === forge.asn1.Type.OCTETSTRING);
  const algNode = si.value[si.value.indexOf(sigNode) - 1];
  if (!hash || !attrsNode || !sigNode) return {...out, reason: "Format de signature non pris en charge."};
  const sigAlg = forge.asn1.derToOid(algNode.value[0].value);
  out.algorithm = hash + (sigAlg === "1.2.840.113549.1.1.10" ? " RSA-PSS" : sigAlg.startsWith("1.2.840.10045") ? " ECDSA" : " RSA");
  // attributs signés : empreinte du document et date de signature
  let msgDigest = null;
  for (const attr of attrsNode.value) {
    const oid = forge.asn1.derToOid(attr.value[0].value), val = attr.value[1].value[0];
    if (oid === "1.2.840.113549.1.9.4") msgDigest = val.value;
    if (oid === "1.2.840.113549.1.9.5") { try { out.signingTime = (val.type === forge.asn1.Type.UTCTIME ? forge.asn1.utcTimeToDate(val.value) : forge.asn1.generalizedTimeToDate(val.value)).toISOString(); } catch {} }
  }
  const signed = new Uint8Array(b + d); signed.set(u8.subarray(a, a + b), 0); signed.set(u8.subarray(c, c + d), b);
  const actual = forge.util.binary.raw.encode(new Uint8Array(await crypto.subtle.digest(hash, signed)));
  out.digestOk = msgDigest === actual;
  // certificat du signataire (le premier qui n'est pas une autorité)
  let cert = null;
  for (const node of certs) { try { const cc = forge.pki.certificateFromAsn1(node); const bc = cc.getExtension("basicConstraints"); if (!bc || !bc.cA) { cert = {cc, node}; break; } if (!cert) cert = {cc, node}; } catch {} }
  if (!cert) return {...out, reason: "Certificat non pris en charge (clé non RSA ?)."};
  const subj = n => cert.cc.subject.getField(n)?.value || "", iss = n => cert.cc.issuer.getField(n)?.value || "";
  const serialNumber = cert.cc.subject.attributes.find(x => x.type === "2.5.4.5")?.value || "";
  out.name = ([subj("GN"), subj("SN")].filter(Boolean).join(" ") || subj("CN")).trim();
  out.idNumber = serialNumber.replace(/^IDC[A-Z]{2}-/, "");
  out.subject = cert.cc.subject.attributes.map(x => `${x.shortName || x.type}=${x.value}`).join(", ");
  out.issuer = [iss("CN"), iss("O")].filter(Boolean).join(", ");
  out.serial = cert.cc.serialNumber;
  out.notAfter = cert.cc.validity.notAfter.toISOString();
  // vérification de la signature sur les attributs signés (réencodés en SET)
  try {
    const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrsNode.value);
    const tbs = Uint8Array.from(forge.asn1.toDer(set).getBytes(), ch => ch.charCodeAt(0));
    const spki = Uint8Array.from(forge.asn1.toDer(forge.pki.publicKeyToAsn1(cert.cc.publicKey)).getBytes(), ch => ch.charCodeAt(0));
    const sig = Uint8Array.from(sigNode.value, ch => ch.charCodeAt(0));
    if (sigAlg === "1.2.840.113549.1.1.10") {
      const key = await crypto.subtle.importKey("spki", spki, {name: "RSA-PSS", hash}, false, ["verify"]);
      const hlen = {"SHA-256": 32, "SHA-384": 48, "SHA-512": 64, "SHA-1": 20}[hash];
      out.signatureOk = await crypto.subtle.verify({name: "RSA-PSS", saltLength: hlen}, key, sig, tbs);
    } else {
      const key = await crypto.subtle.importKey("spki", spki, {name: "RSASSA-PKCS1-v1_5", hash}, false, ["verify"]);
      out.signatureOk = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, tbs);
    }
  } catch { out.signatureOk = false; out.reason = "Algorithme de signature non pris en charge."; }
  const expired = Date.parse(out.notAfter) < Date.now();
  out.valid = !!(out.digestOk && out.signatureOk && !expired);
  if (!out.digestOk) out.reason = "Le document a été modifié après la signature.";
  else if (!out.signatureOk) out.reason = out.reason || "La signature ne correspond pas au certificat.";
  else if (expired) out.reason = "Le certificat a expiré.";
  return out;
}
