import fs from 'fs'
import csv from 'csv-parser';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2'
import { generateClientCertificate } from '../services/pki.js'
import { auth, JWT_SECRET } from '../middlewares/auth.js'; 
import { RevokedCertificate } from '../index.js';
import {stringify} from "csv-stringify";


let URL_BASE_API = "/api/v1";

const ARGON_OPTS = {
    type: argon2.argon2id,
    memoryCost: 19456, // ~19 MiB
    timeCost: 2,
    parallelism: 1
};


function validatePassword(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push(`Debe tener al menos 8 caracteres`);
  }
  if (!/\p{Lu}/u.test(password)) {
    errors.push("Debe contener al menos una mayúscula");
  }
  if (!/\p{Ll}/u.test(password)) {
    errors.push("Debe contener al menos una minuscula");
  }
  if (!/\d/.test(password)) {
    errors.push("Debe contener al menos un número");
  }
  if (!/[^\p{L}\p{N}\s]/u.test(password)) {
    errors.push("Debe contener al menos un carácter especial");
  }

  return { valid: errors.length === 0, errors };
}

export function loadBackendApiUsers(appPublic,appProtected,dbUsers){

    //SOLO PARA PRUEBAS Y PARA CORREGIR (Se quitaran en produccion)
    appPublic.get(URL_BASE_API + "/Users", async (req, res) => {
        try{
            let users =  await dbUsers.find({});
            res.status(200).json(users);

        }catch(err){
            res.sendStatus(500);
        } 
    });
    appPublic.delete(URL_BASE_API + "/Users", async (req, res) => {
        try {
            const result = await dbUsers.deleteMany({});

            return res.status(200).send("All users removed");
        } catch (error) {
            return res.status(500).send("Server error");
        }
    });

    //post prohibido
    appProtected.post(URL_BASE_API+"/Users/:id", async (req, res) => {
        res.sendStatus(405);
    });

    //login
    appProtected.post(URL_BASE_API+"/login", async (req, res) => {
        const {username, password} = req.body;
        if (!(username && password)) {
             return res.status(400).send("missing params");
        }
        try {
                const user = await dbUsers.findOne({username}); //comprueba que existe usuario   
                    if (!user
                        || req.socket.getPeerCertificate().subject.CN !== user.certificateCN
                        || !(await argon2.verify(user.hash, password))) {
                            return res.status(401).send("unautorized");
                    }else{
                    const token = jwt.sign({ sub: user._id, tv: user.tokenVersion ?? 0 }, JWT_SECRET, { expiresIn: '1h' });   //crea token (ahora agrega tokenversion para invalidar tokens)

                    const dateTime=(new Date()).toDateString();
                    const type="Login";
                    const message=`The username with id: ${user._id} has logged in`;
                    const datos={
                                "datetime":dateTime,
                                "type":type,
                                "message":message
                            }
                    
                    /*const csv=stringify([datos],
                        {
                            header:false,
                            columns: ['datetime', 'type', 'message']
                            
                        });*/
                    const csv="\n"+Object.values(datos).join(',');
                            
                    fs.appendFileSync("./log/log.csv",csv);

                    return res.status(200).json({ token });
                }       
            } catch (error) {
                console.log(error);
                return res.sendStatus(500, "Server Error");
            }
    });

    //logout
    appProtected.post(URL_BASE_API + "/logout", auth, async (req, res) => {
      
        try {
            await dbUsers.updateOne({ _id: req.user.sub }, { $inc: { tokenVersion: 1 } }); //al incrementa la version del token a 1, el token se invalida aun que no halla caducado

            const dateTime=(new Date()).toDateString();
            const type="Logout";
            const message=`User with id: ${req.user.sub} has logged out`;
            const datos={
                "datetime":dateTime,
                "type":type,
                "message":message
            }

            const csv="\n" + Object.values(datos).join(',');
            
            fs.appendFileSync("./log/log.csv",csv);

            return res.status(200).send("session closed");
        } catch (error) {
            console.log(error);
            return res.sendStatus(500);
        }
    });

    //register
    appPublic.post(URL_BASE_API+"/register", async (req, res) => {
        const {username, password} = req.body;

         if (!(username && password)) {
             return res.status(400).send("missing params");
        }
        if (!validatePassword(password).valid){
            return res.status(400).send("the password's format is incorrect")
        }

        try {
                if (await dbUsers.findOne({ username })) {
                    return res.status(409).send("User already exists")
                }
                else{
                    const hash = await argon2.hash(password, ARGON_OPTS);
                    const p12Der = generateClientCertificate(username, password)
                    const certificateCN = username
                    await dbUsers.create({ username, hash, certificateCN});
                    res.setHeader('Content-Type', 'application/x-pkcs12');
                    res.setHeader('Content-Disposition', `attachment; filename="${username}.p12"`);
                    
                    return res.status(201).send(p12Der);
                }

        } catch (error) {
            console.log(error);
            return res.sendStatus(500, "Server Error");
        }
    });
    
    appProtected.get(URL_BASE_API + "/auth-trigger", (req, res) => {
        res.send(`
        <html>
            <body>
            <h3>Certificado autenticado con éxito</h3>
            <script>
                setTimeout(() => window.close(), 500);
            </script>
            </body>
        </html>
        `);
    });

    appProtected.post("/messages", auth, (req, res) => {
        const { message } = req.body;
        if (!message) {
            return res.sendStatus(400, "Missing params");
        } 
        return res.status(200).json({
            reply: `Servidor Gateway VPN mTLS procesó tu mensaje: "${message}" en fecha ${new Date().toISOString()}`
        });
    })

    appProtected.put(URL_BASE_API +"/reissue-identity", auth, async (req,res) => {
        const {username_old, password_old, username_new, password_new } = req.body;
        if (!validatePassword(password_new).valid){
            return res.status(400).send("the new password's format is incorrect")
        }
        if (!(username_old && password_old && username_new && password_new)) {
             return res.status(400).send("missing params");
        }
        
        try{
            const user = await dbUsers.findOne({ username: username_old });
            if (!user) {
                return res.status(404).send('Usser not found');
            }
            const isPasswordValid = await argon2.verify(user.hash, password_old);
            if (!isPasswordValid) {
                return res.status(401).send('incorrect password');
            }
            if (username_old !== username_new) {
                const usernameExists = await dbUsers.findOne({ username: username_new });
                if (usernameExists) {
                    return res.status(400).send('There is a user registered with this username');
                }
            }
            if (user.certificateCN) {
                await RevokedCertificate.create({
                    certificateCN: user.certificateCN,
                    username: username_old,
                    revokedAt: new Date(),
                    reason: 'Identity and credentials update'
                });
            }
            const p12Der = generateClientCertificate(username_new, password_new);
            const hash_new = await argon2.hash(password_new, ARGON_OPTS);
                    
            user.username = username_new;
            user.hash = hash_new;
            user.certificateCN = username_new;
            user.tokenVersion = (user.tokenVersion || 0) + 1; 

            await user.save();
            res.setHeader('Content-Type', 'application/x-pkcs12');
            res.setHeader('Content-Disposition', `attachment; filename="${username_new}.p12"`);
                    
            const dateTime=(new Date()).toDateString();
            const type="reissue";
            const message=`The username with id: ${user._id} has regenerated certificate.`;
            const datos={
                            "datetime":dateTime,
                            "type":type,
                            "message":message
                        }
                  
                        
            const csv="\n"+Object.values(datos).join(',');
                            
            fs.appendFileSync("./log/log.csv",csv);

            return res.status(201).send(p12Der);

            } catch (error) {
                return res.status(500).send("Server Error");
            }
        
    });
    appProtected.post(URL_BASE_API + "/revoke", auth, async (req, res) => {
        try {
            const user = await dbUsers.findOne({ _id: req.user.sub });
            if (!user) {
                return res.status(404).send("User not found");
            }

            if (!user.certificateCN) {
                return res.status(400).send("User does not have an active certificate");
            }

            if (typeof RevokedCertificate !== 'undefined') {
                await RevokedCertificate.create({
                    certificateCN: user.certificateCN,
                    username: user.username,
                    revokedAt: new Date(),
                    reason: req.body.reason || 'Explicit user revocation (Lost/Stolen device)'
                });
            }

            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save();

            return res.status(200).send("Certificate revoked successfully. Connection closed.");

        } catch (error) {
            console.error("Error revoking certificate:", error);
            return res.status(500).send("Server Error");
        }
    });
    
}