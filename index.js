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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.use(express.json());
app.use(cookieParser());

// ─── MONGODB CONFIG ───────────────────────────────────────────────────────────
const uri = `mongodb+srv://infomdfizz655_db_user:mustaFIZ360$@cluster0.bwmefix.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function run() {
  try {
    // ডাটাবেস কানেক্ট না হওয়া পর্যন্ত অপেক্ষা করবে
    await client.connect();
    const db = client.db('driveFleetDB');
    const userCollection = db.collection('users');
    const carCollection = db.collection('cars');
    const bookingCollection = db.collection('bookings');

    console.log('✅ MongoDB Connected Successfully!');

    // ─── AUTH: REGISTER ───────────────────────────────────────────────────────
    app.post('/auth/register', async (req, res) => {
      try {
        const { name, email, photo, password } = req.body;
        if (!name || !email || !password) {
          return res.status(400).send({ message: 'Missing fields' });
        }

        const exists = await userCollection.findOne({ email });
        if (exists) return res.status(400).send({ message: 'Email already exists' });

        const hashed = await bcrypt.hash(password, 12);
        await userCollection.insertOne({ name, email, photo, password: hashed, createdAt: new Date() });

        res.status(201).send({ message: 'Success' });
      } catch (err) {
        console.error('Register Error:', err);
        res.status(500).send({ message: 'Server error during registration' });
      }
    });

    // ─── AUTH: LOGIN ──────────────────────────────────────────────────────────
    app.post('/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;
        const user = await userCollection.findOne({ email });
        if (!user || !user.password) return res.status(401).send({ message: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).send({ message: 'Invalid credentials' });

        const secret = process.env.ACCESS_TOKEN_SECRET || 'fallback_secret';
        const token = jwt.sign({ email: user.email, id: user._id }, secret, { expiresIn: '10h' });

        res.cookie('token', token, {
          httpOnly: true, secure: true, sameSite: 'none', maxAge: 10 * 60 * 60 * 1000,
        }).send({ user: { _id: user._id, name: user.name, email: user.email, photo: user.photo }, token });
      } catch (err) {
        res.status(500).send({ message: 'Login failed' });
      }
    });

    // --- অন্য সব রাউট (Cars, Bookings) এখানে থাকবে ---
    // (সংক্ষিপ্ত করার জন্য আমি শুধু মেইনগুলো দিচ্ছি, আপনার আগের কোড থেকে এগুলো এখানে পেস্ট করে দিন)

    app.get('/cars', async (req, res) => {
      const result = await carCollection.find().toArray();
      res.send(result);
    });

  } finally {
    // কানেকশন খোলা থাকবে
  }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('🚗 API is Live ✓'));

app.listen(port, () => console.log(`🚀 Server on port ${port}`));