import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config();

const EVOLUTION_DB_PATH = path.join(__dirname, 'evolutionData.json');

function loadEvolutionData() {
  if (!fs.existsSync(EVOLUTION_DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(EVOLUTION_DB_PATH, 'utf-8'));
}
function saveEvolutionData(data: any[]) {
  fs.writeFileSync(EVOLUTION_DB_PATH, JSON.stringify(data, null, 2));
}

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

    // Analyze code complexity for metrics
    const complexityMetrics = analyzeCodeComplexity(code);
    const metrics = {
      ...complexityMetrics.metrics,
      security: complexityMetrics.security
    };

    return res.json({ review, code, issues, warning, metrics });
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
    const modelResponse = videoRes.data?.responses?.responses?.['veo-2'];
    if (modelResponse) {
      try {
        const parsed = JSON.parse(modelResponse);
        jobId = parsed.job_id;
      } catch (e) {
        console.error('Failed to parse model response:', e);
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

// Code Complexity Analysis Endpoint
app.post('/complexity-analysis', async (req: Request, res: Response) => {
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

    // Analyze code complexity
    const analysis = analyzeCodeComplexity(code);

    // Get AI insights on the analysis
    const aiResponse = await axios.post(
      'https://api.alle-ai.com/api/v1/chat/completions',
      {
        models: ['gpt-4o'],
        messages: [
          {
            user: [
              {
                type: 'text',
                text: `Analyze the following code complexity metrics and provide insights on how to improve the code quality. Focus on maintainability, performance, and best practices.\n\nMetrics:\n${JSON.stringify(analysis, null, 2)}\n\nCode:\n${code.slice(0, 2000)}`
              }
            ]
          }
        ],
        response_format: { type: 'text' },
        temperature: 0.3,
        max_tokens: 800
      },
      {
        headers: {
          'X-API-KEY': process.env.ALLEAI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const insights = aiResponse.data?.responses?.responses?.['gpt-4o']?.message?.content || 'No insights available.';

    return res.json({ 
      ...analysis, 
      insights,
      code: code.slice(0, 1000) // Return first 1000 chars for reference
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to analyze code complexity.', details: error.message });
  }
});

// Repository Analysis Endpoint
app.post('/repository-analysis', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL.' });
  }

  try {
    // Parse GitHub repository URL (handle .git suffix and various formats)
    let repoMatch = url.match(
      /^https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/tree\/([^\/]+))?$/
    );
    if (!repoMatch) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL.' });
    }
    const [, owner, repo, branch = 'main'] = repoMatch;

    // Get repository contents using GitHub API (try multiple branches)
    let tree;
    let actualBranch = branch;
    let lastError: any = null;
    const branchesToTry = [branch, 'main', 'master', 'develop'];
    
    for (const branchToTry of branchesToTry) {
      try {
        const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branchToTry}?recursive=1`;
        console.log('Trying GitHub API URL:', githubApiUrl);
        
        const githubResponse = await axios.get(githubApiUrl, {
          headers: {
            'User-Agent': 'Code-Review-Assistant',
            ...(process.env.GITHUB_TOKEN && { 'Authorization': `token ${process.env.GITHUB_TOKEN}` })
          }
        });

        tree = githubResponse.data.tree;
        if (tree) {
          actualBranch = branchToTry;
          console.log(`Successfully found tree for branch: ${branchToTry}`);
          break;
        }
      } catch (error: any) {
        lastError = error;
        console.log(`Branch ${branchToTry} failed:`, error.response?.status);
        continue;
      }
    }
    
    if (!tree) {
      console.error('All branches failed. Last error:', lastError?.response?.data);
      return res.status(404).json({ error: 'Repository not found or is empty. Tried branches: ' + branchesToTry.join(', ') });
    }

    // Filter for code files (limit to reasonable number to avoid timeouts)
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt'];
    const codeFiles = tree
      .filter((item: any) => item.type === 'blob' && codeExtensions.some(ext => item.path.endsWith(ext)))
      .slice(0, 50); // Limit to 50 files for performance

    console.log('Code files found:', codeFiles.map((f: any) => f.path));

    if (codeFiles.length === 0) {
      return res.status(400).json({ error: 'No supported code files found in repository.' });
    }

    // Analyze each file
    const fileAnalyses: any[] = [];
    const overallMetrics = {
      totalFiles: codeFiles.length,
      totalLines: 0,
      totalFunctions: 0,
      totalComplexity: 0,
      maintainabilityScores: [] as number[],
      performanceScores: [] as number[],
      securityIssues: [] as string[],
      fileTypes: {} as Record<string, number>
    };

    for (const file of codeFiles) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${actualBranch}/${file.path}`;
        const fileResponse = await axios.get(rawUrl);
        const code = fileResponse.data;

        const analysis = analyzeCodeComplexity(code);
        const fileExtension = file.path.split('.').pop() || 'unknown';
        
        overallMetrics.totalLines += analysis.metrics.totalLines;
        overallMetrics.totalFunctions += analysis.metrics.functionCount;
        overallMetrics.totalComplexity += analysis.metrics.complexityScore;
        overallMetrics.maintainabilityScores.push(analysis.metrics.maintainabilityIndex);
        overallMetrics.performanceScores.push(analysis.metrics.performanceScore);
        overallMetrics.securityIssues.push(...analysis.security.issues);
        overallMetrics.fileTypes[fileExtension] = (overallMetrics.fileTypes[fileExtension] || 0) + 1;

        fileAnalyses.push({
          path: file.path,
          size: file.size,
          analysis
        });
        console.log(`Analyzed file: ${file.path}, lines: ${analysis.metrics.totalLines}`);
      } catch (error) {
        console.error(`Failed to analyze file ${file.path}:`, error);
        // Continue with other files
      }
    }

    // Calculate overall metrics
    const avgMaintainability = overallMetrics.maintainabilityScores.length > 0 
      ? Math.round(overallMetrics.maintainabilityScores.reduce((a, b) => a + b, 0) / overallMetrics.maintainabilityScores.length)
      : 0;
    
    const avgPerformance = overallMetrics.performanceScores.length > 0
      ? Math.round(overallMetrics.performanceScores.reduce((a, b) => a + b, 0) / overallMetrics.performanceScores.length)
      : 0;

    const uniqueSecurityIssues = [...new Set(overallMetrics.securityIssues)];

    // Get AI insights on the entire repository
    const aiResponse = await axios.post(
      'https://api.alle-ai.com/api/v1/chat/completions',
      {
        models: ['gpt-4o'],
        messages: [
          {
            user: [
              {
                type: 'text',
                text: `Analyze this GitHub repository and provide insights on overall code quality, architecture, and improvement recommendations.\n\nRepository: ${owner}/${repo}\nFiles analyzed: ${overallMetrics.totalFiles}\nTotal lines: ${overallMetrics.totalLines}\nAverage maintainability: ${avgMaintainability}/100\nAverage performance: ${avgPerformance}/100\nSecurity issues: ${uniqueSecurityIssues.length}\nFile types: ${JSON.stringify(overallMetrics.fileTypes)}\n\nTop files by complexity:\n${fileAnalyses.slice(0, 5).map(f => `${f.path}: ${f.analysis.metrics.complexityScore} complexity`).join('\n')}`
              }
            ]
          }
        ],
        response_format: { type: 'text' },
        temperature: 0.3,
        max_tokens: 1000
      },
      {
        headers: {
          'X-API-KEY': process.env.ALLEAI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const insights = aiResponse.data?.responses?.responses?.['gpt-4o']?.message?.content || 'No insights available.';

    return res.json({
      repository: {
        owner,
        name: repo,
        branch: actualBranch,
        url: `https://github.com/${owner}/${repo}`
      },
      overview: {
        totalFiles: overallMetrics.totalFiles,
        totalLines: overallMetrics.totalLines,
        totalFunctions: overallMetrics.totalFunctions,
        averageMaintainability: avgMaintainability,
        averagePerformance: avgPerformance,
        securityIssues: uniqueSecurityIssues,
        fileTypes: overallMetrics.fileTypes
      },
      files: fileAnalyses,
      insights,
      recommendations: generateRepositoryRecommendations(avgMaintainability, avgPerformance, uniqueSecurityIssues.length, overallMetrics.totalFiles)
    });
  } catch (error: any) {
    console.error('Repository analysis error:', error);
    return res.status(500).json({ error: 'Failed to analyze repository.', details: error.message });
  }
});

function generateRepositoryRecommendations(avgMaintainability: number, avgPerformance: number, securityIssues: number, totalFiles: number): string[] {
  const recommendations: string[] = [];
  
  if (avgMaintainability < 60) {
    recommendations.push('Overall code maintainability is low. Consider establishing coding standards and refactoring complex files.');
  }
  
  if (avgPerformance < 70) {
    recommendations.push('Performance could be improved across the codebase. Focus on optimizing loops and reducing complexity.');
  }
  
  if (securityIssues > 0) {
    recommendations.push('Security vulnerabilities detected. Prioritize fixing security issues across the repository.');
  }
  
  if (totalFiles > 30) {
    recommendations.push('Large codebase detected. Consider implementing automated testing and CI/CD pipelines.');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Repository shows good code quality practices. Keep maintaining high standards!');
  }
  
  return recommendations;
}

// Helper function to analyze code complexity
function analyzeCodeComplexity(code: string) {
  const lines = code.split('\n');
  const totalLines = lines.length;
  const nonEmptyLines = lines.filter(line => line.trim().length > 0).length;
  const commentLines = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')).length;
  
  // Count functions, classes, and complexity indicators
  const functionMatches = code.match(/function\s+\w+|const\s+\w+\s*=\s*\(|=>\s*{|class\s+\w+/g) || [];
  const functionCount = functionMatches.length;
  
  // Count conditional statements (complexity indicators)
  const ifStatements = (code.match(/if\s*\(/g) || []).length;
  const forLoops = (code.match(/for\s*\(/g) || []).length;
  const whileLoops = (code.match(/while\s*\(/g) || []).length;
  const switchStatements = (code.match(/switch\s*\(/g) || []).length;
  const tryCatchBlocks = (code.match(/try\s*{|catch\s*\(/g) || []).length;
  
  // Calculate complexity score
  const complexityScore = ifStatements + forLoops * 2 + whileLoops * 2 + switchStatements * 3 + tryCatchBlocks * 2;
  
  // Calculate maintainability index (0-100, higher is better)
  const maintainabilityIndex = Math.max(0, 100 - (complexityScore * 2) - (functionCount * 1.5) - (totalLines * 0.1));
  
  // Calculate performance indicators
  const performanceScore = Math.max(0, 100 - (forLoops * 5) - (whileLoops * 5) - (ifStatements * 2));
  
  // Security indicators
  const securityIssues = [];
  if (code.includes('eval(')) securityIssues.push('eval() usage detected');
  if (code.includes('innerHTML')) securityIssues.push('innerHTML usage detected');
  if (code.includes('document.write')) securityIssues.push('document.write usage detected');
  
  return {
    metrics: {
      totalLines,
      nonEmptyLines,
      commentLines,
      functionCount,
      complexityScore,
      maintainabilityIndex: Math.round(maintainabilityIndex),
      performanceScore: Math.round(performanceScore),
      codeToCommentRatio: nonEmptyLines > 0 ? Math.round((commentLines / nonEmptyLines) * 100) : 0
    },
    complexity: {
      ifStatements,
      forLoops,
      whileLoops,
      switchStatements,
      tryCatchBlocks
    },
    security: {
      issues: securityIssues,
      score: Math.max(0, 100 - (securityIssues.length * 20))
    },
    recommendations: generateRecommendations(complexityScore, maintainabilityIndex, performanceScore, securityIssues)
  };
}

function generateRecommendations(complexityScore: number, maintainabilityIndex: number, performanceScore: number, securityIssues: string[]) {
  const recommendations = [];
  
  if (complexityScore > 20) {
    recommendations.push('Consider breaking down complex functions into smaller, more manageable pieces');
  }
  
  if (maintainabilityIndex < 50) {
    recommendations.push('Code maintainability is low. Consider refactoring and adding more comments');
  }
  
  if (performanceScore < 70) {
    recommendations.push('Performance could be improved. Consider optimizing loops and reducing nested conditions');
  }
  
  if (securityIssues.length > 0) {
    recommendations.push('Security issues detected. Review and fix security vulnerabilities');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Code quality looks good! Keep up the good practices');
  }
  
  return recommendations;
}

// POST /evolution/record
app.post('/evolution/record', (req: Request, res: Response) => {
  const { repo, commit, timestamp, metrics, file } = req.body;
  if (!repo || !metrics) {
    return res.status(400).json({ error: 'Missing repo or metrics.' });
  }
  const data = loadEvolutionData();
  data.push({ repo, commit, timestamp: timestamp || Date.now(), metrics, file });
  saveEvolutionData(data);
  res.json({ success: true });
});

// GET /evolution/timeline?repo=...&file=...
app.get('/evolution/timeline', (req: Request, res: Response) => {
  const { repo, file } = req.query;
  if (!repo) return res.status(400).json({ error: 'Missing repo.' });
  const data = loadEvolutionData().filter((snap: any) => snap.repo === repo && (!file || snap.file === file));
  res.json({ timeline: data });
});

// GET /evolution/hotspots?repo=...&window=5
app.get('/evolution/hotspots', (req: Request, res: Response) => {
  const { repo, window } = req.query;
  if (!repo) return res.status(400).json({ error: 'Missing repo.' });
  const data = loadEvolutionData().filter((snap: any) => snap.repo === repo);
  // Group by file
  const byFile: Record<string, any[]> = {};
  data.forEach((snap: any) => {
    if (!snap.file) return;
    if (!byFile[snap.file]) byFile[snap.file] = [];
    byFile[snap.file].push(snap);
  });
  // For each file, compute trend (simple diff over last N points)
  const N = parseInt(window as string) || 5;
  const hotspots = Object.entries(byFile).map(([file, snaps]) => {
    const sorted = snaps.sort((a, b) => a.timestamp - b.timestamp);
    if (sorted.length < N) return null;
    const start = sorted[sorted.length - N].metrics;
    const end = sorted[sorted.length - 1].metrics;
    return {
      file,
      maintainabilityTrend: end.maintainabilityIndex - start.maintainabilityIndex,
      complexityTrend: end.complexityScore - start.complexityScore,
      securityTrend: (end.securityScore || 0) - (start.securityScore || 0),
      latest: end
    };
  }).filter(Boolean).sort((a, b) => (b?.complexityTrend || 0) - (a?.complexityTrend || 0));
  res.json({ hotspots });
});

app.post('/what-if-refactor', async (req: Request, res: Response) => {
  const { code, file, repo } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code.' });

  try {
    // 1. Get refactored code from AI
    const aiResponse = await axios.post(
      'https://api.alle-ai.com/api/v1/chat/completions',
      {
        models: ['gpt-4o'],
        messages: [
          {
            user: [
              {
                type: 'text',
                text: `Refactor the following code for better maintainability, readability, and performance. Explain what you changed and why.\n\nCode:\n${code}`
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

    // Parse AI response: try to extract code and explanation
    const aiContent = aiResponse.data?.responses?.responses?.['gpt-4o']?.message?.content || '';
    // Try to split code and explanation
    let refactoredCode = '';
    let aiExplanation = '';
    const codeBlockMatch = aiContent.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      refactoredCode = codeBlockMatch[1].trim();
      aiExplanation = aiContent.replace(codeBlockMatch[0], '').trim();
    } else {
      // Fallback: try to find the first large code block
      const lines = aiContent.split('\n');
      const codeLines = lines.filter((l: string) => l.trim().length > 0 && (l.startsWith(' ') || l.startsWith('\t')));
      if (codeLines.length > 5) {
        refactoredCode = codeLines.join('\n');
        aiExplanation = aiContent.replace(refactoredCode, '').trim();
      } else {
        refactoredCode = aiContent;
        aiExplanation = '';
      }
    }

    // 2. Analyze both original and refactored code
    const originalMetrics = analyzeCodeComplexity(code).metrics;
    const refactoredMetrics = analyzeCodeComplexity(refactoredCode).metrics;

    return res.json({
      originalCode: code,
      refactoredCode,
      originalMetrics,
      refactoredMetrics,
      aiExplanation
    });
  } catch (error: any) {
    console.error('What-If Refactor error:', error);
    return res.status(500).json({ error: 'Failed to generate refactor.', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
