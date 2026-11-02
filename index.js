import express from "express";
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import cors from "cors";

const app = express();
const PORT = 5000
//http://localhost:5000/add-newstudio
app.use(cors());
const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}
connectToMongoDB();
app.post('/add-newstudio', async (req, res) => {
    console.log('Api called...');
    res.send('Api Working!');
});
app.get('/', (req, res) => {
    res.send('Hello World!');
});
app.listen(PORT, () => {
    console.log(`Example app listening on PORT ${PORT}`);
});
