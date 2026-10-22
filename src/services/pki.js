import forge from 'node-forge';
import fs from 'fs';

export function generateClientCertificate(username, exportPassword) {
    const caCertPem = fs.readFileSync('./src/certs/ca.crt', 'utf8');
    const caKeyPem = fs.readFileSync('./src/certs/ca.key', 'utf8');

    const caCert = forge.pki.certificateFromPem(caCertPem);
    const caKey = forge.pki.privateKeyFromPem(caKeyPem);

    const keys = forge.pki.rsa.generateKeyPair(2048);

    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(Date.now());
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: username }]);
    cert.setIssuer(caCert.subject.attributes);
    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', clientAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 2, value: username }] }
    ]);

    cert.sign(caKey, forge.md.sha256.create());

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
        keys.privateKey,
        [cert],
        exportPassword,
        { generateLocalKeyId: true, friendlyName: username }
    );

    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    return Buffer.from(p12Der, 'binary');

}