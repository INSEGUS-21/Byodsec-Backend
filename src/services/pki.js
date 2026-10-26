import forge from 'node-forge';
import crypto from 'crypto';
import fs from 'fs';

export function generateClientCertificate(username, exportPassword) {
    const caCertPem = fs.readFileSync('./src/certs/ca.crt', 'utf8');
    const caKeyPem = fs.readFileSync('./src/certs/ca.key', 'utf8');

    const caPassword = process.env.CA_PASSWORD || '6570c68f92088ef05cff0196036dd3cff6e9c17ad0e2628ba05c1071ba74135b';

    const caCert = forge.pki.certificateFromPem(caCertPem);

    const decryptedKeyObject = crypto.createPrivateKey({
        key: caKeyPem,
        passphrase: caPassword,
        format: 'pem'
    });

    const unencryptedPem = decryptedKeyObject.export({
        type: 'pkcs1',
        format: 'pem'
    });

    const caKey = forge.pki.privateKeyFromPem(unencryptedPem);
                  
    const keys = forge.pki.rsa.generateKeyPair(2048);

    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;

    const rawSerial = crypto.randomBytes(15).toString('hex').toUpperCase();
    const serialNumber = '00' + rawSerial;

    cert.serialNumber = serialNumber;
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

    const p12Der = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
    return {
        p12Der,
        serialNumber
    };
}