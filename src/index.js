import {createServer} from "https";
import * as tls from "tls";
import express from "express";
import * as fs from "fs";
import { loadBackendApiUsers } from './api/api-Users.js'; 
import mongoose from 'mongoose'

const PORT=8080;
const CERTCA="./src/certs/ca.crt";
const CERT="./src/certs/server.crt";
const KEY= "./src/certs/server.key";
const app= express();

app.use(express.json())


const MONGO_URL= process.env.MONGO_URL || "";
const conn = mongoose.createConnection(MONGO_URL);
conn.on('connected', () => console.log('Conectado a MongoDB'));
conn.on('error', (err) => console.error('Error conectando a MongoDB:', err));


const UserSchema= new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true
    },
    password: String,
    tokenVersion: { type: Number, default: 0 },
    required: true
});

export const dbUsers = conn.model('User', UserSchema, 'users-data');

loadBackendApiUsers(app, dbUsers);


createServer({
    requestCert: true,
    rejectUnauthorized: false,
    ca: fs.readFileSync(CERTCA),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
    }, app).listen(PORT, () =>{
        console.log("Servidor Https Desplegado");
    })
