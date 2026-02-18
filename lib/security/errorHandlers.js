export function notFoundHandler(req, res, _next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found.', code: 'NOT_FOUND' });
  }
  return res.status(404).send('Not Found');
}

export function apiErrorHandler(err, req, res, _next) {
  console.error('API Error:', err);
  const status = err.statusCode || err.status || 500;
  if (req.path.startsWith('/api')) {
    return res.status(status).json({
      error: err.publicMessage || 'Internal server error.',
      code: err.code || 'INTERNAL_ERROR',
    });
  }
  return res.status(status).send('Internal Server Error');
}
