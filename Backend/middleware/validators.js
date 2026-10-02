const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateAuthPayload(req, res, next) {
  const { email, password } = req.body;
  if (!isNonEmptyString(email) || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  if (!isNonEmptyString(password) || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  next();
}

export function validateRegisterPayload(req, res, next) {
  const { name, role } = req.body;
  if (!isNonEmptyString(name) || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (!['judge', 'lawyer', 'clerk', 'citizen'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role selected' });
  }
  return validateAuthPayload(req, res, next);
}

export function validateCasePayload(req, res, next) {
  const { caseNumber, title } = req.body;
  if (!isNonEmptyString(caseNumber) || caseNumber.trim().length < 3) {
    return res.status(400).json({ error: 'Case number is required' });
  }
  if (!isNonEmptyString(title) || title.trim().length < 5) {
    return res.status(400).json({ error: 'Title must be at least 5 characters' });
  }
  next();
}

export function validateCaseUpdatePayload(req, res, next) {
  const { title, status, summary } = req.body;
  const allowedStatus = ['pending', 'processing', 'completed', 'closed', 'scheduled'];

  if (title !== undefined && (!isNonEmptyString(title) || title.trim().length < 5)) {
    return res.status(400).json({ error: 'Title must be at least 5 characters' });
  }
  if (status !== undefined && !allowedStatus.includes(status)) {
    return res.status(400).json({ error: 'Invalid case status' });
  }
  if (summary !== undefined && typeof summary !== 'string') {
    return res.status(400).json({ error: 'Summary must be text' });
  }
  next();
}

