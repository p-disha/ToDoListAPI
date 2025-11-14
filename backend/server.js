require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');


const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');


const app = express();
app.use(cors());
app.use(express.json());


const PORT = process.env.PORT || 4000;


async function start() {
await mongoose.connect(process.env.MONGO_URI, {
useNewUrlParser: true,
useUnifiedTopology: true
});
console.log('Connected to MongoDB');


app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);


app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}


start().catch(err => {
console.error('Failed to start', err);
process.exit(1);
});

const path = require("path");

// Serve React frontend (after API routes)
app.use(express.static(path.join(__dirname, "build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});
