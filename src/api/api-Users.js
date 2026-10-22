import fs from 'fs'
import csv from 'csv-parser';
import jwt from 'jsonwebtoken';

import argon2 from 'argon2'
import { generateClientCertificate } from '../services/pki.js'
import { auth, JWT_SECRET } from '../middlewares/auth.js'; 



let URL_BASE_API = "/api/v1";

const ARGON_OPTS = {
    type: argon2.argon2id,
    memoryCost: 19456, // ~19 MiB
    timeCost: 2,
    parallelism: 1
};

export function loadBackendApiUsers(appPublic,appProtected,dbUsers){

    //get load initial data
    appProtected.get(URL_BASE_API+"/Users/loadInitialData", async (req, res)=> {
        try{
            const count = await dbUsers.countDocuments();
            if (count > 0) return res.sendStatus(409);
            const rows = [];
            fs.createReadStream('./data/usersData.csv')
            .pipe(csv())
            .on('data', (row) => {
                rows.push(row);
            })
            .on('end', async () => {
                try {
                    await dbUsers.create(rows);
                    res.sendStatus(201);
                } catch (err) {
                    console.error(err);
                    res.sendStatus(500);
                }
            })
            .on('error', () => res.sendStatus(500));

        }catch(err){
            res.sendStatus(500);
        }

    });

    //SOLO PARA PRUEBAS Y PARA CORREGIR (Se quitaran en produccion)
    appProtected.get(URL_BASE_API + "/Users", async (req, res) => {
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
                if(!user || user.password !== password){
                    return res.status(401).send("unautorized");
                }else{
                    const token = jwt.sign({ sub: user._id, tv: user.tokenVersion ?? 0 }, JWT_SECRET, { expiresIn: '1h' });   //crea token (ahora agrega tokenversion para invalidar tokens)
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
    


}