const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['https://assin09-3.vercel.app', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ─── MONGODB CONNECTION ───────────────────────────────────────────────────────
const uri = `mongodb+srv://infomdfizz655_db_user:aUclIK10jTy1JH4T@cluster0.hzy45ka.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

// গ্লোবাল ভেরিয়েবল যাতে সব জায়গা থেকে এক্সেস করা যায়
let userCollection, carCollection, bookingCollection;

async function run() {
  try {
    await client.connect();
    const db = client.db('driveFleetDB');
    userCollection = db.collection('users');
    carCollection = db.collection('cars');
    bookingCollection = db.collection('bookings');
    console.log('✅ MongoDB Connected!');
  } catch (err) {
    console.error('❌ DB Error:', err);
  }
}
run();

// ─── AUTH ROUTES (এগুলো এখন মেইন বডিতে, তাই ৪MD হবে না) ───────────────────────

app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, photo, password } = req.body;
    if (!userCollection) return res.status(503).send({ message: 'Database not ready' });

    const exists = await userCollection.findOne({ email });
    if (exists) return res.status(400).send({ message: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 12);
    await userCollection.insertOne({ name, email, photo, password: hashed, createdAt: new Date() });
    res.status(201).send({ message: 'Success' });
  } catch (err) {
    res.status(500).send({ message: 'Server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userCollection.findOne({ email });
    if (!user || !user.password) return res.status(401).send({ message: 'Invalid login' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).send({ message: 'Invalid login' });

    const secret = process.env.ACCESS_TOKEN_SECRET || 'secret_key_123';
    const token = jwt.sign({ email: user.email, id: user._id }, secret, { expiresIn: '10h' });

    res.cookie('token', token, {
      httpOnly: true, secure: true, sameSite: 'none', maxAge: 10 * 60 * 60 * 1000,
    }).send({ user: { _id: user._id, name: user.name, email: user.email, photo: user.photo }, token });
  } catch (err) {
    res.status(500).send({ message: 'Login failed' });
  }
});

// অন্য সব রুট (Cars, Bookings) আপনার আগের কোড থেকে নিয়ে এখানে app.get/post হিসেবে দিয়ে দিন

app.get('/', (req, res) => res.send('🚗 API is Live ✓'));

app.listen(port, () => console.log(`🚀 Server on port ${port}`));