import { RevokedCertificate } from '../index.js';
import * as fs from "fs";

export async function certificateAuth(req, res, next) {
    if (process.env.NO_TLS === 'true') {
        return next();
    }

    if (!req.socket.authorized) {
        const dateTime = (new Date()).toDateString();
        const type = "Unauthorized access";
        const message = "Invalid certificate";
        const datos = {
            "datetime": dateTime,
            "type": type,
            "message": message
        };
        const csv = "\n" + Object.values(datos).join(',');
        
        fs.appendFileSync("./log/log.csv", csv);
        return res.status(401).send('Invalid client certificate authentication.');
    }

    const clientCert = req.socket.getPeerCertificate();
    if (clientCert && clientCert.serialNumber) {
        const isRevoked = await RevokedCertificate.findOne({ serialNumber: clientCert.serialNumber });
        if (isRevoked) {
            const dateTime = (new Date()).toDateString();
            const type = "Unauthorized access";
            const message = "Revoked certificate";
            const datos = {
                "datetime": dateTime,
                "type": type,
                "message": message
            };
            
            const csv = "\n" + Object.values(datos).join(',');
            fs.appendFileSync("./log/log.csv", csv);

            return res.status(403).send('Certificate has been revoked.');
        }
    }

    return next();
}