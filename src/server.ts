import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("🚀 SpaceHive Server Running...");
});

const uri = process.env.MONGO_URI!;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const database = client.db(process.env.DB_NAME);

    const spacesCollection = database.collection("spaces");



    // ===========================
    // Spaces API
    // ===========================

    app.get("/api/spaces", async (_req, res) => {
      const spaces = await spacesCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();

      res.send(spaces);
    });

    app.get("/api/spaces/featured", async (_req, res) => {
      const spaces = await spacesCollection
        .find()
        .sort({ rating: -1 })
        .limit(8)
        .toArray();

      res.send(spaces);
    });
    

    await client.db("admin").command({
      ping: 1,
    });

    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});