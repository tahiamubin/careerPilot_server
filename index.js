const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

dotenv.config();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});
const app = express();
const port = process.env.PORT;
const uri = process.env.MONGODB_URI;

// Middleware for parsing JSON bodies
app.use(express.json());

// Custom CORS middleware to avoid cross-origin issues
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
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

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);


const verifyToken = async (req, res, next) => {
  console.log("verifyToken middleware hit"); // ← confirms request even arrives here
  const authHeader = req.headers.authorization;
  //console.log("authorization header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    //console.log("missing/invalid auth header, rejecting"); // ← tells us if it stops here
    return res.status(401).json({ msg: "unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  console.log("extracted token:", token);

  if (!token) {
    return res.status(401).json({ msg: "unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log("payload", payload);
    req.user = payload;
    next();
  } catch (error) {
    console.error("=== JWT VERIFICATION FAILURE ===");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
    console.error("Full Error Object:", error);
    console.error("================================");
    return res.status(401).json({ msg: "unauthorized" });
  }
};
async function run() {
  try {
    //await client.connect();

    const database = client.db("career_pilot");
    const jobCollection = database.collection("jobs");

    // POST /jobs - creates a new job
    app.post("/jobs", verifyToken, async (req, res) => {
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
    app.delete("/jobs/:userId", verifyToken, async (req, res) => {
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
    app.patch("/jobs/:userId", verifyToken, async (req, res) => {
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

    app.post("/ai/cover-letter", async (req, res) => {
      try {
        const { jobId, background, tone, length } = req.body;

        const job = await jobCollection.findOne({ _id: new ObjectId(jobId) });
        if (!job) return res.status(404).json({ message: "Job not found" });

        const lengthGuide = {
          short: "around 100 words",
          medium: "around 200 words",
          long: "around 350 words",
        };

        const prompt = `
Write a ${tone} cover letter for the following job application.
Length: ${lengthGuide[length]}.

Job Title: ${job.title}
Company: ${job.company}
Job Description: ${job.description}

Candidate Background:
${background}

Write only the cover letter text. No preamble, no explanation, no markdown formatting.
`;

        const model = genAI.getGenerativeModel({
          model: "gemini-3.5-flash",
          generationConfig: { temperature: 0.7 },
        });

        const result = await model.generateContent(prompt);
        res.json({ coverLetter: result.response.text() });
      } catch (err) {
        console.error("AI generation error:", err);
        res.status(500).json({ message: "Failed to generate cover letter" });
      }
    });

    app.post(
      "/ai/resume-analyze",
      (req, res, next) => {
        upload.single("resume")(req, res, (err) => {
          if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
              return res
                .status(400)
                .json({ message: "File is too large. Max size is 5MB." });
            }
            return res
              .status(400)
              .json({ message: `Upload error: ${err.message}` });
          } else if (err) {
            return res
              .status(500)
              .json({ message: `Unknown upload error: ${err.message}` });
          }
          next();
        });
      },
      async (req, res) => {
        try {
          if (!req.file) {
            return res
              .status(400)
              .json({ message: "No file uploaded. Please upload a resume." });
          }

          const originalName = req.file.originalname || "";
          const extension = originalName.split(".").pop().toLowerCase();
          const mimeType = req.file.mimetype || "";

          const allowedExtensions = ["pdf", "docx", "txt"];
          if (!allowedExtensions.includes(extension)) {
            return res.status(400).json({
              message:
                "Unsupported file type. Only .pdf, .docx, and .txt files are allowed.",
            });
          }

          let extractedText = "";

          if (extension === "pdf" || mimeType === "application/pdf") {
            try {
              const data = await pdfParse(req.file.buffer);
              extractedText = data.text;
            } catch (pdfErr) {
              console.error("PDF parse error:", pdfErr);
              return res.status(400).json({
                message: "Could not read the PDF file. It might be corrupt.",
              });
            }
          } else if (
            extension === "docx" ||
            mimeType ===
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ) {
            try {
              const result = await mammoth.extractRawText({
                buffer: req.file.buffer,
              });
              extractedText = result.value;
            } catch (docxErr) {
              console.error("DOCX parse error:", docxErr);
              return res.status(400).json({
                message: "Could not read the DOCX file. It might be corrupt.",
              });
            }
          } else {
            extractedText = req.file.buffer.toString("utf8");
          }

          if (!extractedText || extractedText.trim() === "") {
            return res.status(400).json({
              message: "Uploaded file is empty or could not be read.",
            });
          }

          const prompt = `Analyze this resume text. Return ONLY valid JSON in this exact format, no markdown, no extra text:
{ "summary": "2-3 sentence professional summary of the candidate", "skills": ["skill1", "skill2", ...] }

Resume text:
${extractedText}`;

          const model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash",
          });

          const result = await model.generateContent(prompt);
          let responseText = result.response.text();

          let cleanText = responseText.trim();
          if (cleanText.startsWith("```json")) {
            cleanText = cleanText.substring(7);
          } else if (cleanText.startsWith("```")) {
            cleanText = cleanText.substring(3);
          }
          if (cleanText.endsWith("```")) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
          }
          cleanText = cleanText.trim();

          let parsedData;
          try {
            parsedData = JSON.parse(cleanText);
          } catch (jsonErr) {
            console.error("Gemini JSON parsing failure:", responseText);
            parsedData = {
              summary: cleanText,
              skills: [],
            };
          }

          res.json({
            summary: parsedData.summary || "",
            skills: Array.isArray(parsedData.skills) ? parsedData.skills : [],
          });
        } catch (error) {
          console.error("Resume analyze route error:", error);
          res
            .status(500)
            .json({ message: "AI Analysis failed: " + error.message });
        }
      },
    );

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
