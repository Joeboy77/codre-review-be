import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('AI Code Review Assistant Backend is running!');
});

app.post('/review', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL.' });
  }

  try {
    // Parse GitHub URL to get raw file content
    const match = url.match(
      /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/
    );
    if (!match) {
      return res.status(400).json({ error: 'Invalid GitHub file URL.' });
    }
    const [, owner, repo, branch, path] = match;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

    // Fetch file content
    const response = await axios.get(rawUrl);
    const code = response.data;

    // Check for large file and set warning
    let warning = '';
    let codeForAI = code;
    const codeLines = code.split('\n');
    if (codeLines.length > 300 || code.length > 20000) {
      warning = 'This file is too large for a full AI review. Only the first 300 lines or 20,000 characters are analyzed.';
      codeForAI = codeLines.slice(0, 300).join('\n').slice(0, 20000);
    }

    // Ask AI for review and problematic lines/snippets
    const aiResponse = await axios.post(
      'https://api.alle-ai.com/api/v1/chat/completions',
      {
        models: ['gpt-4o'],
        messages: [
          {
            user: [
              {
                type: 'text',
                text: `Review the following code for best practices, potential issues, and improvements. For each issue, provide actionable advice and explanations. Also, return a JSON array of problematic line numbers or code snippets with a brief explanation, severity (Critical, Warning, Info), and category (e.g., Security, Performance, Style, etc.) for each, in the format: [{\"line\": number, \"explanation\": string, \"severity\": string, \"category\": string}] or [{\"snippet\": string, \"explanation\": string, \"severity\": string, \"category\": string}]. If there are no issues, return an empty array.\n\nCode:\n${codeForAI}`
              }
            ]
          }
        ],
        response_format: { type: 'text' },
        temperature: 0.3,
        max_tokens: 1200
      },
      {
        headers: {
          'X-API-KEY': process.env.ALLEAI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const review = aiResponse.data?.responses?.responses?.['gpt-4o']?.message?.content || 'No review available.';

    // Try to extract JSON array of issues from the review text
    let issues = [];
    const jsonMatch = review.match(/\[\s*{[\s\S]*?}\s*\]/);
    if (jsonMatch) {
      try {
        issues = JSON.parse(jsonMatch[0]);
      } catch (e) {
        issues = [];
      }
    }

    // Ensure each issue has severity and category fields (fallback to 'Info' and 'General' if missing)
    issues = issues.map((issue: any) => ({
      ...issue,
      severity: issue.severity || 'Info',
      category: issue.category || 'General',
    }));

    return res.json({ review, code, issues, warning });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to review code.', details: error.message });
  }
});

app.post('/alternative-solution', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL.' });
  }

  try {
    // Parse GitHub URL to get raw file content
    const match = url.match(
      /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/
    );
    if (!match) {
      return res.status(400).json({ error: 'Invalid GitHub file URL.' });
    }
    const [, owner, repo, branch, path] = match;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

    // Fetch file content
    const response = await axios.get(rawUrl);
    const code = response.data;

    // Call Alle AI API for alternative solution
    const aiResponse = await axios.post(
      'https://api.alle-ai.com/api/v1/chat/completions',
      {
        models: ['gpt-4o'],
        messages: [
          {
            user: [
              {
                type: 'text',
                text: `Suggest a refactored or alternative version of the following code. Explain why your version is better, and highlight any improvements in readability, performance, or best practices.\n\nCode:\n${code}`
              }
            ]
          }
        ],
        response_format: { type: 'text' },
        temperature: 0.5,
        max_tokens: 1200
      },
      {
        headers: {
          'X-API-KEY': process.env.ALLEAI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const suggestion = aiResponse.data?.responses?.responses?.['gpt-4o']?.message?.content || 'No alternative solution available.';
    return res.json({ suggestion });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to get alternative solution.', details: error.message });
  }
});

app.post('/video-explanation', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL.' });
  }

  try {
    // Parse GitHub URL to get raw file content
    const match = url.match(
      /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/
    );
    if (!match) {
      return res.status(400).json({ error: 'Invalid GitHub file URL.' });
    }
    const [, owner, repo, branch, path] = match;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

    // Fetch file content
    const response = await axios.get(rawUrl);
    const code = response.data;

    // Call Alle AI Video API
    const videoRes = await axios.post(
      'https://api.alle-ai.com/api/v1/video/generate',
      {
        models: ['veo-2'],
        prompt: `Create a video tutorial explaining the following code, highlighting its purpose, structure, and any best practices or issues.\n\nCode:\n${code}`,
        duration: 60, // seconds, adjust as needed
        aspect_ratio: '16:9',
        resolution: '720p',
      },
      {
        headers: {
          'X-API-KEY': process.env.ALLEAI_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Alle AI video API response:', videoRes.data);

    // Parse jobId from stringified JSON in responses['veo-2']
    let jobId;
    const modelResponse = videoRes.data?.responses?.['veo-2'];
    if (modelResponse) {
      try {
        const parsed = JSON.parse(modelResponse);
        jobId = parsed.job_id;
      } catch (e) {
        jobId = undefined;
      }
    }

    if (!jobId) {
      console.error('No jobId parsed from model response:', modelResponse);
      return res.status(500).json({ error: 'Failed to start video generation.' });
    }
    console.log('Returning jobId to frontend:', jobId);
    return res.json({ jobId });
  } catch (error: any) {
    console.error('Video explanation error:', error);
    return res.status(500).json({ error: 'Failed to generate video explanation.', details: error.message });
  }
});

app.get('/video-status', async (req: Request, res: Response) => {
  const { jobId } = req.query;
  if (!jobId || typeof jobId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid jobId.' });
  }

  try {
    const statusRes = await axios.get(
      `https://api.alle-ai.com/api/v1/video/status?requestId=${jobId}`,
      {
        headers: {
          'X-API-KEY': process.env.ALLEAI_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    // The response may contain a video URL if ready
    const videoUrl = statusRes.data?.video_url || statusRes.data?.videoUrl;
    const status = statusRes.data?.status || statusRes.data?.state;
    return res.json({ videoUrl, status, raw: statusRes.data });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch video status.', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
