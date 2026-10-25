import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import argon2 from 'argon2';
import mongoose from 'mongoose';
import { generateClientCertificate } from '../services/pki.js'; 
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const MONGO_URL = process.env.MONGO_URL || "mongodb+srv://danieldlrf2_db_user:XbeoINbtCRtaS35S@ssii.abhixzn.mongodb.net/byodsec?appName=SSII";
const CSV_PATH = path.resolve('./data/usersData.csv');
const CERTS_FOLDER = path.resolve('./users_certs');

const ARGON_OPTS = {
    type: argon2.argon2id,
    memoryCost: 19456, // ~19 MiB
    timeCost: 2,
    parallelism: 1
};

const UserSchema= new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true
    },
    hash: String,
    tokenVersion: { type: Number, default: 0 },
    certificateCN: { type:String, unique: true, sparse: true}
});

const User = mongoose.model('User', UserSchema, 'users-data');

async function seedDatabase() {
    try {
        
        await mongoose.connect(MONGO_URL);
        console.log('MongoDB connected');

        const count = await User.countDocuments();
        if (count > 0) {
            await User.deleteMany({});
        }

        if (!fs.existsSync(CERTS_FOLDER)) {
            fs.mkdirSync(CERTS_FOLDER, { recursive: true });
        }

        const rows = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(CSV_PATH)
                .pipe(csv())
                .on('data', (row) => rows.push(row))
                .on('end', resolve)
                .on('error', reject);
        });

        const usersToInsert = [];
        for (const row of rows) {
            const username = row["username"];
            const password = row["password"];

            if (!username || !password) continue;

            const certificateCN = username;
            const hash = await argon2.hash(password, ARGON_OPTS);
            
            const p12Der = generateClientCertificate(username, password);

            const filePath = path.join(CERTS_FOLDER, `${username}.p12`);
            fs.writeFileSync(filePath, p12Der);

            usersToInsert.push({ username, hash, certificateCN});
        }

        await User.insertMany(usersToInsert);
        console.log("Initial users inserted correctly")
    } catch (err) {
        console.error("Error seedDatabase:", err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

seedDatabase();