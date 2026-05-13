import React, { useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box, Menu, MenuItem } from '@mui/material';
import { 
  Gavel, 
  Dashboard as DashboardIcon,
  CalendarMonth,
  Analytics,
  Psychology, // 🆕 AI icon
  KeyboardArrowDown
} from '@mui/icons-material';
import { AuthContext } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleMenuNavigate = (path) => {
    navigate(path);
    handleMenuClose();
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <Gavel sx={{ mr: 2 }} />
        <Typography 
          variant="h6" 
          component={Link} 
          to="/" 
          sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit' }}
        >
          {/* Legal Document Intelligence  */}
          JusticeLens
        </Typography>
        
        {user ? (
          <Box display="flex" alignItems="center" gap={1}>
            {/* Dashboard Button */}
            <Button 
              color="inherit" 
              component={Link} 
              to="/"
              startIcon={<DashboardIcon />}
            >
              Dashboard
            </Button>

            {/* 🆕 AI Analyzer Button - Available for ALL users */}
            <Button 
              color="inherit" 
              component={Link} 
              to="/ai-analyzer"
              startIcon={<Psychology />}
              sx={{
                background: 'rgba(255, 255, 255, 0.1)',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.2)',
                }
              }}
            >
              AI Analyzer
            </Button>

            {/* Scheduling - Only for Judges */}
            {user.role === 'judge' && (
              <Button 
                color="inherit" 
                component={Link} 
                to="/scheduling"
                startIcon={<CalendarMonth />}
              >
                Scheduling
              </Button>
            )}

            {/* Analytics - For Judges and Clerks */}
            {(user.role === 'judge' || user.role === 'clerk') && (
              <Button 
                color="inherit" 
                component={Link} 
                to="/analytics"
                startIcon={<Analytics />}
              >
                Analytics
              </Button>
            )}

            {/* More Menu - Additional Features */}
            <Button
              color="inherit"
              onClick={handleMenuOpen}
              endIcon={<KeyboardArrowDown />}
            >
              More
            </Button>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
            >
              <MenuItem onClick={() => handleMenuNavigate('/create-case')}>
                Create New Case
              </MenuItem>
              {/* 🆕 AI Analyzer in dropdown too */}
              <MenuItem onClick={() => handleMenuNavigate('/ai-analyzer')}>
                AI Document Analyzer
              </MenuItem>
              {user.role === 'judge' && (
                <MenuItem onClick={() => handleMenuNavigate('/scheduling')}>
                  AI Scheduling
                </MenuItem>
              )}
              <MenuItem onClick={() => handleMenuNavigate('/analytics')}>
                View Analytics
              </MenuItem>
            </Menu>

            {/* User Info */}
            <Box sx={{ 
              ml: 2, 
              pl: 2, 
              borderLeft: '1px solid rgba(255,255,255,0.3)' 
            }}>
              <Typography variant="body2" component="span" sx={{ mr: 2 }}>
                Welcome, {user.name} ({user.role})
              </Typography>
              <Button 
                color="inherit" 
                onClick={handleLogout}
                variant="outlined"
                size="small"
                sx={{ 
                  borderColor: 'rgba(255,255,255,0.5)',
                  '&:hover': { 
                    borderColor: 'white',
                    backgroundColor: 'rgba(255,255,255,0.1)' 
                  }
                }}
              >
                Logout
              </Button>
            </Box>
          </Box>
        ) : (
          <Box>
            <Button color="inherit" component={Link} to="/login">Login</Button>
            <Button color="inherit" component={Link} to="/register">Register</Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
