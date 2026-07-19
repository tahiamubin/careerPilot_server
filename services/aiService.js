const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateCoverLetter({ jobTitle, company, jobDescription, background, tone, length }) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash", // fast + free-tier friendly
    generationConfig: {
      temperature: 0.7, // creativity for regenerate variation
    },
  });

  const lengthGuide = {
    short: "around 100 words",
    medium: "around 200 words",
    long: "around 350 words",
  };

  const prompt = `
Write a ${tone} cover letter for the following job application.
Length: ${lengthGuide[length]}.

Job Title: ${jobTitle}
Company: ${company}
Job Description: ${jobDescription}

Candidate Background:
${background}

Write only the cover letter text. No preamble, no explanation, no markdown formatting.
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { generateCoverLetter };