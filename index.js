import express from "express";
import { MongoClient } from "mongodb";
import "dotenv/config";
import cors from "cors";

const app = express();

app.use(cors());

app.use(express.json());

const PORT = 5000;

const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        return client;
    }
    catch (error) { console.dir(error); }
}
const mongoClient = await connectToMongoDB();
const database = mongoClient.db("studioSpace");
const studiosCollection = database.collection("studios");
app.post("/add-newstudio", async (req, res) => {
    const data = req.body;
    const result = await studiosCollection.insertOne(data);
    console.log(result);
    res.send(result);
});
app.get("/studios", async (req, res) => {
    const result = await studiosCollection.find().toArray();
    res.send(result);
});

//http://localhost:5000/add-newstudio
app.get("/", (req, res) => {
    res.send("Welcome to the API");
});
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});