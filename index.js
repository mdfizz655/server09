const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors({
  origin: ['https://assin09-3.vercel.app', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// পাসওয়ার্ডে $ থাকলে অবশ্যই %24 দিবেন
const uri = `mongodb+srv://infomdfizz655_db_user:aUclIK10jTy1JH4T@cluster0.hzy45ka.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let carCollection, bookingCollection, userCollection;

// ডাটাবেস কানেকশন
async function connectDB() {
  try {
    await client.connect();
    const db = client.db('driveFleetDB');
    carCollection = db.collection('cars');
    bookingCollection = db.collection('bookings');
    userCollection = db.collection('users');
    console.log("✅ MongoDB Connected!");
  } catch (err) {
    console.error("❌ DB Connection Error:", err);
  }
}
connectDB();

// Middleware: Verify Token
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send({ message: 'Unauthorized' });
  
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'secret', (err, decoded) => {
    if (err) return res.status(403).send({ message: 'Forbidden' });
    req.user = decoded;
    next();
  });
};

// ─── ROUTES (এগুলো এখন গ্লোবাল, তাই ৪MD হবে না) ──────────────────────────

// ১. Add Car (Private)
app.post('/cars', verifyToken, async (req, res) => {
  try {
    if (!carCollection) return res.status(503).send({ message: 'DB not ready' });
    const result = await carCollection.insertOne({ ...req.body, createdAt: new Date() });
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ message: 'Failed to add car' });
  }
});

// ২. Auth Routes
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, photo, password } = req.body;
    const hashed = await bcrypt.hash(password, 12);
    await userCollection.insertOne({ name, email, photo, password: hashed, createdAt: new Date() });
    res.status(201).send({ message: 'Registered' });
  } catch (err) { res.status(500).send(err); }
});

// ৩. Get Cars (Public)
app.get('/cars', async (req, res) => {
  try {
    const result = await carCollection.find().toArray();
    res.send(result);
  } catch (err) { res.status(500).send(err); }
});

app.get('/', (req, res) => res.send('🚗 API Live'));
app.listen(port, () => console.log(`🚀 Server on ${port}`));