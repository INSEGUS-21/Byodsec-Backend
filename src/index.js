
import {createServer} from "https";
import "tls"
import express from "express";


const PORT=8080;
const CERTCA="ponerRutaArchivo";
const CERT="Ruta a certificado servidor";
const KEY= "ruta a archivo .key"
const app= express();

createServer({
    requestCert: true,
    rejectUnauthorized: false,
    ca: fs.readFileSync(CERTCA),
    cert: fs.readFileSync(CERT),
    key: fs.readFileSync(KEY),
    }, app).listen(PORT);
