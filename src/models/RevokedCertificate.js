import mongoose from 'mongoose';

const revokedCertificateSchema = new mongoose.Schema({
    certificateCN: { type: String, required: true, index: true }, 
    username: { type: String, required: true },
    revokedAt: { type: Date, default: Date.now },
    reason: { type: String, default: 'Identity/Credentials update' }
});

export function initRevokedCertificateModel(conn) {
    return conn.model('RevokedCertificate', revokedCertificateSchema);
}