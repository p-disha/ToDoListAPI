const jwt = require('jsonwebtoken');

function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ message: 'Missing Authorization header' });

  const token = authHeader.split(' ')[1];
  if (!token)
    return res.status(401).json({ message: 'Invalid Authorization header' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Normalize the user object
    req.user = {
      id: payload.id || payload._id,   // ALWAYS this
      email: payload.email,
      role: payload.role || 'user'
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = { authenticateJWT };
