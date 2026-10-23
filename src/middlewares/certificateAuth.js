
import { RevokedCertificate } from '../index.js';
export async function certificateAuth(req, res, next){

    if(!req.socket.authorized){
        return res.status(401).send('Invalid client certificate authentication.');
    }
    const clientCert = req.socket.getPeerCertificate();
    if (clientCert && clientCert.subject && clientCert.subject.CN) {
        const isRevoked = await RevokedCertificate.findOne({ certificateCN: clientCert.subject.CN });
        if (isRevoked) {
            return res.status(403)
        }
    }
    return next();
}