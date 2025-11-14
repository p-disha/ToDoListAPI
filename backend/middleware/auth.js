const jwt = require('jsonwebtoken');
const User = require('../models/User');


function authenticateJWT(req, res, next) {
const authHeader = req.headers.authorization;
if (!authHeader) return res.status(401).json({ message: 'Missing Authorization header' });
const token = authHeader.split(' ')[1];
if (!token) return res.status(401).json({ message: 'Invalid Authorization header' });


try {
const payload = jwt.verify(token, process.env.JWT_SECRET);
req.user = payload; // { id, email, role }
next();
} catch (err) {
return res.status(401).json({ message: 'Invalid or expired token' });
}
}


function authorizeRoles(...allowedRoles) {
return (req, res, next) => {
if (!req.user) return res.status(401).json({ message: 'Unauthenticated' });
if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
next();
};
}


module.exports = { authenticateJWT, authorizeRoles };