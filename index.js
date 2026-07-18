const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();
const app = express();
const port = process.env.PORT;
const uri = process.env.MONGODB_URI;

// Middleware for parsing JSON bodies
app.use(express.json());

// Custom CORS middleware to avoid cross-origin issues
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    //await client.connect();
    const database = client.db("career_pilot");
    const jobCollection = database.collection("jobs");

    // POST /jobs - creates a new job
    app.post("/jobs", async (req, res) => {
      try {
        const data = req.body;
        const result = await jobCollection.insertOne(data);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /jobs - returns all jobs
    app.get("/jobs", async (req, res) => {
      try {
        const result = await jobCollection.find().toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /jobs/:userId - returns single job by id (uses req.params.userId, not req.params.id)
    app.get("/jobs/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const query = {
          _id: new ObjectId(userId),
        };
        const result = await jobCollection.findOne(query);
        if (!result) {
          return res.status(404).json({ error: "Job not found" });
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /jobs/:userId - deletes a job by id (uses req.params.userId)
    app.delete("/jobs/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const result = await jobCollection.deleteOne({
          _id: new ObjectId(userId),
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // PATCH /jobs/:userId - updates a job by id (uses req.params.userId)
    app.patch("/jobs/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const updatedData = req.body;
        // Avoid Mongo error for trying to update the immutable _id field
        delete updatedData._id;
        const result = await jobCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: updatedData },
        );
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // Commented out to keep connection alive for subsequent requests
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
