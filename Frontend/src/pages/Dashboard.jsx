import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Typography, Button, Box, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField, Grid, Card, CardContent,
  Avatar, InputAdornment, Skeleton, Tooltip
} from '@mui/material';
import {
  Add, Search, Gavel, HourglassEmpty, CheckCircle,
  Folder, TrendingUp, CalendarToday, Info
} from '@mui/icons-material';
import API from '../api/axios';
import { AuthContext } from '../context/AuthContext';

// Case lifecycle flowchart — pure SVG, no library needed
const CaseWorkflowFlowchart = ({ stats }) => {
  const steps = [
    { label: 'Filed', sub: 'Case registered', color: '#1565c0', count: null },
    { label: 'Under Review', sub: 'Docs verified', color: '#e65100', count: stats.pending },
    { label: 'Hearing Set', sub: 'Date assigned', color: '#6a1b9a', count: stats.scheduled },
    { label: 'In Progress', sub: 'Court hearings', color: '#0277bd', count: null },
    { label: 'Judgment', sub: 'Order passed', color: '#2e7d32', count: stats.completed },
    { label: 'Closed', sub: 'Case archived', color: '#424242', count: null },
  ];

  const boxW = 110;
  const boxH = 70;
  const gap = 30;
  const totalW = steps.length * boxW + (steps.length - 1) * gap;
  const svgW = totalW + 40;
  const svgH = 120;

  return (
    <Paper sx={{ p: 3, boxShadow: 2, mb: 4 }}>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <Typography variant="h6" fontWeight="bold">Case Lifecycle Workflow</Typography>
        <Tooltip title="This flowchart shows the journey of a legal case from filing to closure." arrow>
          <Info fontSize="small" sx={{ color: 'text.secondary', cursor: 'help' }} />
        </Tooltip>
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} xmlns="http://www.w3.org/2000/svg">
          {steps.map((step, i) => {
            const x = 20 + i * (boxW + gap);
            const y = 15;
            const arrowX1 = x + boxW;
            const arrowX2 = x + boxW + gap;
            const arrowY = y + boxH / 2;

            return (
              <g key={step.label}>
                {/* Box */}
                <rect
                  x={x} y={y} width={boxW} height={boxH} rx={8}
                  fill={step.color} opacity={0.92}
                />
                {/* Count badge */}
                {step.count !== null && (
                  <>
                    <circle cx={x + boxW - 10} cy={y + 10} r={12} fill="white" opacity={0.9} />
                    <text x={x + boxW - 10} y={y + 15} textAnchor="middle" fontSize={11} fontWeight="bold" fill={step.color}>
                      {step.count}
                    </text>
                  </>
                )}
                {/* Label */}
                <text x={x + boxW / 2} y={y + 28} textAnchor="middle" fontSize={13} fontWeight="bold" fill="white">
                  {step.label}
                </text>
                {/* Sub-label */}
                <text x={x + boxW / 2} y={y + 46} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.85)">
                  {step.sub}
                </text>

                {/* Arrow */}
                {i < steps.length - 1 && (
                  <>
                    <line x1={arrowX1} y1={arrowY} x2={arrowX2 - 6} y2={arrowY}
                      stroke="#90a4ae" strokeWidth={2} />
                    <polygon
                      points={`${arrowX2 - 6},${arrowY - 5} ${arrowX2},${arrowY} ${arrowX2 - 6},${arrowY + 5}`}
                      fill="#90a4ae"
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Numbered badges show current live counts from the database.
      </Typography>
    </Paper>
  );
};

const Dashboard = () => {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0, scheduled: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const canCreateCase = user && ['judge', 'lawyer', 'clerk'].includes(user.role);

  useEffect(() => { fetchCases(); }, []);

  const fetchCases = async () => {
    try {
      const { data } = await API.get('/cases/all?limit=100');
      setCases(data.cases);
      const total = data.totalCases;
      const pending = data.cases.filter(c => c.status === 'pending' || c.status === 'processing').length;
      const completed = data.cases.filter(c => c.status === 'completed').length;
      const scheduled = data.cases.filter(c => c.status === 'scheduled').length;
      setStats({ total, pending, completed, scheduled });
    } catch (error) {
      console.error('Error fetching cases:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCases = cases.filter(c =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.caseNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'scheduled': return 'info';
      case 'processing': return 'warning';
      case 'pending': return 'default';
      default: return 'default';
    }
  };

  const StatCard = ({ title, value, icon, color, bgColor }) => (
    <Card sx={{
      height: '100%', boxShadow: 3, transition: 'all 0.3s',
      '&:hover': { transform: 'translateY(-6px)', boxShadow: 6 }
    }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2" fontWeight="medium">
              {title}
            </Typography>
            {loading
              ? <Skeleton variant="text" width={60} height={60} />
              : <Typography variant="h2" fontWeight="bold" sx={{ color }}>{value}</Typography>
            }
          </Box>
          <Avatar sx={{ background: bgColor, width: 70, height: 70, boxShadow: 2 }}>
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h3" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}>
            <Gavel sx={{ mr: 2, fontSize: 45, color: 'primary.main' }} />
            Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            {user ? `Logged in as ${user.name} — ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}` : 'Legal Case Management'}
          </Typography>
        </Box>
        {canCreateCase && (
          <Button
            variant="contained"
            size="large"
            startIcon={<Add />}
            onClick={() => navigate('/create-case')}
            sx={{
              px: 4, py: 1.5, boxShadow: 3, transition: 'all 0.3s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 5 }
            }}
          >
            Create New Case
          </Button>
        )}
      </Box>

      {/* Stat Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          { title: 'Total Cases', value: stats.total, icon: <Folder sx={{ fontSize: 35, color: 'white' }} />, color: '#1976d2', bgColor: 'linear-gradient(135deg, #1976d2, #1565c0)' },
          { title: 'Pending / Processing', value: stats.pending, icon: <HourglassEmpty sx={{ fontSize: 35, color: 'white' }} />, color: '#ed6c02', bgColor: 'linear-gradient(135deg, #ed6c02, #e65100)' },
          { title: 'Scheduled', value: stats.scheduled, icon: <CalendarToday sx={{ fontSize: 35, color: 'white' }} />, color: '#0288d1', bgColor: 'linear-gradient(135deg, #0288d1, #01579b)' },
          { title: 'Completed', value: stats.completed, icon: <CheckCircle sx={{ fontSize: 35, color: 'white' }} />, color: '#2e7d32', bgColor: 'linear-gradient(135deg, #2e7d32, #1b5e20)' },
        ].map(card => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <StatCard {...card} />
          </Grid>
        ))}
      </Grid>

      {/* Case Lifecycle Workflow Flowchart */}
      <CaseWorkflowFlowchart stats={stats} />

      {/* Search Bar */}
      <Paper sx={{ mb: 3, boxShadow: 2 }}>
        <TextField
          fullWidth
          placeholder="Search cases by number or title..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: 'text.secondary', fontSize: 28 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': { '& fieldset': { border: 'none' } },
            '& input': { py: 2, fontSize: '1.1rem' }
          }}
        />
      </Paper>

      {/* Cases Table */}
      <Paper sx={{ boxShadow: 3, borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{
          p: 2, backgroundColor: 'primary.main', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <Typography variant="h6" fontWeight="bold">
            <TrendingUp sx={{ mr: 1, verticalAlign: 'middle' }} />
            Recent Cases ({loading ? '...' : filteredCases.length})
          </Typography>
          <Chip
            label={loading ? '...' : `${stats.total} Total`}
            sx={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }}
          />
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell><strong>Case Number</strong></TableCell>
                <TableCell><strong>Title</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Created Date</strong></TableCell>
                <TableCell><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}><Skeleton variant="text" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredCases.length > 0 ? (
                filteredCases.map((case_) => (
                  <TableRow
                    key={case_._id}
                    hover
                    sx={{ '&:hover': { backgroundColor: '#f0f7ff', cursor: 'pointer' } }}
                  >
                    <TableCell>
                      <Typography fontWeight="bold" color="primary">{case_.caseNumber}</Typography>
                    </TableCell>
                    <TableCell>{case_.title}</TableCell>
                    <TableCell>
                      <Chip label={case_.status} color={getStatusColor(case_.status)} size="small" sx={{ fontWeight: 'bold' }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(case_.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => navigate(`/case/${case_._id}`)}
                        sx={{ '&:hover': { transform: 'scale(1.05)', boxShadow: 2 }, transition: 'all 0.2s' }}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    <Folder sx={{ fontSize: 80, color: 'text.secondary', mb: 2, opacity: 0.3 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>No cases found</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Try adjusting your search{canCreateCase ? ' or create a new case' : ''}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
};

export default Dashboard;
