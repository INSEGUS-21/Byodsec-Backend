import fs from 'fs'
import csv from 'csv-parser';
import jwt from 'jsonwebtoken';
import { auth, JWT_SECRET } from '../services/auth.js'; // ajusta la ruta



let URL_BASE_API = "/api/v1";


export function loadBackendApiUsers(app,dbUsers){

    //get load initial data
    app.get(URL_BASE_API+"/Users/loadInitialData", async (req, res)=> {
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

    //SOLO PARA PRUEBAS Y PARA CORREGIR
    app.get(URL_BASE_API + "/Users", certificateAuth, async (req, res) => {
    try{
        let users =  await dbUsers.find({});
        res.status(200).json(users);

    }catch(err){
        res.sendStatus(500);
    } 
    });
    
    //post prohibido

    app.post(URL_BASE_API+"/Users/:id", async (req, res) => {
        res.sendStatus(405);
    });

    //login
    app.post(URL_BASE_API+"/login", certificateAuth, async (req, res) => {
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
    app.post(URL_BASE_API + "/logout", auth, certificateAuth, async (req, res) => {
      
        try {
            await dbUsers.updateOne({ _id: req.user.sub }, { $inc: { tokenVersion: 1 } }); //al incrementa la version del token a 1, el token se invalida aun que no halla caducado
            return res.status(200).send("session closed");
        } catch (error) {
            console.log(error);
            return res.sendStatus(500);
        }
    });




    //register
    app.post(URL_BASE_API+"/register", async (req, res) => {
        const {username, password} = req.body;

         if (!(username && password)) {
             return res.status(400).send("missing params");
        }

        try {
               
        
                if (await dbUsers.findOne({ username })) {
                    return res.status(409).send("User already exists")
                };
                await dbUsers.create({ username, password});
                return res.status(201).send("user created");         
                
                
               
        } catch (error) {
            console.log(error);
            return res.sendStatus(500, "Server Error");
        }
    });
    


}