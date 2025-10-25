import React, { useState, useRef } from 'react';
import { 
  Container, 
  Paper, 
  Typography, 
  TextField, 
  Button, 
  Box, 
  Tabs, 
  Tab, 
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip
} from '@mui/material';
import { 
  CloudUpload, 
  Psychology, 
  Clear,
  Description 
} from '@mui/icons-material';

function AIAnalyzer() {
  const [documentText, setDocumentText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [isFileLoading, setIsFileLoading] = useState(false);
  
  const fileInputRef = useRef(null);
  
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "REDACTED_API_KEY";
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`;

  // File handling functions
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsFileLoading(true);
    setError('');

    try {
      if (file.type === 'application/pdf') {
        await readPdfFile(file);
      } else if (file.type.startsWith('text/')) {
        await readTextFile(file);
      } else {
        setError("Unsupported file type. Please upload a .txt or .pdf file.");
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(`Failed to read file: ${err.message}`);
    } finally {
      setIsFileLoading(false);
    }
  };

  const readTextFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setDocumentText(e.target.result);
        resolve();
      };
      reader.onerror = () => reject(new Error("Failed to read text file"));
      reader.readAsText(file);
    });
  };

  const readPdfFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedArray = new Uint8Array(e.target.result);
          const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;
          let fullText = '';
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
          }
          
          setDocumentText(fullText.trim());
          resolve();
        } catch (error) {
          reject(new Error("Failed to process PDF"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read PDF data"));
      reader.readAsArrayBuffer(file);
    });
  };

  // Analysis function
  const handleAnalyze = async () => {
    if (!documentText.trim()) {
      setError("Please enter or upload a document to analyze");
      return;
    }

    setIsAnalyzing(true);
    setError('');
    setAnalysisResults(null);

    try {
      const systemPrompt = `
        You are an expert legal AI assistant analyzing Indian legal documents.
        Respond ONLY with valid JSON adhering to the schema.
        Focus on IPC, CrPC, and Indian legal codes.
      `;

      const schema = {
        type: "OBJECT",
        properties: {
          judgeBrief: { type: "STRING", description: "A concise summary for judges (2-3 sentences)" },
          lawyerVersion: { type: "STRING", description: "Detailed analysis for legal professionals" },
          citizenSummary: { type: "STRING", description: "Simple explanation for common people" },
          identifiedSections: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { 
                section: { type: "STRING" },
                description: { type: "STRING" } 
              },
              required: ["section", "description"]
            }
          },
          legalProvisions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { 
                provision: { type: "STRING" },
                description: { type: "STRING" } 
              },
              required: ["provision", "description"]
            }
          },
          precedents: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { 
                caseName: { type: "STRING" },
                summary: { type: "STRING" } 
              },
              required: ["caseName", "summary"]
            }
          },
          outcomePrediction: { type: "STRING", description: "Predicted case outcome with confidence level" },
          evidenceSuggestion: { type: "STRING", description: "Suggestions to strengthen the case" },
          timelineEstimate: { type: "STRING", description: "Estimated timeline for case resolution" }
        },
        required: ["judgeBrief", "lawyerVersion", "citizenSummary", "identifiedSections", "legalProvisions", "precedents", "outcomePrediction", "evidenceSuggestion", "timelineEstimate"]
      };

      const payload = {
        contents: [{ parts: [{ text: documentText }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      };

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API Error ${response.status}`);
      }

      const result = await response.json();
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!responseText) {
        throw new Error("Empty response from API");
      }

      const analysis = JSON.parse(responseText);
      setAnalysisResults(analysis);
      setActiveTab(0);

    } catch (err) {
      setError(`Analysis failed: ${err.message}. Please try again.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clearInput = () => {
    setDocumentText('');
    setAnalysisResults(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Psychology sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
        <Typography variant="h3" gutterBottom sx={{ fontWeight: 'bold' }}>
          AI Document Analyzer
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Advanced Legal Analysis
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        
        {/* Input Section */}
        <Paper elevation={3} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Description /> Input Document
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a PDF/TXT file or paste legal document text below
          </Typography>

          {/* File Upload */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              component="label"
              startIcon={<CloudUpload />}
              disabled={isFileLoading || isAnalyzing}
            >
              Upload File
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf"
                onChange={handleFileChange}
                hidden
              />
            </Button>
            
            {isFileLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">Reading file...</Typography>
              </Box>
            )}

            <Button
              variant="outlined"
              startIcon={<Clear />}
              onClick={clearInput}
              disabled={isAnalyzing}
            >
              Clear
            </Button>
          </Box>

          {/* Text Area */}
          <TextField
            fullWidth
            multiline
            rows={18}
            value={documentText}
            onChange={(e) => setDocumentText(e.target.value)}
            placeholder="Paste your legal document, case file, or FIR here..."
            disabled={isAnalyzing}
            sx={{ mb: 2 }}
          />

          {/* Analyze Button */}
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleAnalyze}
            disabled={isAnalyzing || !documentText.trim()}
            startIcon={isAnalyzing ? <CircularProgress size={20} color="inherit" /> : <Psychology />}
          >
            {isAnalyzing ? 'Analyzing Document...' : 'Analyze Document'}
          </Button>

          <Typography variant="caption" color="warning.main" sx={{ mt: 2, display: 'block' }}>
            
          </Typography>
        </Paper>

        {/* Results Section */}
        <Paper elevation={3} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Analysis Results
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {!analysisResults && !error && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Psychology sx={{ fontSize: 80, color: 'grey.300', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                Awaiting Analysis
              </Typography>
              <Typography variant="body2" color="text.disabled">
                Your results will appear here
              </Typography>
            </Box>
          )}

          {analysisResults && (
            <>
              <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
                <Tab label="Summaries" />
                <Tab label="Legal Analysis" />
                <Tab label="Predictions" />
              </Tabs>

              <Box sx={{ maxHeight: 600, overflowY: 'auto' }}>
                
                {/* Summaries Tab */}
                {activeTab === 0 && (
                  <Box>
                    <Typography variant="h6" color="primary" gutterBottom>Judge Brief</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
                      <Typography>{analysisResults.judgeBrief}</Typography>
                    </Paper>

                    <Typography variant="h6" color="primary" gutterBottom>Lawyer Version</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
                      <Typography>{analysisResults.lawyerVersion}</Typography>
                    </Paper>

                    <Typography variant="h6" color="primary" gutterBottom>Citizen Summary</Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                      <Typography>{analysisResults.citizenSummary}</Typography>
                    </Paper>
                  </Box>
                )}

                {/* Legal Analysis Tab */}
                {activeTab === 1 && (
                  <Box>
                    <Typography variant="h6" color="primary" gutterBottom>Identified Sections</Typography>
                    <List>
                      {analysisResults.identifiedSections?.map((item, idx) => (
                        <Box key={idx}>
                          <ListItem>
                            <ListItemText
                              primary={<Chip label={item.section} color="primary" sx={{ fontWeight: 'bold' }} />}
                              secondary={item.description}
                            />
                          </ListItem>
                          <Divider />
                        </Box>
                      ))}
                    </List>

                    <Typography variant="h6" color="primary" gutterBottom sx={{ mt: 3 }}>Legal Provisions</Typography>
                    <List>
                      {analysisResults.legalProvisions?.map((item, idx) => (
                        <Box key={idx}>
                          <ListItem>
                            <ListItemText
                              primary={<Chip label={item.provision} color="secondary" />}
                              secondary={item.description}
                            />
                          </ListItem>
                          <Divider />
                        </Box>
                      ))}
                    </List>

                    <Typography variant="h6" color="primary" gutterBottom sx={{ mt: 3 }}>Precedents</Typography>
                    <List>
                      {analysisResults.precedents?.map((item, idx) => (
                        <Box key={idx}>
                          <ListItem>
                            <ListItemText
                              primary={<Typography fontWeight="bold">{item.caseName}</Typography>}
                              secondary={item.summary}
                            />
                          </ListItem>
                          <Divider />
                        </Box>
                      ))}
                    </List>
                  </Box>
                )}

                {/* Predictions Tab */}
                {activeTab === 2 && (
                  <Box>
                    <Typography variant="h6" color="primary" gutterBottom>Outcome Prediction</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
                      <Typography>{analysisResults.outcomePrediction}</Typography>
                    </Paper>

                    <Typography variant="h6" color="primary" gutterBottom>Evidence Suggestions</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
                      <Typography>{analysisResults.evidenceSuggestion}</Typography>
                    </Paper>

                    <Typography variant="h6" color="primary" gutterBottom>Timeline Estimate</Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                      <Typography>{analysisResults.timelineEstimate}</Typography>
                    </Paper>
                  </Box>
                )}
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </Container>
  );
}

export default AIAnalyzer;
