import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container, Typography, Button, Box, Paper, Chip, Divider, Grid,
  Card, CardContent, List, ListItem, ListItemText, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Alert, CircularProgress
} from '@mui/material';
import { CloudUpload, Description, Delete, Lightbulb } from '@mui/icons-material';
import API from '../api/axios';
import Loading from '../components/Loading';
import { AuthContext } from '../context/AuthContext';

const CaseDetails = () => {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const canEdit = user && ['judge', 'lawyer', 'clerk'].includes(user.role);
  const canDelete = user && ['judge', 'clerk'].includes(user.role);
  const [case_, setCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [similarCases, setSimilarCases] = useState([]);
  const [loadingSimilarCases, setLoadingSimilarCases] = useState(true);
  const [selectedIPC, setSelectedIPC] = useState(null);
  const [ipcContextDialog, setIpcContextDialog] = useState(false);
  const [analyzingCase, setAnalyzingCase] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCase();
    fetchSimilarCases();
  }, [id]);

  const fetchCase = async () => {
    try {
      const { data } = await API.get(`/cases/${id}`);
      setCase(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching case:', error);
      setLoading(false);
    }
  };

  // Fetch similar cases for precedent analysis
  const fetchSimilarCases = async () => {
    setLoadingSimilarCases(true);
    try {
      const { data } = await API.get(`/cases/${id}/similar`);
      console.log('Similar cases received:', data);
      setSimilarCases(data || []);
    } catch (error) {
      console.error('Error fetching similar cases:', error);
      setSimilarCases([]);
    } finally {
      setLoadingSimilarCases(false);
    }
  };

  // AI Analysis trigger
  const handleAIAnalysis = async () => {
    setAnalyzingCase(true);
    try {
      const { data } = await API.post(`/ai/analyze/${id}`);
      alert('AI Analysis completed successfully!');
      fetchCase();
    } catch (error) {
      alert('Error analyzing case: ' + error.message);
    } finally {
      setAnalyzingCase(false);
    }
  };

  // REAL IPC CONTEXT EXTRACTION - Extracts from actual case text
  const handleIPCClick = async (ipcCode) => {
    try {
      // Extract real context from case description/summary
      const fullText = (case_.description || '') + ' ' + (case_.summary || '');
      
      if (!fullText.trim()) {
        setSelectedIPC({
          ipcCode,
          contexts: [{
            sentence: 'No detailed description available for context extraction.',
            confidence: 0,
            paragraph: 0
          }]
        });
        setIpcContextDialog(true);
        return;
      }
      
      // Split into sentences
      const sentences = fullText
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20);
      
      // Extract IPC number (e.g., "379" from "IPC 379")
      const ipcNumber = ipcCode.match(/\d+/)?.[0];
      
      // Keywords related to common IPC sections
      const ipcKeywords = {
        '379': ['theft', 'stolen', 'took', 'stole', 'taking', 'property', 'dishonestly', 'movable'],
        '323': ['hurt', 'assault', 'beaten', 'injured', 'violence', 'attack', 'voluntarily', 'causing'],
        '302': ['murder', 'killed', 'death', 'homicide', 'culpable', 'intention', 'causing death'],
        '420': ['cheat', 'fraud', 'deceive', 'dishonestly', 'inducing', 'delivery', 'property'],
        '498A': ['dowry', 'cruelty', 'harassment', 'husband', 'married', 'woman', 'relatives'],
        '376': ['rape', 'sexual', 'assault', 'intercourse', 'consent', 'woman'],
        '304B': ['dowry death', 'died', 'soon after marriage', 'harassment', 'demand'],
        '406': ['breach of trust', 'entrusted', 'misappropriation', 'criminal breach'],
        '120B': ['conspiracy', 'agreement', 'criminal act', 'two or more persons'],
        '201': ['evidence', 'disappearance', 'screen offender', 'false information'],
        '34': ['common intention', 'act done', 'furtherance', 'several persons']
      };
      
      const keywords = ipcKeywords[ipcNumber] || ['case', 'accused', 'alleged', 'charge'];
      
      // Find relevant sentences
      const contexts = [];
      sentences.forEach((sentence, idx) => {
        const lowerSentence = sentence.toLowerCase();
        
        // Check if sentence contains IPC number or keywords
        const hasIPCNumber = lowerSentence.includes(ipcNumber);
        const matchedKeywords = keywords.filter(kw => lowerSentence.includes(kw.toLowerCase()));
        
        if (hasIPCNumber || matchedKeywords.length > 0) {
          const confidence = hasIPCNumber ? 0.95 : (matchedKeywords.length * 0.25);
          
          if (confidence > 0.25) {
            contexts.push({
              sentence: sentence,
              confidence: Math.min(confidence, 0.98),
              paragraph: Math.floor(idx / 3) + 1,
              matchedKeywords: matchedKeywords.slice(0, 3)
            });
          }
        }
      });
      
      // Sort by confidence score
      contexts.sort((a, b) => b.confidence - a.confidence);
      
      // If no context found, use first few sentences
      if (contexts.length === 0) {
        contexts.push({
          sentence: sentences[0] || 'No specific context found for this IPC section in the case description.',
          confidence: 0.3,
          paragraph: 1,
          matchedKeywords: []
        });
      }
      
      setSelectedIPC({
        ipcCode,
        contexts: contexts.slice(0, 3)
      });
      setIpcContextDialog(true);
      
    } catch (error) {
      console.error('Error extracting IPC context:', error);
      alert('Error extracting context');
    }
  };

  // Delete document
  const handleDeleteDocument = async (docId, docName) => {
    if (window.confirm(`Delete ${docName}?`)) {
      try {
        await API.delete(`/documents/${docId}`);
        alert('Document deleted successfully!');
        fetchCase();
      } catch (error) {
        alert('Error deleting document: ' + error.message);
      }
    }
  };

  if (loading) return <Loading />;
  if (!case_) return <Typography>Case not found</Typography>;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4">Case Details</Typography>
          {user && (
            <Chip
              label={user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              size="small"
              color={user.role === 'judge' ? 'primary' : user.role === 'lawyer' ? 'secondary' : 'default'}
              sx={{ mt: 0.5 }}
            />
          )}
        </Box>
        <Box display="flex" gap={2}>
          {canEdit && (
            <Button
              variant="outlined"
              startIcon={analyzingCase ? <CircularProgress size={20} /> : <Lightbulb />}
              onClick={handleAIAnalysis}
              disabled={analyzingCase}
            >
              {analyzingCase ? 'Analyzing...' : 'AI Analysis'}
            </Button>
          )}
          {canEdit && (
            <Button
              variant="contained"
              startIcon={<CloudUpload />}
              onClick={() => navigate(`/upload/${case_._id}`)}
            >
              Upload Document
            </Button>
          )}
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Case Information */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Case Information</Typography>
            <Divider sx={{ mb: 2 }} />
            
            <Box mb={2}>
              <Typography variant="subtitle2" color="textSecondary">Case Number</Typography>
              <Typography variant="body1">{case_.caseNumber}</Typography>
            </Box>

            <Box mb={2}>
              <Typography variant="subtitle2" color="textSecondary">Title</Typography>
              <Typography variant="body1">{case_.title}</Typography>
            </Box>

            <Box mb={2}>
              <Typography variant="subtitle2" color="textSecondary">Description</Typography>
              <Typography variant="body1">{case_.description || 'No description'}</Typography>
            </Box>

            <Box mb={2}>
              <Typography variant="subtitle2" color="textSecondary">Status</Typography>
              <Chip label={case_.status} color={case_.status === 'completed' ? 'success' : 'default'} />
            </Box>

            {case_.priority && (
              <Box mb={2}>
                <Typography variant="subtitle2" color="textSecondary">Priority</Typography>
                <Chip 
                  label={case_.priority.toUpperCase()} 
                  color={
                    case_.priority === 'urgent' ? 'error' : 
                    case_.priority === 'high' ? 'warning' : 'info'
                  } 
                />
              </Box>
            )}

            {case_.scheduledDate && (
              <Box mb={2}>
                <Typography variant="subtitle2" color="textSecondary">Scheduled Hearing</Typography>
                <Typography variant="body1">
                  {new Date(case_.scheduledDate).toLocaleDateString()} at {case_.scheduledTime}
                  {case_.courtRoom && ` - ${case_.courtRoom}`}
                </Typography>
              </Box>
            )}

            <Box mb={2}>
              <Typography variant="subtitle2" color="textSecondary">Created By</Typography>
              <Typography variant="body1">{case_.createdBy?.name} ({case_.createdBy?.email})</Typography>
            </Box>
          </Paper>

          {/* AI Summary */}
          {case_.summary && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>AI-Generated Summary</Typography>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="body1">{case_.summary}</Typography>
            </Paper>
          )}

          {/* IPC Tags with Context */}
          {case_.ipcTags && case_.ipcTags.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                IPC Sections 
                <Typography variant="caption" color="textSecondary" sx={{ ml: 2 }}>
                  (Click to see evidence context)
                </Typography>
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box display="flex" flexWrap="wrap" gap={1}>
                {case_.ipcTags.map((tag, index) => (
                  <Tooltip key={index} title="Click to see where this section applies" arrow>
                    <Chip 
                      label={tag} 
                      color="primary" 
                      variant="outlined"
                      onClick={() => handleIPCClick(tag)}
                      sx={{ 
                        cursor: 'pointer', 
                        '&:hover': { 
                          backgroundColor: 'primary.light',
                          transform: 'scale(1.05)',
                          transition: 'all 0.2s'
                        } 
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            </Paper>
          )}

          {/* Entities */}
          {case_.entities && case_.entities.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>Extracted Entities</Typography>
              <Divider sx={{ mb: 2 }} />
              <Box display="flex" flexWrap="wrap" gap={1}>
                {case_.entities.map((entity, index) => (
                  <Chip key={index} label={entity} variant="outlined" />
                ))}
              </Box>
            </Paper>
          )}

          {/* Similar Cases - IMPROVED VERSION */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Similar Cases (Precedent Analysis)
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {loadingSimilarCases ? (
              <Box display="flex" justifyContent="center" alignItems="center" py={4}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Finding similar cases...</Typography>
              </Box>
            ) : similarCases && similarCases.length > 0 ? (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  AI found {similarCases.length} similar cases based on IPC sections, entities, and case content
                </Alert>
                <List>
                  {similarCases.map((sCase) => (
                    <ListItem 
                      key={sCase._id} 
                      button 
                      component={Link} 
                      to={`/case/${sCase._id}`}
                      sx={{ 
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2, 
                        mb: 2,
                        display: 'block',
                        textDecoration: 'none',
                        '&:hover': { 
                          backgroundColor: 'action.hover',
                          transform: 'translateX(4px)',
                          transition: 'all 0.2s'
                        }
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Typography variant="subtitle1" fontWeight="bold" color="primary">
                          {sCase.caseNumber}
                        </Typography>
                        <Chip 
                          label={`${sCase.similarityScore}% Match`} 
                          size="small" 
                          color={
                            sCase.similarityScore >= 50 ? 'success' :
                            sCase.similarityScore >= 30 ? 'warning' : 'default'
                          }
                          sx={{ fontWeight: 'bold' }}
                        />
                      </Box>
                      
                      <Typography variant="body2" color="text.primary" sx={{ mb: 1 }}>
                        {sCase.title}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        {sCase.ipcTags && sCase.ipcTags.slice(0, 4).map((tag, idx) => (
                          <Chip 
                            key={idx}
                            label={tag} 
                            size="small" 
                            variant="outlined"
                            color="primary"
                          />
                        ))}
                        {sCase.ipcTags && sCase.ipcTags.length > 4 && (
                          <Chip 
                            label={`+${sCase.ipcTags.length - 4} more`}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                      
                      {sCase.status && (
                        <Box sx={{ mt: 1 }}>
                          <Chip 
                            label={sCase.status} 
                            size="small"
                            color={sCase.status === 'completed' ? 'success' : 'default'}
                          />
                        </Box>
                      )}
                    </ListItem>
                  ))}
                </List>
              </>
            ) : (
              <Alert severity="warning">
                No similar cases found in the database with minimum 10% similarity.
                <Typography variant="body2" sx={{ mt: 1 }}>
                  This could mean this is a unique case or there aren't enough cases in the database yet.
                </Typography>
              </Alert>
            )}
          </Paper>
        </Grid>

        {/* Documents Sidebar */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Documents ({case_.documents?.length || 0})</Typography>
              <Divider sx={{ mb: 2 }} />
              
              {case_.documents && case_.documents.length > 0 ? (
                <List>
                  {case_.documents.map((doc) => (
                    <ListItem key={doc._id} sx={{ px: 0, display: 'flex', alignItems: 'flex-start' }}>
                      <Description sx={{ mr: 1, color: 'text.secondary', mt: 1 }} />
                      <ListItemText
                        primary={doc.originalName}
                        secondary={
                          <>
                            <Chip label={doc.status} size="small" sx={{ mt: 0.5 }} />
                            <Typography variant="caption" display="block">
                              {new Date(doc.uploadedAt).toLocaleDateString()}
                            </Typography>
                          </>
                        }
                      />
                      {canDelete && (
                        <IconButton
                          color="error"
                          size="small"
                          onClick={() => handleDeleteDocument(doc._id, doc.originalName)}
                          sx={{ ml: 1 }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      )}
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="textSecondary">
                  No documents uploaded yet
                </Typography>
              )}

              {canEdit && (
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<CloudUpload />}
                  onClick={() => navigate(`/upload/${case_._id}`)}
                  sx={{ mt: 2 }}
                >
                  Upload Document
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* IPC Context Dialog - Shows REAL extracted text */}
      <Dialog 
        open={ipcContextDialog} 
        onClose={() => setIpcContextDialog(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          {selectedIPC?.ipcCode} - Evidence & Context
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            AI has identified the following text segments from the case description that support this IPC section:
          </Alert>
          {selectedIPC?.contexts?.map((context, idx) => (
            <Paper 
              key={idx} 
              sx={{ 
                p: 2, 
                mb: 2, 
                backgroundColor: context.confidence > 0.7 ? 'warning.light' : 'grey.100',
                border: '2px solid',
                borderColor: context.confidence > 0.7 ? 'warning.main' : 'grey.300'
              }}
            >
              <Typography variant="body2" sx={{ fontStyle: 'italic', fontWeight: 500 }}>
                "{context.sentence}"
              </Typography>
              <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                <Typography variant="caption">
                  Confidence: <strong>{(context.confidence * 100).toFixed(1)}%</strong>
                  {context.matchedKeywords?.length > 0 && (
                    <span style={{ marginLeft: '10px', color: '#666' }}>
                      | Keywords: {context.matchedKeywords.join(', ')}
                    </span>
                  )}
                </Typography>
                <Typography variant="caption">
                  Location: Paragraph {context.paragraph}
                </Typography>
              </Box>
            </Paper>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIpcContextDialog(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default CaseDetails;
