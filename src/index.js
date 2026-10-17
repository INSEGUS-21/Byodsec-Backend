
import {createServer} from "https";
import * as tls from "tls";
import express from "express";
import * as fs from "fs";


const PORT=8080;
const CERTCA="./src/certs/ca.crt";
const CERT="./src/certs/server.crt";
const KEY= "./src/certs/server.key";
const app= express();

createServer({
    requestCert: true,
    rejectUnauthorized: false,
    ca: fs.readFileSync(CERTCA),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
    }, app).listen(PORT, () =>{
        console.log("Servidor Https Desplegado");
    })
