import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Paper, Typography, Box, Card, CardContent,
  Skeleton, Alert
} from '@mui/material';
import { TrendingUp, Schedule, CheckCircle, Assessment } from '@mui/icons-material';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import API from '../api/axios';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
);

// Groups cases by calendar month for the last N months
const getMonthlyBreakdown = (cases, months = 6) => {
  const labels = [];
  const pendingData = [];
  const completedData = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth();
    labels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));

    const monthCases = cases.filter(c => {
      const cd = new Date(c.createdAt);
      return cd.getFullYear() === year && cd.getMonth() === month;
    });

    pendingData.push(
      monthCases.filter(c => c.status === 'pending' || c.status === 'processing').length
    );
    completedData.push(monthCases.filter(c => c.status === 'completed').length);
  }
  return { labels, pendingData, completedData };
};

// Groups cases by ISO week for the last 5 weeks
const getWeeklyBreakdown = (cases) => {
  const labels = [];
  const resolvedData = [];
  const scheduledData = [];
  const now = new Date();

  for (let i = 4; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 7);

    labels.push(i === 0 ? 'This Week' : `${i}w ago`);

    const weekCases = cases.filter(c => {
      const cd = new Date(c.createdAt);
      return cd >= weekStart && cd < weekEnd;
    });

    resolvedData.push(weekCases.filter(c => c.status === 'completed').length);
    scheduledData.push(weekCases.filter(c => c.status === 'scheduled').length);
  }
  return { labels, resolvedData, scheduledData };
};

const StatCard = ({ title, value, icon, color, loading }) => (
  <Card sx={{ height: '100%', boxShadow: 3 }}>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography color="textSecondary" gutterBottom variant="h6">{title}</Typography>
          {loading
            ? <Skeleton variant="text" width={60} height={60} />
            : <Typography variant="h2" sx={{ color, fontWeight: 'bold' }}>{value}</Typography>
          }
        </Box>
        <Box sx={{ fontSize: 80, color, opacity: 0.25 }}>{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { padding: 15, font: { size: 12 } }
    }
  }
};

const Analytics = () => {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({ totalCases: 0, pendingCases: 0, completedCases: 0, scheduledCases: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchAnalytics(); }, []);

  const fetchAnalytics = async () => {
    try {
      const { data } = await API.get('/cases/all?limit=1000');
      const allCases = data.cases || [];
      setCases(allCases);
      setStats({
        totalCases: data.totalCases || allCases.length,
        pendingCases: allCases.filter(c => c.status === 'pending' || c.status === 'processing').length,
        completedCases: allCases.filter(c => c.status === 'completed').length,
        scheduledCases: allCases.filter(c => c.status === 'scheduled').length,
      });
    } catch (err) {
      setError('Failed to load analytics data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const { labels: monthLabels, pendingData, completedData } = getMonthlyBreakdown(cases, 6);
  const { labels: weekLabels, resolvedData, scheduledData } = getWeeklyBreakdown(cases);

  const lineChartData = {
    labels: monthLabels,
    datasets: [
      {
        label: 'Pending Cases',
        data: pendingData,
        borderColor: 'rgba(237, 108, 2, 1)',
        backgroundColor: 'rgba(237, 108, 2, 0.1)',
        fill: true, tension: 0.4,
      },
      {
        label: 'Completed Cases',
        data: completedData,
        borderColor: 'rgba(46, 125, 50, 1)',
        backgroundColor: 'rgba(46, 125, 50, 0.1)',
        fill: true, tension: 0.4,
      },
    ],
  };

  const barChartData = {
    labels: weekLabels,
    datasets: [
      {
        label: 'Cases Resolved',
        data: resolvedData,
        backgroundColor: 'rgba(25, 118, 210, 0.7)',
        borderColor: 'rgba(25, 118, 210, 1)',
        borderWidth: 2,
      },
      {
        label: 'Cases Scheduled',
        data: scheduledData,
        backgroundColor: 'rgba(156, 39, 176, 0.7)',
        borderColor: 'rgba(156, 39, 176, 1)',
        borderWidth: 2,
      },
    ],
  };

  const pieChartData = {
    labels: ['Completed', 'Pending / Processing', 'Scheduled'],
    datasets: [{
      data: [stats.completedCases, stats.pendingCases, stats.scheduledCases],
      backgroundColor: [
        'rgba(46, 125, 50, 0.8)',
        'rgba(237, 108, 2, 0.8)',
        'rgba(156, 39, 176, 0.8)',
      ],
      borderColor: [
        'rgba(46, 125, 50, 1)',
        'rgba(237, 108, 2, 1)',
        'rgba(156, 39, 176, 1)',
      ],
      borderWidth: 2,
    }],
  };

  const doughnutChartData = {
    labels: ['Completed', 'Remaining'],
    datasets: [{
      data: [stats.completedCases, stats.pendingCases + stats.scheduledCases],
      backgroundColor: ['rgba(46, 125, 50, 0.8)', 'rgba(189, 189, 189, 0.3)'],
      borderColor: ['rgba(46, 125, 50, 1)', 'rgba(189, 189, 189, 1)'],
      borderWidth: 2,
    }],
  };

  const completionRate = stats.totalCases > 0
    ? ((stats.completedCases / stats.totalCases) * 100).toFixed(1)
    : '0.0';

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box mb={4}>
        <Typography variant="h4" gutterBottom>
          <Assessment sx={{ mr: 1, verticalAlign: 'middle' }} />
          Analytics Dashboard
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Live insights derived from case records
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Stat Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          { title: 'Total Cases', value: stats.totalCases, icon: <TrendingUp />, color: '#1976d2' },
          { title: 'Pending / Processing', value: stats.pendingCases, icon: <Schedule />, color: '#ed6c02' },
          { title: 'Scheduled', value: stats.scheduledCases, icon: <Schedule />, color: '#9c27b0' },
          { title: 'Completed', value: stats.completedCases, icon: <CheckCircle />, color: '#2e7d32' },
        ].map(card => (
          <Grid item xs={12} sm={6} md={3} key={card.title}>
            <StatCard {...card} loading={loading} />
          </Grid>
        ))}
      </Grid>

      {/* Charts Row 1 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, boxShadow: 3 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Case Backlog Trend — Last 6 Months (Real Data)
            </Typography>
            {loading
              ? <Skeleton variant="rectangular" height={300} />
              : <Box sx={{ height: 300 }}><Line data={lineChartData} options={chartOptions} /></Box>
            }
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, boxShadow: 3 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Case Status Distribution
            </Typography>
            {loading
              ? <Skeleton variant="circular" width={250} height={250} sx={{ mx: 'auto' }} />
              : (
                <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Pie data={pieChartData} options={chartOptions} />
                </Box>
              )
            }
          </Paper>
        </Grid>
      </Grid>

      {/* Charts Row 2 */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, boxShadow: 3 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Weekly Performance — Last 5 Weeks (Real Data)
            </Typography>
            {loading
              ? <Skeleton variant="rectangular" height={300} />
              : <Box sx={{ height: 300 }}><Bar data={barChartData} options={chartOptions} /></Box>
            }
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, boxShadow: 3 }}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Overall Completion Rate
            </Typography>
            {loading
              ? <Skeleton variant="circular" width={250} height={250} sx={{ mx: 'auto' }} />
              : (
                <>
                  <Box sx={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Doughnut data={doughnutChartData} options={chartOptions} />
                  </Box>
                  <Typography variant="h4" textAlign="center" color="success.main" fontWeight="bold" mt={1}>
                    {completionRate}%
                  </Typography>
                </>
              )
            }
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Analytics;
