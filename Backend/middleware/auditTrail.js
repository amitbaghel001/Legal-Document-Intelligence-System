import AuditLog from '../models/AuditLog.js';

export const auditTrail = (action, resourceType, resourceIdResolver) => (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode >= 400) return;
    try {
      const resourceId = resourceIdResolver ? resourceIdResolver(req, res) : req.params.id;
      await AuditLog.create({
        actor: req.user?._id,
        action,
        resourceType,
        resourceId: resourceId ? String(resourceId) : undefined,
        metadata: {
          method: req.method,
          path: req.originalUrl
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    } catch (error) {
      console.error('Audit log write failed:', error.message);
    }
  });
  next();
};

