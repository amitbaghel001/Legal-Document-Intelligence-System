import React, { useState, useRef, useEffect } from 'react';
import {
  Container, Paper, Typography, TextField, Button, Box, Tabs, Tab,
  CircularProgress, Alert, List, ListItem, ListItemText, Divider, Chip,
  MenuItem, Select, FormControl, InputLabel, Snackbar
} from '@mui/material';
import { CloudUpload, Psychology, Clear, Description, Save } from '@mui/icons-material';
import API from '../api/axios';

function AIAnalyzer() {
  const [documentText, setDocumentText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [isFileLoading, setIsFileLoading] = useState(false);

  // Save-to-case state
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSnack, setSavedSnack] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    API.get('/cases/all?limit=200')
      .then(({ data }) => setCases(data.cases || []))
      .catch(() => {});
  }, []);

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
        setError('Unsupported file type. Please upload a .txt or .pdf file.');
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(`Failed to read file: ${err.message}`);
    } finally {
      setIsFileLoading(false);
    }
  };

  const readTextFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => { setDocumentText(e.target.result); resolve(); };
      reader.onerror = () => reject(new Error('Failed to read text file'));
      reader.readAsText(file);
    });

  const readPdfFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedArray = new Uint8Array(e.target.result);
          const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(' ') + '\n\n';
          }
          setDocumentText(fullText.trim());
          resolve();
        } catch (err) {
          reject(new Error('Failed to process PDF'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read PDF data'));
      reader.readAsArrayBuffer(file);
    });

  const handleAnalyze = async () => {
    if (!documentText.trim()) {
      setError('Please enter or upload a document to analyze');
      return;
    }
    setIsAnalyzing(true);
    setError('');
    setAnalysisResults(null);
    try {
      // All Gemini calls now go through the secure backend proxy
      const response = await API.post('/ai/gemini-analyze', { text: documentText });
      const result = response.data;
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) throw new Error('Empty response from AI service');
      const analysis = JSON.parse(responseText);
      setAnalysisResults(analysis);
      setActiveTab(0);
    } catch (err) {
      setError(`Analysis failed: ${err.response?.data?.error || err.message}. Please try again.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveToCase = async () => {
    if (!selectedCaseId || !analysisResults) return;
    setIsSaving(true);
    try {
      const ipcTags = analysisResults.identifiedSections?.map(s => s.section) || [];
      const summary = analysisResults.judgeBrief || '';
      await API.put(`/cases/${selectedCaseId}`, { summary, ipcTags, status: 'completed' });
      setSavedSnack(true);
    } catch (err) {
      setError(`Failed to save to case: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const clearInput = () => {
    setDocumentText('');
    setAnalysisResults(null);
    setError('');
    setSelectedCaseId('');
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
          Advanced Legal Analysis — Powered by Gemini 2.0
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

          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              component="label"
              startIcon={<CloudUpload />}
              disabled={isFileLoading || isAnalyzing}
            >
              Upload File
              <input ref={fileInputRef} type="file" accept=".txt,.pdf" onChange={handleFileChange} hidden />
            </Button>
            {isFileLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">Reading file...</Typography>
              </Box>
            )}
            <Button variant="outlined" startIcon={<Clear />} onClick={clearInput} disabled={isAnalyzing}>
              Clear
            </Button>
          </Box>

          <TextField
            fullWidth multiline rows={16}
            value={documentText}
            onChange={(e) => setDocumentText(e.target.value)}
            placeholder="Paste your legal document, case file, or FIR here..."
            disabled={isAnalyzing}
            sx={{ mb: 2 }}
          />

          <Button
            fullWidth variant="contained" size="large"
            onClick={handleAnalyze}
            disabled={isAnalyzing || !documentText.trim()}
            startIcon={isAnalyzing ? <CircularProgress size={20} color="inherit" /> : <Psychology />}
          >
            {isAnalyzing ? 'Analyzing Document...' : 'Analyze Document'}
          </Button>

          {/* Save to Case Panel */}
          {analysisResults && (
            <Box sx={{ mt: 3, p: 2, border: '1px solid', borderColor: 'primary.light', borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Save Analysis to a Case
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel>Select Case</InputLabel>
                <Select
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  label="Select Case"
                >
                  {cases.map(c => (
                    <MenuItem key={c._id} value={c._id}>
                      {c.caseNumber} — {c.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                fullWidth variant="outlined" startIcon={isSaving ? <CircularProgress size={16} /> : <Save />}
                onClick={handleSaveToCase}
                disabled={!selectedCaseId || isSaving}
              >
                {isSaving ? 'Saving...' : 'Save IPC Tags & Summary to Case'}
              </Button>
            </Box>
          )}
        </Paper>

        {/* Results Section */}
        <Paper elevation={3} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>Analysis Results</Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!analysisResults && !error && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Psychology sx={{ fontSize: 80, color: 'grey.300', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">Awaiting Analysis</Typography>
              <Typography variant="body2" color="text.disabled">Your results will appear here</Typography>
            </Box>
          )}

          {analysisResults && (
            <>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="Summaries" />
                <Tab label="Legal Analysis" />
                <Tab label="Predictions" />
              </Tabs>
              <Box sx={{ maxHeight: 600, overflowY: 'auto' }}>

                {activeTab === 0 && (
                  <Box>
                    {[
                      { label: 'Judge Brief', key: 'judgeBrief' },
                      { label: 'Lawyer Version', key: 'lawyerVersion' },
                      { label: 'Citizen Summary', key: 'citizenSummary' },
                    ].map(({ label, key }) => (
                      <Box key={key} sx={{ mb: 3 }}>
                        <Typography variant="h6" color="primary" gutterBottom>{label}</Typography>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                          <Typography>{analysisResults[key]}</Typography>
                        </Paper>
                      </Box>
                    ))}
                  </Box>
                )}

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
                    <Typography variant="h6" color="primary" gutterBottom sx={{ mt: 2 }}>Legal Provisions</Typography>
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
                    <Typography variant="h6" color="primary" gutterBottom sx={{ mt: 2 }}>Precedents</Typography>
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

                {activeTab === 2 && (
                  <Box>
                    {[
                      { label: 'Outcome Prediction', key: 'outcomePrediction' },
                      { label: 'Evidence Suggestions', key: 'evidenceSuggestion' },
                      { label: 'Timeline Estimate', key: 'timelineEstimate' },
                    ].map(({ label, key }) => (
                      <Box key={key} sx={{ mb: 3 }}>
                        <Typography variant="h6" color="primary" gutterBottom>{label}</Typography>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                          <Typography>{analysisResults[key]}</Typography>
                        </Paper>
                      </Box>
                    ))}
                  </Box>
                )}

              </Box>
            </>
          )}
        </Paper>
      </Box>

      <Snackbar
        open={savedSnack}
        autoHideDuration={4000}
        onClose={() => setSavedSnack(false)}
        message="Analysis saved to case successfully"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  );
}

export default AIAnalyzer;
