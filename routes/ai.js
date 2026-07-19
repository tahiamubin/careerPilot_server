const express = require("express");
const router = express.Router();
const { generateCoverLetter } = require("../services/aiService");

router.post("/cover-letter", async (req, res) => {
  try {
    const { jobId, background, tone, length } = req.body;

    // fetch job from DB
    const job = await jobCollection.findOne({ _id: new ObjectId(jobId) });
    if (!job) return res.status(404).json({ message: "Job not found" });

    const coverLetter = await generateCoverLetter({
      jobTitle: job.title,
      company: job.company,
      jobDescription: job.description,
      background,
      tone,
      length,
    });

    res.json({ coverLetter });
  } catch (err) {
    console.error("AI generation error:", err);
    res.status(500).json({ message: "Failed to generate cover letter" });
  }
});

module.exports = router;