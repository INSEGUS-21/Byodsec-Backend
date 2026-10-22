import {createServer} from "https";
import * as tls from "tls";
import express from "express";
import * as fs from "fs";
import { loadBackendApiUsers } from './api/api-Users.js'; 
import mongoose from 'mongoose'
import cors from 'cors'
import { certificateAuth } from './middlewares/certificateAuth.js';

const PORT_PROTECTED=8443;
const PORT_PUBLIC=8080;
const CERTCA="./src/certs/ca.crt";
const CERT="./src/certs/server.crt";
const KEY= "./src/certs/server.key";

const appPublic = express();
const appProtected = express();

appPublic.use(cors());
appPublic.use(express.json())

appProtected.use(cors());
appProtected.use(express.json())
appProtected.use(certificateAuth)

const MONGO_URL= process.env.MONGO_URL || "mongodb+srv://danieldlrf2_db_user:XbeoINbtCRtaS35S@ssii.abhixzn.mongodb.net/byodsec?appName=SSII";
const conn = await mongoose.createConnection(MONGO_URL).asPromise();
console.log('MongoDB connected');
conn.on('error', (err) => console.error('Error connecting MongoDB:', err));


const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true
    },
    hash: {
        type: String,
        required: true
    },
    tokenVersion: { type: Number, default: 0 },
    certificateCN: { type: String, unique: true, sparse: true }
});

export const dbUsers = conn.model('User', UserSchema, 'users-data');

loadBackendApiUsers(appPublic, appProtected, dbUsers);


createServer({
    requestCert: false,
    rejectUnauthorized: false,
    maxVersion: "TLSv1.3",
    minVersion: 'TLSv1.3',
    ciphers: "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
    ca: fs.readFileSync(CERTCA),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
}, appPublic).listen(PORT_PUBLIC, () => {
    console.log(`Register Portal open in https://localhost:${PORT_PUBLIC}`);
});

createServer({
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
    ciphers: "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
    ca: fs.readFileSync(CERTCA),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
}, appProtected).listen(PORT_PROTECTED, () => {
    console.log(`Gateway VPN mTLS open in https://localhost:${PORT_PROTECTED}`);
});
