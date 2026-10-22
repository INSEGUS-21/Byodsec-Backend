import {createServer} from "https";
import * as tls from "tls";
import express from "express";
import * as fs from "fs";
import { loadBackendApiUsers } from './api/api-Users.js'; 
import mongoose from 'mongoose'
import cors from 'cors'
import { certificateAuth } from '../middlewares/certificateAuth.js';

const PORT_PROTECTED=8443;
const PORT_PUBLIC=8080;
const CERTCA="./src/certs/ca.crt";
const CERT="./src/certs/server.crt";
const KEY= "./src/certs/server.key";

const appPublic = express();
const appProtected = express();

appPublic.use(express.json())
appPublic.use(cors());

appProtected.use(express.json())
appProtected.use(cors());

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
    hash: String,
    password: {type: String, required: true},
    tokenVersion: { type: Number, default: 0 },
    certificateCN: { type:String, unique: true, sparse: true}
});

export const dbUsers = conn.model('User', UserSchema, 'users-data');

loadBackendApiUsers(appPublic, appProtected, dbUsers);


createServer({
    minVersion: 'TLSv1.3',
    ca: fs.readFileSync(CERTCA),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
}, appPublic).listen(PORT_PUBLIC, () => {
    console.log(`Portal de Registro activo en https://localhost:${PORT_PUBLIC}`);
});

createServer({
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
    // ciphers: "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
    ca: fs.readFileSync(CERTCA),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
}, appProtected).listen(PORT_PROTECTED, () => {
    console.log(`Gateway VPN mTLS activo en https://localhost:${PORT_PROTECTED}`);
});

appProtected.use(certificateAuth());
